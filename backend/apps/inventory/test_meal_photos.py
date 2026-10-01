"""SF73: ảnh suất ăn thực tế — tải/xem/xóa qua API thật (CSRF bật), nén lại JPEG, bỏ EXIF, giới hạn 5 ảnh/ngày."""

import shutil
import tempfile
from datetime import timedelta
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image

from .lunch import open_lunch_day
from .models import AuditLog, LunchDayClose, MealPhoto
from .test_security import CsrfClientMixin, make_user


def anh(fmt="JPEG", size=(3000, 2000), color=(200, 120, 40), exif_gps=False, mode="RGB"):
    buf = BytesIO()
    img = Image.new(mode, size, color if mode == "RGB" else color + (128,))
    kwargs = {}
    if exif_gps:
        exif = Image.Exif()
        exif[0x010F] = "MayChup"  # Make
        exif[0x8825] = {1: "N", 2: (21.0, 1.0, 30.0)}  # GPS
        kwargs["exif"] = exif
    img.save(buf, fmt, **kwargs)
    return buf.getvalue()


class MealPhotoTests(CsrfClientMixin, TestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp(prefix="sf-media-")
        self.override = override_settings(MEDIA_ROOT=self.media)
        self.override.enable()
        self.quan_ly = make_user("ql_anh", "manager")
        self.hieu_truong = make_user("ht_anh", "principal")
        self.ql = self.csrf_client(self.quan_ly)
        self.ht = self.csrf_client(self.hieu_truong)
        self.hom_nay = timezone.localdate()
        open_lunch_day(self.hom_nay)
        self.url = f"/api/lunch-days/{self.hom_nay.isoformat()}/photos/"

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.media, ignore_errors=True)

    def tai(self, client, data=None, name="a.jpg", note="", url=None):
        body = {"note": note}
        body["file"] = SimpleUploadedFile(name, data if data is not None else anh(), content_type="image/jpeg")
        return client.post(url or self.url, body, HTTP_X_CSRFTOKEN=client.csrf)

    def test_tai_anh_nen_lai_jpeg_toi_da_1600_va_bo_exif(self):
        response = self.tai(self.ql, anh(exif_gps=True), note="Cơm trưa lớp 1A")
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual((body["width"], body["height"]), (1600, 1067))
        self.assertEqual(body["note"], "Cơm trưa lớp 1A")
        self.assertEqual(body["uploaded_by"], "ql_anh")
        photo = MealPhoto.objects.get(id=body["id"])
        with photo.image.open("rb") as f, Image.open(f) as saved:
            self.assertEqual(saved.format, "JPEG")
            self.assertEqual(len(saved.getexif()), 0, "EXIF/GPS phải bị bỏ")
        self.assertTrue(AuditLog.objects.filter(action="meal_photo_add", entity_id=str(photo.id)).exists())

    def test_png_trong_suot_va_webp_duoc_nhan(self):
        self.assertEqual(self.tai(self.ql, anh("PNG", (400, 300), mode="RGBA"), name="a.png").status_code, 201)
        self.assertEqual(self.tai(self.ql, anh("WEBP", (400, 300)), name="a.webp").status_code, 201)

    def test_hieu_truong_xem_duoc_anh_nhung_khong_tai_khong_xoa(self):
        photo_id = self.tai(self.ql).json()["id"]
        listing = self.ht.get(self.url).json()
        self.assertEqual([p["id"] for p in listing["results"]], [photo_id])
        self.assertEqual(listing["max"], 5)
        image = self.ht.get(f"/api/meal-photos/{photo_id}/image/")
        self.assertEqual(image.status_code, 200)
        self.assertEqual(image["Content-Type"], "image/jpeg")
        self.assertTrue(image["Content-Disposition"].startswith("inline"))
        self.assertIn("private", image["Cache-Control"])
        self.assertEqual(self.tai(self.ht).status_code, 403)
        self.assertEqual(self.call(self.ht, "DELETE", f"/api/meal-photos/{photo_id}/").status_code, 403)

    def test_chua_dang_nhap_khong_xem_duoc_anh(self):
        photo_id = self.tai(self.ql).json()["id"]
        self.assertEqual(self.csrf_client().get(f"/api/meal-photos/{photo_id}/image/").status_code, 401)

    def test_toi_da_5_anh_mot_ngay(self):
        for _ in range(5):
            self.assertEqual(self.tai(self.ql, anh(size=(200, 200))).status_code, 201)
        response = self.tai(self.ql, anh(size=(200, 200)))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(MealPhoto.objects.count(), 5)

    def test_file_khong_phai_anh_hoac_thieu_file_tra_400(self):
        self.assertEqual(self.tai(self.ql, b"khong phai anh", name="a.jpg").status_code, 400)
        self.assertEqual(self.tai(self.ql, anh("GIF", (50, 50)), name="a.gif").status_code, 400)
        response = self.ql.post(self.url, {"note": "x"}, HTTP_X_CSRFTOKEN=self.ql.csrf)
        self.assertEqual(response.status_code, 400)
        self.assertIn("file", response.json()["errors"])
        response = self.ql.post(self.url, {"note": "x", "khac": "y", "file": SimpleUploadedFile("a.jpg", anh())},
                                HTTP_X_CSRFTOKEN=self.ql.csrf)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(MealPhoto.objects.exists())

    def test_ngay_chua_mo_409_ngay_tuong_lai_400(self):
        hom_qua = self.hom_nay - timedelta(days=1)
        self.assertEqual(self.tai(self.ql, url=f"/api/lunch-days/{hom_qua.isoformat()}/photos/").status_code, 409)
        mai = self.hom_nay + timedelta(days=1)
        open_lunch_day(mai)
        self.assertEqual(self.tai(self.ql, url=f"/api/lunch-days/{mai.isoformat()}/photos/").status_code, 400)
        self.assertFalse(MealPhoto.objects.exists())

    def test_xoa_anh_xoa_ca_file_ngay_da_dong_thi_khoa(self):
        photo_id = self.tai(self.ql).json()["id"]
        photo = MealPhoto.objects.get(id=photo_id)
        storage, name = photo.image.storage, photo.image.name
        self.assertTrue(storage.exists(name))

        close = LunchDayClose.objects.create(lunch_day=photo.lunch_day, closed_by=self.quan_ly, summary={})
        self.assertEqual(self.call(self.ql, "DELETE", f"/api/meal-photos/{photo_id}/").status_code, 409)
        self.assertEqual(self.tai(self.ql).status_code, 409)
        close.reopened_at, close.reopened_by, close.reopen_reason = timezone.now(), self.quan_ly, "thêm ảnh"
        close.save()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.call(self.ql, "DELETE", f"/api/meal-photos/{photo_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(MealPhoto.objects.exists())
        self.assertFalse(storage.exists(name))
        self.assertTrue(AuditLog.objects.filter(action="meal_photo_delete").exists())
        self.assertEqual(self.ql.get(f"/api/meal-photos/{photo_id}/image/").status_code, 404)
