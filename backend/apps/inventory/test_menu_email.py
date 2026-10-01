"""SF74: thư thực đơn kèm ảnh suất ăn thực tế; chỉ gửi khi Quản lý bấm (không tự gửi 06:30); xem trước thư."""

import io
import secrets
import shutil
import tempfile
from datetime import date
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.core import mail
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from PIL import Image

from .lunch import open_lunch_day
from .models import (
    AuditLog,
    Category,
    DayMenuSnapshot,
    Dish,
    FoodItem,
    MealPhoto,
    MenuVersion,
    MenuVersionItem,
    NotificationLog,
    RecipeComponent,
    SchoolClass,
)
from .student_services import create_student
from .test_menus import BAY_GIO, NGAY, dat_ngay_postgres, dong_ho_postgres
from .test_security import CsrfClientMixin, make_user


def jpeg(size=(2000, 1500)):
    buf = BytesIO()
    Image.new("RGB", size, (200, 150, 90)).save(buf, "JPEG")
    return buf.getvalue()


@override_settings(
    TIME_ZONE="Asia/Ho_Chi_Minh", EMAIL_MODE="smtp", EMAIL_DAILY_LIMIT=450, MENU_AUTO_SEND=False,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", SCHOOL_NAME="Trường Tiểu học Hoa Sen",
    PUBLIC_BASE_URL="https://schoolfood.example.test", MENU_SEND_TIME="06:30",
    DEFAULT_FROM_EMAIL="SchoolFood <noreply@example.test>",
)
class ThuThucDonCoAnhTests(CsrfClientMixin, TestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp(prefix="sf-media-")
        self.enterContext(override_settings(MEDIA_ROOT=self.media))
        self.addCleanup(shutil.rmtree, self.media, True)
        self.enterContext(patch("django.utils.timezone.now", return_value=BAY_GIO))
        self.enterContext(dong_ho_postgres(NGAY))
        self.enterContext(override_settings(
            FIELD_ENCRYPTION_KEYS=Fernet.generate_key().decode(), CONTACT_HASH_KEY=secrets.token_hex(32),
        ))
        self.quan_ly = make_user("ql_thu", "manager", email="ql@example.test")
        self.hieu_truong = make_user("ht_thu", "principal")
        self.client = self.csrf_client(self.quan_ly)
        lop = SchoolClass.objects.create(code="1A", name="Lớp 1A", enrolled=30)
        nhom = Category.objects.create(code="TP", name="Thực phẩm")
        thit = FoodItem.objects.create(code="THIT", name="Thịt", unit="kg", category=nhom)
        self.mon = [Dish.objects.create(code=f"M{i}", name=n) for i, n in enumerate(["Cơm trắng", "Thịt kho <trứng>"])]
        for mon in self.mon:
            RecipeComponent.objects.create(dish=mon, food=thit, quantity=Decimal("0.050000"))
        dat_ngay_postgres(date(2026, 9, 27))
        version = MenuVersion.objects.create(effective_from=date(2026, 9, 28), created_by=self.quan_ly)
        MenuVersionItem.objects.bulk_create([MenuVersionItem(version=version, weekday=w, dish=m, position=i)
                                             for w in range(5) for i, m in enumerate(self.mon)])
        dat_ngay_postgres(NGAY)
        create_student("Nguyễn Minh An", lop, ["phuhuynh.an@example.com"], self.quan_ly)
        self.ngay = open_lunch_day(NGAY)

    def them_anh(self, note=""):
        photo = MealPhoto(lunch_day=self.ngay, note=note, width=1600, height=1200, size=1, uploaded_by=self.quan_ly)
        photo.image.save("2026/10/test.jpg", ContentFile(jpeg()), save=False)
        photo.save()
        return photo

    def gui(self, method, url, body=None, status=200, client=None):
        response = self.call(client or self.client, method, url, body)
        self.assertEqual(response.status_code, status, response.content.decode())
        return response.json()

    def chay_scheduler(self, gio=6, phut=31):
        with patch("django.utils.timezone.now", return_value=BAY_GIO.replace(hour=gio, minute=phut)), \
                patch("apps.inventory.management.commands.run_scheduler.close_old_connections"), \
                patch("apps.inventory.management.commands.run_scheduler.signal.signal"):
            call_command("run_scheduler", "--once", stdout=io.StringIO(), stderr=io.StringIO())

    def test_khong_tu_gui_0631_chi_gui_khi_quan_ly_bam(self):
        self.them_anh("Khay cơm lớp 1A")
        self.chay_scheduler(6, 31)
        self.chay_scheduler(11, 0)
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(NotificationLog.objects.exists())

        self.gui("POST", "/api/notifications/send/", {"date": "2026-10-01"}, status=202)
        self.assertTrue(AuditLog.objects.filter(action="email_send").exists())
        self.chay_scheduler(12, 30)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(NotificationLog.objects.get(date=NGAY, email_hash="*").status, "sent")

    def test_thu_co_anh_nhung_inline_va_mau_html(self):
        a = self.them_anh("Khay cơm lớp 1A")
        b = self.them_anh()
        self.gui("POST", "/api/notifications/send/", {"date": "2026-10-01"}, status=202)
        self.chay_scheduler(12, 30)
        msg = mail.outbox[0]
        self.assertEqual(msg.subject, "Thực đơn & hình ảnh bữa trưa Thứ Năm, 01/10/2026")
        self.assertEqual(msg.mixed_subtype, "related")
        html = msg.alternatives[0][0]
        for photo in (a, b):
            self.assertIn(f'src="cid:anh{photo.id}@schoolfood"', html)
        self.assertIn("Khay cơm lớp 1A", html)
        self.assertIn("Nguyễn Minh An", html)
        self.assertIn("Thịt kho &lt;trứng&gt;", html)
        self.assertNotIn("<trứng>", html)
        self.assertIn("Trường Tiểu học Hoa Sen", html)
        self.assertIn("Hủy nhận", html)
        raw = msg.message()
        images = [part for part in raw.walk() if part.get_content_type() == "image/jpeg"]
        self.assertEqual(sorted(p["Content-ID"] for p in images), sorted([f"<anh{a.id}@schoolfood>", f"<anh{b.id}@schoolfood>"]))
        with Image.open(BytesIO(images[0].get_payload(decode=True))) as img:
            self.assertLessEqual(max(img.size), 1040)
        self.assertIn("2 ảnh suất ăn thực tế", msg.body)

    def test_thu_khong_co_anh_van_gui_thuc_don(self):
        self.gui("POST", "/api/notifications/send/", {"date": "2026-10-01"}, status=202)
        self.chay_scheduler(12, 30)
        msg = mail.outbox[0]
        self.assertEqual(msg.subject, "Thực đơn bữa trưa Thứ Năm, 01/10/2026")
        self.assertEqual(msg.attachments, [])
        self.assertNotIn("Hình ảnh suất ăn thực tế", msg.alternatives[0][0])

    def test_bam_gui_ngay_nghi_hoac_chua_co_thuc_don_409(self):
        body = self.gui("POST", "/api/notifications/send/", {"date": "2026-09-27"}, status=409)  # Chủ nhật
        self.assertIn("Ngày nghỉ", body["message"])
        body = self.gui("POST", "/api/notifications/send/", {"date": "2026-09-25"}, status=409)
        self.assertIn("Chưa có thực đơn", body["message"])
        self.assertFalse(NotificationLog.objects.exists())

    def test_xem_truoc_co_anh_data_khong_ghi_gi(self):
        self.them_anh("Khay cơm")
        for client in (self.client, self.csrf_client(self.hieu_truong)):
            body = self.gui("GET", "/api/notifications/preview/?date=2026-10-01", client=client)
            self.assertIsNone(body["problem"])
            self.assertEqual((body["recipients"], body["sample_recipients"], body["photos"]), (1, 0, 1))
            self.assertIn("data:image/jpeg;base64,", body["html"])
            self.assertIn("Thịt kho &lt;trứng&gt;", body["html"])
        self.assertFalse(NotificationLog.objects.exists())
        self.assertFalse(DayMenuSnapshot.objects.exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_xem_truoc_ngay_nghi_bao_ly_do(self):
        body = self.gui("GET", "/api/notifications/preview/?date=2026-10-03")
        self.assertIn("Ngày nghỉ", body["problem"])
        self.assertEqual(body["html"], "")

    def test_hieu_truong_khong_bam_gui_duoc(self):
        self.gui("POST", "/api/notifications/send/", {"date": "2026-10-01"}, status=403,
                 client=self.csrf_client(self.hieu_truong))

    def test_gui_thu_co_anh(self):
        self.them_anh("Khay cơm")
        self.gui("POST", "/api/notifications/test/", {"date": "2026-10-01"})
        self.assertTrue(mail.outbox[0].subject.startswith("[Thử] Thực đơn & hình ảnh"))
        self.assertIn("cid:", mail.outbox[0].alternatives[0][0])
