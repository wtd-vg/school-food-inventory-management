"""API ảnh suất ăn thực tế (SF73). Nghiệp vụ ở meal_photos.py.

GET  /api/lunch-days/<date>/photos/      danh sách ảnh của ngày (Quản lý + Hiệu trưởng)
POST /api/lunch-days/<date>/photos/      multipart: file (bắt buộc), note (≤ 200 ký tự) — chỉ Quản lý
DELETE /api/meal-photos/<id>/            chỉ Quản lý
GET  /api/meal-photos/<id>/image/        file JPEG, cần đăng nhập (không có URL công khai)
"""

from django.db import transaction
from django.http import FileResponse, JsonResponse

from . import audit, meal_photos
from .auth_views import inventory_permission_required
from .http_input import InputError, json_api, method_not_allowed, parse_iso_date
from .models import MealPhoto


def _date(date_str):
    return parse_iso_date(date_str, "date", "Ngày")


@inventory_permission_required
@json_api
def lunch_day_photos(request, date_str):
    day_date = _date(date_str)
    if request.method == "GET":
        rows = (MealPhoto.objects.filter(lunch_day__date=day_date)
                .select_related("lunch_day", "uploaded_by").order_by("id"))
        return JsonResponse({"date": day_date.isoformat(), "max": meal_photos.MAX_MEAL_PHOTOS_PER_DAY,
                             "results": [meal_photos.photo_payload(p) for p in rows]})
    if request.method != "POST":
        return method_not_allowed()
    extra = (set(request.POST) - {"note"}) | (set(request.FILES) - {"file"})
    if extra:
        raise InputError("Chỉ nhận file và note.", {k: "Trường không được hỗ trợ." for k in sorted(extra)})
    upload = request.FILES.get("file")
    if upload is None:
        raise InputError("Hãy chọn hoặc chụp một ảnh.", {"file": "Bắt buộc."})
    note = request.POST.get("note", "").strip()
    if len(note) > 200:
        raise InputError("Ghi chú tối đa 200 ký tự.", {"note": "Tối đa 200 ký tự."})
    with transaction.atomic():
        photo = meal_photos.add_photo(day_date, upload, note, request.user)
        audit.record(request, "meal_photo_add", "meal_photo", photo.id,
                     f"Tải ảnh suất ăn ngày {day_date:%d/%m/%Y}")
    return JsonResponse(meal_photos.photo_payload(photo), status=201)


@inventory_permission_required
@json_api
def meal_photo_detail(request, photo_id):
    if request.method != "DELETE":
        return method_not_allowed()
    with transaction.atomic():
        photo = meal_photos.delete_photo(photo_id)
        audit.record(request, "meal_photo_delete", "meal_photo", photo_id,
                     f"Xóa ảnh suất ăn ngày {photo.lunch_day.date:%d/%m/%Y}")
    return JsonResponse({"ok": True})


@inventory_permission_required
@json_api
def meal_photo_image(request, photo_id):
    if request.method != "GET":
        return method_not_allowed()
    photo = MealPhoto.objects.select_related("lunch_day").get(id=photo_id)
    try:
        handle = photo.image.open("rb")
    except FileNotFoundError:
        raise MealPhoto.DoesNotExist
    response = FileResponse(handle, content_type="image/jpeg",
                            filename=f"suat-an-{photo.lunch_day.date:%Y%m%d}-{photo.id}.jpg")
    response["Cache-Control"] = "private, max-age=86400"
    return response
