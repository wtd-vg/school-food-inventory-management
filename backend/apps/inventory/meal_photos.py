"""SF73: ảnh suất ăn thực tế theo ngày ăn.

- Quản lý tải tối đa MAX_MEAL_PHOTOS_PER_DAY ảnh cho ngày đã mở, không tải cho ngày chưa tới.
- Ảnh được đọc lại bằng Pillow: xoay theo EXIF, đổi sang RGB, thu về cạnh dài ≤ MAX_SIDE, lưu JPEG mới
  (không mang EXIF/GPS của máy chụp). File gốc không được lưu.
- Ngày đã đóng thì không thêm/xóa ảnh (mở lại ngày trước), giống phiếu xuất.
- Khóa LunchDay (select_for_update) khi thêm để hai lần tải cùng lúc không vượt giới hạn.
"""

import uuid
from io import BytesIO

from django.core.files.base import ContentFile
from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError

from .http_input import Conflict, InputError
from .menu_services import today
from .models import MAX_MEAL_PHOTOS_PER_DAY, LunchDay, LunchDayClose, MealPhoto

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 50_000_000  # chặn ảnh "bom giải nén" trước khi giải mã
MAX_SIDE = 1600
JPEG_QUALITY = 82
ALLOWED_FORMATS = {"JPEG", "MPO", "PNG", "WEBP"}


def process_image(upload):
    """File tải lên → (bytes JPEG, rộng, cao). Lỗi định dạng/kích thước → InputError 400."""
    if upload.size > MAX_UPLOAD_BYTES:
        raise InputError("Ảnh quá lớn (tối đa 8 MB).", {"file": "Tối đa 8 MB."})
    try:
        with Image.open(upload) as img:
            if img.format not in ALLOWED_FORMATS:
                raise InputError("Chỉ nhận ảnh JPEG, PNG hoặc WebP.", {"file": "Định dạng không hỗ trợ."})
            if img.width * img.height > MAX_PIXELS:
                raise InputError("Ảnh có độ phân giải quá lớn.", {"file": "Độ phân giải quá lớn."})
            img = ImageOps.exif_transpose(img)
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.getchannel("A"))
                img = background
            else:
                img = img.convert("RGB")
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            out = BytesIO()
            img.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
            return out.getvalue(), img.width, img.height
    except InputError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise InputError("Không đọc được ảnh. Hãy chụp lại hoặc chọn ảnh JPEG/PNG.", {"file": "Không đọc được ảnh."})


def _closed(day):
    return LunchDayClose.objects.filter(lunch_day=day, reopened_at__isnull=True).exists()


def add_photo(day_date, upload, note, user):
    if day_date > today():
        raise InputError("Không tải ảnh cho ngày chưa tới.", {"date": "Ngày chưa tới."})
    data, width, height = process_image(upload)
    with transaction.atomic():
        day = LunchDay.objects.select_for_update(of=("self",)).filter(date=day_date).first()
        if day is None:
            raise Conflict("Ngày chưa được mở. Mở ngày ở Số suất trước khi tải ảnh.")
        if _closed(day):
            raise Conflict("Ngày ăn đã đóng; mở lại ngày để thêm ảnh.")
        if MealPhoto.objects.filter(lunch_day=day).count() >= MAX_MEAL_PHOTOS_PER_DAY:
            raise Conflict(f"Mỗi ngày tối đa {MAX_MEAL_PHOTOS_PER_DAY} ảnh. Xóa bớt ảnh cũ trước.")
        photo = MealPhoto(lunch_day=day, note=note, width=width, height=height, size=len(data), uploaded_by=user)
        name = f"{day_date:%Y/%m}/{day_date:%Y%m%d}-{uuid.uuid4().hex}.jpg"
        photo.image.save(name, ContentFile(data), save=False)
        try:
            photo.save()
        except Exception:
            photo.image.delete(save=False)
            raise
    return photo


def delete_photo(photo_id):
    with transaction.atomic():
        photo = MealPhoto.objects.select_related("lunch_day").get(id=photo_id)
        LunchDay.objects.select_for_update(of=("self",)).get(id=photo.lunch_day_id)
        if _closed(photo.lunch_day):
            raise Conflict("Ngày ăn đã đóng; mở lại ngày để xóa ảnh.")
        storage, name = photo.image.storage, photo.image.name
        photo.delete()
        # Xóa file sau khi DB đã commit: rollback thì ảnh vẫn còn đủ.
        transaction.on_commit(lambda: storage.delete(name))
    return photo


def photo_payload(photo):
    return {
        "id": photo.id,
        "date": photo.lunch_day.date.isoformat(),
        "note": photo.note,
        "width": photo.width,
        "height": photo.height,
        "size": photo.size,
        "uploaded_by": photo.uploaded_by.get_username(),
        "created_at": photo.created_at.isoformat(),
        "url": f"/api/meal-photos/{photo.id}/image/",
    }
