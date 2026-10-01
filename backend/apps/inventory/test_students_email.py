"""BE-04/08/14: email mã hóa, import học sinh, gửi thư riêng và hủy nhận."""

import csv
import io
import json
import secrets
import smtplib
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core import signing
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.test import Client, TestCase, TransactionTestCase, override_settings

from . import mailer, notifications
from .crypto_fields import contact_hash, decrypt, encrypt
from .models import (
    AuditLog, Category, DayMenuSnapshot, Dish, FoodItem, MenuVersion,
    MenuVersionItem, NotificationLog, ParentContact, RecipeComponent, SchoolClass,
    SchoolHoliday, Student,
)
from .test_menus import BAY_GIO, NGAY, dat_ngay_postgres, dong_ho_postgres
from .test_security import CsrfClientMixin, make_user


@override_settings(
    TIME_ZONE="Asia/Ho_Chi_Minh", EMAIL_MODE="dry_run", EMAIL_DAILY_LIMIT=450,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PUBLIC_BASE_URL="https://schoolfood.example.test", MENU_SEND_TIME="06:30",
    DEFAULT_FROM_EMAIL="SchoolFood <noreply@example.test>",
)
class HocSinhEmailTests(CsrfClientMixin, TestCase):
    def setUp(self):
        self.enterContext(patch("django.utils.timezone.now", return_value=BAY_GIO))
        self.enterContext(dong_ho_postgres(NGAY))
        # Khóa sinh riêng mỗi test, không đọc cấu hình bí mật hoặc ghi khóa ra log.
        self.enterContext(override_settings(
            FIELD_ENCRYPTION_KEYS=Fernet.generate_key().decode(), CONTACT_HASH_KEY=secrets.token_hex(32),
        ))
        self.quan_ly = make_user("quan_ly_hoc_sinh", "manager")
        self.hieu_truong = make_user("hieu_truong_hoc_sinh", "principal")
        self.client = self.csrf_client(self.quan_ly)
        self.lop = SchoolClass.objects.create(code="1A", name="Lớp 1A", enrolled=30)

    def gui(self, method, url, body=None, status=200):
        response = self.call(self.client, method, url, body)
        self.assertEqual(response.status_code, status, response.content.decode())
        return response.json()

    def tao_hoc_sinh(self, ten="Bé An", emails=("phuhuynh.a@example.com",)):
        body = self.gui("POST", "/api/students/", {
            "full_name": ten, "class_id": self.lop.id,
            "contacts": [{"email": email, "consent": True} for email in emails],
        }, status=201)
        return Student.objects.get(pk=body["id"])

    def nhap_csv(self, rows=None, dry_run=False, raw=None):
        if raw is None:
            text = io.StringIO(newline="")
            writer = csv.writer(text)
            writer.writerow(["ho_ten", "ma_lop", "email_1", "email_2", "da_dong_y"])
            writer.writerows(rows or [])
            raw = text.getvalue().encode("utf-8-sig")
        upload = SimpleUploadedFile("hoc_sinh.csv", raw, content_type="text/csv")
        return self.client.post(
            "/api/students/import/" + ("?dry_run=1" if dry_run else ""),
            {"file": upload}, HTTP_X_CSRFTOKEN=self.client.csrf,
        )

    def tao_thuc_don(self):
        nhom = Category.objects.create(code="THUC_PHAM", name="Thực phẩm")
        thit = FoodItem.objects.create(code="THIT", name="Thịt", unit="kg", category=nhom)
        mon = Dish.objects.create(code="THIT_KHO", name="Thịt kho")
        RecipeComponent.objects.create(dish=mon, food=thit, quantity=Decimal("0.060000"))
        dat_ngay_postgres(date(2026, 9, 27))
        version = MenuVersion.objects.create(effective_from=date(2026, 9, 28), created_by=self.quan_ly)
        MenuVersionItem.objects.bulk_create([
            MenuVersionItem(version=version, weekday=w, dish=mon) for w in range(5)
        ])
        dat_ngay_postgres(NGAY)

    def nhat_ky_nguoi_nhan(self, ngay=NGAY):
        return NotificationLog.objects.filter(date=ngay).exclude(email_hash=notifications.SUMMARY)

    def test_tao_email_ma_hoa_hash_hint_va_chuan_hoa(self):
        hoc_sinh = self.tao_hoc_sinh(emails=("PhuHuynh.A@Example.com",))
        contact = hoc_sinh.contacts.get()
        # Đọc cột thật để tránh chỉ kiểm tra dữ liệu đã xử lý qua model/property.
        with connection.cursor() as cursor:
            cursor.execute("SELECT email_encrypted FROM inventory_parentcontact WHERE id = %s", [contact.id])
            ciphertext = cursor.fetchone()[0]
        self.assertNotIn("@", ciphertext)
        self.assertNotIn("phuhuynh.a@example.com", ciphertext.lower())
        self.assertRegex(contact.email_hash, r"^[0-9a-f]{64}$")
        self.assertEqual(contact.email_hash, contact_hash("phuhuynh.a@example.com"))
        self.assertEqual(contact.email_hint, "ph•••@example.com")
        self.assertEqual(decrypt(ciphertext), "phuhuynh.a@example.com")
        self.assertEqual(contact.consent_at, BAY_GIO)

    def test_tu_choi_khong_dong_y_ba_email_va_email_sai(self):
        for contacts in [
            [{"email": "phuhuynh.a@example.com", "consent": False}],
            [{"email": f"phuhuynh{i}@example.test", "consent": True} for i in range(3)],
            [{"email": "khong-phai-email", "consent": True}],
        ]:
            with self.subTest(contacts=contacts):
                self.gui("POST", "/api/students/", {
                    "full_name": "Bé An", "class_id": self.lop.id, "contacts": contacts,
                }, status=400)
                self.assertFalse(Student.objects.exists())
                self.assertFalse(ParentContact.objects.exists())
                self.assertFalse(AuditLog.objects.filter(action="student_create").exists())

    def test_danh_sach_chi_hien_email_da_che(self):
        self.tao_hoc_sinh()
        for user in (self.quan_ly, self.hieu_truong):
            with self.subTest(vai_tro=user.username):
                self.client = self.csrf_client(user)
                body = self.gui("GET", f"/api/students/?class={self.lop.id}")
                self.assertEqual(len(body["results"]), 1)
                contact = body["results"][0]["contacts"][0]
                self.assertEqual(contact["email_hint"], "ph•••@example.com")
                self.assertEqual(set(contact), {"id", "email_hint", "consent_at", "unsubscribed_at"})
                self.assertNotIn("phuhuynh.a@example.com", json.dumps(body).lower())

    def test_quan_ly_xem_email_co_audit_khong_chua_email(self):
        contact = self.tao_hoc_sinh().contacts.get()
        body = self.gui("POST", f"/api/parent-contacts/{contact.id}/reveal/")
        self.assertEqual(body["email"], "phuhuynh.a@example.com")
        audit = AuditLog.objects.get(action="contact_reveal")
        self.assertEqual(audit.entity_id, str(contact.id))
        self.assertEqual(audit.actor_id, self.quan_ly.id)
        self.assertNotIn(body["email"], json.dumps(AuditLog.objects.filter(pk=audit.pk).values().get(), default=str))

    def test_hieu_truong_khong_duoc_xem_email_day_du(self):
        contact = self.tao_hoc_sinh().contacts.get()
        self.client = self.csrf_client(self.hieu_truong)
        self.gui("POST", f"/api/parent-contacts/{contact.id}/reveal/", status=403)
        self.assertFalse(AuditLog.objects.filter(action="contact_reveal").exists())

    def test_xoa_hoc_sinh_xoa_lien_he_audit_khong_chua_ten_be(self):
        hoc_sinh = self.tao_hoc_sinh(emails=("phuhuynh.a@example.com", "phuhuynh.b@example.test"))
        self.gui("DELETE", f"/api/students/{hoc_sinh.id}/")
        self.assertFalse(Student.objects.filter(pk=hoc_sinh.pk).exists())
        self.assertFalse(ParentContact.objects.exists())
        audit = AuditLog.objects.get(action="student_delete")
        self.assertEqual(audit.entity_id, str(hoc_sinh.id))
        self.assertIn(self.lop.code, audit.summary)
        text = json.dumps(AuditLog.objects.filter(pk=audit.pk).values().get(), ensure_ascii=False, default=str)
        for rieng_tu in (hoc_sinh.full_name, "phuhuynh.a@example.com", "phuhuynh.b@example.test"):
            self.assertNotIn(rieng_tu, text)

    def test_csv_bom_dry_run_khong_ghi_sau_do_luu_du_dong(self):
        rows = [["Bé An", "1A", "phuhuynh.a@example.com", "", "co"],
                ["Bé Bình", "1A", "phuhuynh.b@example.test", "phuhuynh.c@example.test", "co"]]
        response = self.nhap_csv(rows, dry_run=True)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["saved"])
        self.assertEqual(response.json()["summary"]["ok"], 2)
        self.assertEqual([r["line"] for r in response.json()["rows"]], [2, 3])
        self.assertFalse(Student.objects.exists())
        self.assertFalse(ParentContact.objects.exists())
        self.assertFalse(AuditLog.objects.filter(action="student_import").exists())
        response = self.nhap_csv(rows)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["saved"])
        self.assertEqual(response.json()["summary"], {"rows": 2, "ok": 2, "errors": 0, "with_email": 2})
        self.assertEqual(Student.objects.count(), 2)
        self.assertEqual(ParentContact.objects.count(), 3)
        self.assertEqual(set(Student.objects.values_list("full_name", flat=True)), {"Bé An", "Bé Bình"})
        self.assertEqual(AuditLog.objects.filter(action="student_import").count(), 1)

    def test_csv_email_sai_bao_dung_dong_va_khong_ghi_bat_ky_dong_nao(self):
        for vi_tri_loi in (0, 1):
            with self.subTest(dong=vi_tri_loi + 2):
                rows = [["Bé An", "1A", "phuhuynh.a@example.com", "", "co"],
                        ["Bé Bình", "1A", "phuhuynh.b@example.test", "", "co"]]
                rows[vi_tri_loi][2] = "email-sai"
                response = self.nhap_csv(rows)
                self.assertEqual(response.status_code, 400)
                body = response.json()
                self.assertFalse(body["saved"])
                self.assertEqual(body["summary"]["errors"], 1)
                loi = [r for r in body["rows"] if r["status"] == "error"]
                self.assertEqual([r["line"] for r in loi], [vi_tri_loi + 2])
                self.assertIn("email_1", loi[0]["errors"])
                self.assertFalse(Student.objects.exists())
                self.assertFalse(ParentContact.objects.exists())
                self.assertFalse(AuditLog.objects.filter(action="student_import").exists())

    def test_csv_khong_dong_y_chi_luu_hoc_sinh(self):
        response = self.nhap_csv([["Bé An", "1A", "phuhuynh.a@example.com", "", "khong"]])
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["saved"])
        self.assertEqual(Student.objects.get().full_name, "Bé An")
        self.assertFalse(ParentContact.objects.exists())

    def test_csv_ma_lop_sai_bao_loi_dong(self):
        response = self.nhap_csv([["Bé An", "KHONG_CO", "phuhuynh.a@example.com", "", "co"]])
        self.assertEqual(response.status_code, 400)
        row = response.json()["rows"][0]
        self.assertEqual((row["line"], row["status"]), (2, "error"))
        self.assertIn("ma_lop", row["errors"])
        self.assertFalse(Student.objects.exists())

    def test_csv_thieu_cot_tra_400(self):
        response = self.nhap_csv(raw="ho_ten,email_1\nBé An,phuhuynh.a@example.com\n".encode("utf-8-sig"))
        self.assertEqual(response.status_code, 400)
        self.assertIn("thiếu cột", response.json()["message"])
        self.assertFalse(Student.objects.exists())

    def test_csv_lon_hon_mot_mb_tra_400(self):
        response = self.nhap_csv(raw=b"x" * (1024 * 1024 + 1))
        self.assertEqual(response.status_code, 400)
        self.assertIn("1 MB", response.json()["message"])
        self.assertFalse(Student.objects.exists())

    def test_dry_run_ghi_log_khong_gui_thu_va_khong_lap(self):
        self.tao_thuc_don()
        contact = self.tao_hoc_sinh().contacts.get()
        stats = notifications.send_daily_menu(NGAY)
        self.assertEqual(stats["dry_run"], 1)
        self.assertEqual(self.nhat_ky_nguoi_nhan().get().email_hash, contact.email_hash)
        self.assertEqual(self.nhat_ky_nguoi_nhan().get().status, "dry_run")
        self.assertEqual(NotificationLog.objects.get(date=NGAY, email_hash="*").status, "dry_run")
        self.assertEqual(len(mail.outbox), 0)
        self.assertTrue(DayMenuSnapshot.objects.filter(date=NGAY).exists())
        self.assertEqual(notifications.send_daily_menu(NGAY)["already"], 1)
        self.assertEqual(self.nhat_ky_nguoi_nhan().count(), 1)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(EMAIL_MODE="smtp")
    def test_smtp_moi_email_mot_thu_gom_hai_be_va_giu_rieng_tu(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh("Bé An")
        self.tao_hoc_sinh("Bé Bình", ("PHUHUYNH.A@EXAMPLE.COM",))
        self.tao_hoc_sinh("Bé Chi", ("phuhuynh.khac@example.test",))
        stats = notifications.send_daily_menu(NGAY)
        self.assertEqual(stats["sent"], 2)
        self.assertEqual(len(mail.outbox), 2)
        thu_theo_email = {m.to[0]: m for m in mail.outbox}
        self.assertEqual(set(thu_theo_email), {"phuhuynh.a@example.com", "phuhuynh.khac@example.test"})
        for email, ten_be, ten_nguoi_khac, email_khac in [
            ("phuhuynh.a@example.com", ["Bé An", "Bé Bình"], ["Bé Chi"], "phuhuynh.khac@example.test"),
            ("phuhuynh.khac@example.test", ["Bé Chi"], ["Bé An", "Bé Bình"], "phuhuynh.a@example.com"),
        ]:
            with self.subTest(nguoi_nhan=email):
                thu = thu_theo_email[email]
                self.assertEqual(thu.to, [email])
                self.assertEqual((thu.cc, thu.bcc), ([], []))
                self.assertIn("List-Unsubscribe", thu.extra_headers)
                self.assertEqual(thu.extra_headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click")
                self.assertEqual(len(thu.alternatives), 1)
                for noi_dung in [thu.body, thu.alternatives[0].content]:
                    self.assertIn("Thịt kho", noi_dung)
                    for ten in ten_be:
                        self.assertIn(ten, noi_dung)
                    for ten in ten_nguoi_khac:
                        self.assertNotIn(ten, noi_dung)
                    self.assertNotIn(email_khac, noi_dung)
                entry = self.nhat_ky_nguoi_nhan().get(email_hash=contact_hash(email))
                self.assertEqual((entry.status, entry.student_count, entry.attempts), ("sent", len(ten_be), 1))
        self.assertEqual(notifications.send_daily_menu(NGAY)["already"], 2)
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(self.nhat_ky_nguoi_nhan().count(), 2)
        self.assertEqual(list(self.nhat_ky_nguoi_nhan().values_list("attempts", flat=True)), [1, 1])

    @override_settings(EMAIL_MODE="smtp")
    def test_hai_hoc_sinh_trung_ten_cung_email_van_dem_hai_be(self):
        """BUG? recipients() gộp theo full_name khiến hai bé khác lớp chỉ được đếm là một."""
        self.tao_thuc_don()
        be_mot = self.tao_hoc_sinh("Nguyễn Minh Anh")
        self.lop = SchoolClass.objects.create(code="2A", name="Lớp 2A", enrolled=30)
        be_hai = self.tao_hoc_sinh("Nguyễn Minh Anh")
        self.assertNotEqual(be_mot.pk, be_hai.pk)
        self.assertNotEqual(be_mot.school_class_id, be_hai.school_class_id)
        self.assertEqual(notifications.send_daily_menu(NGAY)["sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self.nhat_ky_nguoi_nhan().get().student_count, 2)

    @override_settings(EMAIL_MODE="smtp")
    def test_chu_nhat_va_ngay_le_khong_gui_co_dong_tong_skipped(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        SchoolHoliday.objects.create(date=NGAY, name="Nghỉ lễ", created_by=self.quan_ly)
        for ngay in (NGAY, date(2026, 10, 4)):
            with self.subTest(ngay=ngay):
                with patch("django.utils.timezone.now", return_value=BAY_GIO.replace(day=ngay.day)):
                    stats = notifications.send_daily_menu(ngay)
                self.assertEqual(stats["skipped"], 1)
                self.assertEqual(NotificationLog.objects.get(date=ngay, email_hash="*").status, "skipped")
                self.assertFalse(self.nhat_ky_nguoi_nhan(ngay).exists())
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(DayMenuSnapshot.objects.exists())

    @override_settings(EMAIL_MODE="smtp")
    def test_bo_qua_lien_he_huy_nhan_va_hoc_sinh_ngung_hoc(self):
        self.tao_thuc_don()
        huy = self.tao_hoc_sinh("Bé An").contacts.get()
        huy.unsubscribed_at = BAY_GIO
        huy.save(update_fields=["unsubscribed_at"])
        nghi = self.tao_hoc_sinh("Bé Bình", ("nghi@example.test",))
        nghi.is_active = False
        nghi.save(update_fields=["is_active"])
        self.tao_hoc_sinh("Bé Chi", ("danghoc@example.test",))
        self.assertEqual(notifications.send_daily_menu(NGAY)["sent"], 1)
        self.assertEqual([m.to for m in mail.outbox], [["danghoc@example.test"]])
        self.assertEqual(self.nhat_ky_nguoi_nhan().count(), 1)
        self.assertEqual(self.nhat_ky_nguoi_nhan().get().email_hash, contact_hash("danghoc@example.test"))

    @override_settings(EMAIL_MODE="smtp", EMAIL_DAILY_LIMIT=1)
    def test_han_muc_mot_thu_voi_hai_nguoi_nhan(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        self.tao_hoc_sinh("Bé Bình", ("phuhuynh.b@example.test",))
        stats = notifications.send_daily_menu(NGAY)
        self.assertEqual((stats["sent"], stats["failed"]), (1, 1))
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self.nhat_ky_nguoi_nhan().filter(status="sent").count(), 1)
        self.assertIn("hạn mức", self.nhat_ky_nguoi_nhan().get(status="failed").error)
        notifications.send_daily_menu(NGAY)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(EMAIL_MODE="smtp")
    def test_loi_smtp_failed_khong_lo_email(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        with patch("django.core.mail.EmailMultiAlternatives.send", side_effect=smtplib.SMTPRecipientsRefused({})) as send:
            stats = notifications.send_daily_menu(NGAY)
        send.assert_called_once()
        self.assertEqual(stats["failed"], 1)
        entry = self.nhat_ky_nguoi_nhan().get()
        self.assertEqual((entry.status, entry.attempts), ("failed", 1))
        self.assertIn("SMTPRecipientsRefused", entry.error)
        self.assertNotIn("phuhuynh.a@example.com", entry.error)
        self.assertNotIn("@", entry.error)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(EMAIL_MODE="smtp")
    def test_loi_smtp_co_dia_chi_cung_duoc_che(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        loi = smtplib.SMTPRecipientsRefused({"phuhuynh.a@example.com": (550, b"Recipient refused")})
        with patch("django.core.mail.EmailMultiAlternatives.send", side_effect=loi):
            notifications.send_daily_menu(NGAY)
        entry = self.nhat_ky_nguoi_nhan().get()
        self.assertEqual(entry.status, "failed")
        self.assertNotIn("phuhuynh.a@example.com", entry.error)
        self.assertNotIn("@", entry.error)

    def test_huy_nhan_cong_khai_khong_csrf_ap_dung_moi_contact_cung_email(self):
        contact = self.tao_hoc_sinh().contacts.get()
        self.tao_hoc_sinh("Bé Bình")
        khac = self.tao_hoc_sinh("Bé Chi", ("phuhuynh.khac@example.test",)).contacts.get()
        token = mailer.unsubscribe_token(contact.email_hash)
        client = Client(enforce_csrf_checks=True)
        url = f"/api/unsubscribe/{token}/"
        for _ in range(2):
            response = client.post(url)
            self.assertEqual(response.status_code, 200)
            self.assertNotIn("phuhuynh.a@example.com", response.content.decode())
            self.assertEqual(ParentContact.objects.filter(email_hash=contact.email_hash, unsubscribed_at=BAY_GIO).count(), 2)
        khac.refresh_from_db()
        self.assertIsNone(khac.unsubscribed_at)
        self.assertEqual(AuditLog.objects.filter(action="email_unsubscribe").count(), 1)

    def test_huy_nhan_token_gia_400_get_405_khong_doi_lien_he(self):
        contact = self.tao_hoc_sinh().contacts.get()
        client = Client(enforce_csrf_checks=True)
        token = mailer.unsubscribe_token(contact.email_hash)
        self.assertEqual(client.get(f"/api/unsubscribe/{token}/").status_code, 405)
        self.assertEqual(client.post("/api/unsubscribe/token-gia/").status_code, 400)
        contact.refresh_from_db()
        self.assertIsNone(contact.unsubscribed_at)

    def test_api_nhat_ky_tra_mode_summary_results_khong_lo_email(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        notifications.send_daily_menu(NGAY)
        for user in (self.quan_ly, self.hieu_truong):
            with self.subTest(vai_tro=user.username):
                self.client = self.csrf_client(user)
                body = self.gui("GET", "/api/notifications/?date=2026-10-01")
                self.assertEqual(body["mode"], "dry_run")
                self.assertEqual(body["summary"]["status"], "dry_run")
                self.assertEqual(body["summary"]["recipients"], 1)
                self.assertEqual(len(body["results"]), 1)
                self.assertEqual(body["results"][0]["email_hint"], "ph•••@example.com")
                self.assertNotIn("phuhuynh.a@example.com", json.dumps(body).lower())

    def test_api_gui_lai_202_chuyen_dong_tong_pending(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        notifications.send_daily_menu(NGAY)
        self.gui("POST", "/api/notifications/send/", {"date": "2026-10-01"}, status=202)
        self.assertEqual(NotificationLog.objects.get(date=NGAY, email_hash="*").status, "pending")
        self.assertEqual(self.nhat_ky_nguoi_nhan().get().status, "dry_run")
        self.assertEqual(len(mail.outbox), 0)

    def test_api_gui_ngay_tuong_lai_400_hieu_truong_403(self):
        self.gui("POST", "/api/notifications/send/", {"date": "2026-10-02"}, status=400)
        self.client = self.csrf_client(self.hieu_truong)
        self.gui("POST", "/api/notifications/send/", {"date": "2026-10-01"}, status=403)
        self.assertFalse(NotificationLog.objects.exists())

    def chay_scheduler(self, gio, phut):
        stdout, stderr = io.StringIO(), io.StringIO()
        # Scheduler không được đóng connection thuộc transaction của TestCase hoặc đổi signal toàn runner.
        with patch("django.utils.timezone.now", return_value=BAY_GIO.replace(hour=gio, minute=phut)), \
                patch("apps.inventory.management.commands.run_scheduler.close_old_connections"), \
                patch("apps.inventory.management.commands.run_scheduler.signal.signal"):
            call_command("run_scheduler", "--once", stdout=stdout, stderr=stderr)
        self.assertEqual(stderr.getvalue(), "")

    @override_settings(EMAIL_MODE="smtp")
    def test_scheduler_0629_chua_gui_0631_gui_va_khong_gui_lap(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        self.chay_scheduler(6, 29)
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(NotificationLog.objects.exists())
        self.chay_scheduler(6, 31)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(NotificationLog.objects.get(date=NGAY, email_hash="*").status, "sent")
        self.chay_scheduler(6, 32)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(EMAIL_MODE="smtp")
    def test_scheduler_gui_lai_dong_pending_hom_qua(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        hom_qua = date(2026, 9, 30)
        NotificationLog.objects.create(date=hom_qua, email_hash="*", status="pending")
        self.chay_scheduler(6, 29)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("30/09/2026", mail.outbox[0].subject)
        self.assertEqual(NotificationLog.objects.get(date=hom_qua, email_hash="*").status, "sent")
        self.assertEqual(self.nhat_ky_nguoi_nhan(hom_qua).get().status, "sent")
        self.assertFalse(NotificationLog.objects.filter(date=NGAY).exists())

    def test_lenh_send_daily_menu_dung_ngay_mac_dinh(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        stdout = io.StringIO()
        call_command("send_daily_menu", stdout=stdout)
        self.assertIn("2026-10-01", stdout.getvalue())
        self.assertIn("dry_run=1", stdout.getvalue())
        self.assertEqual(self.nhat_ky_nguoi_nhan().get().status, "dry_run")
        self.assertEqual(len(mail.outbox), 0)

    # --- Bổ sung BE-04/08/14 ---

    def quet_db_tim_email(self, *emails):
        """Quét toàn bộ dòng (dạng JSON) của các bảng liên quan: không được có '@' hay email rõ."""
        with connection.cursor() as cursor:
            for bang in ("inventory_parentcontact", "inventory_notificationlog", "inventory_student"):
                with self.subTest(bang=bang):
                    cursor.execute(f"SELECT row_to_json(t)::text FROM {bang} t")
                    for (dong,) in cursor.fetchall():
                        # email_hint có dạng "ph•••@example.com": chỉ còn 2 ký tự đầu, không phải email đầy đủ.
                        du_lieu = json.loads(dong)
                        du_lieu.pop("email_hint", None)
                        text = json.dumps(du_lieu, ensure_ascii=False).lower()
                        self.assertNotIn("@", text)
                        for email in emails:
                            self.assertNotIn(email.lower(), text)
            cursor.execute("SELECT row_to_json(t)::text FROM inventory_auditlog t")
            text = " ".join(r[0] for r in cursor.fetchall()).lower()
            for email in emails:
                self.assertNotIn(email.lower(), text)

    @override_settings(EMAIL_MODE="smtp")
    def test_db_khong_chua_email_ro_sau_tao_nhap_sua_va_gui(self):
        self.tao_thuc_don()
        hoc_sinh = self.tao_hoc_sinh("Bé An", ("phuhuynh.a@example.com",))
        self.gui("PATCH", f"/api/students/{hoc_sinh.id}/", {
            "contacts": [{"email": "phuhuynh.a@example.com", "consent": True},
                         {"email": "me.be.an@example.test", "consent": True}],
        })
        self.assertEqual(self.nhap_csv([["Bé Bình", "1A", "phuhuynh.b@example.test", "", "co"]]).status_code, 200)
        notifications.send_daily_menu(NGAY)
        self.assertEqual(len(mail.outbox), 3)
        self.quet_db_tim_email("phuhuynh.a@example.com", "me.be.an@example.test", "phuhuynh.b@example.test")

    def test_db_chan_luu_email_ro(self):
        hoc_sinh = self.tao_hoc_sinh(emails=())
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ParentContact.objects.create(
                    student=hoc_sinh, email_encrypted="phuhuynh.a@example.com",
                    email_hash=contact_hash("phuhuynh.a@example.com"), email_hint="ph•••@example.com",
                    consent_at=BAY_GIO, created_by=self.quan_ly,
                )
        self.assertFalse(ParentContact.objects.exists())

    def test_xoay_khoa_van_doc_duoc_ban_cu(self):
        from django.conf import settings

        khoa_cu = settings.FIELD_ENCRYPTION_KEYS
        contact = self.tao_hoc_sinh().contacts.get()
        khoa_moi = Fernet.generate_key().decode()
        with override_settings(FIELD_ENCRYPTION_KEYS=f"{khoa_moi},{khoa_cu}"):
            self.assertEqual(decrypt(contact.email_encrypted), "phuhuynh.a@example.com")
            ban_moi = encrypt("phuhuynh.a@example.com")
            body = self.gui("POST", f"/api/parent-contacts/{contact.id}/reveal/")
            self.assertEqual(body["email"], "phuhuynh.a@example.com")
        # Bản mã bằng khóa mới không đọc được nếu chỉ còn khóa cũ.
        with self.assertRaises(ValueError):
            decrypt(ban_moi)

    def test_hieu_truong_moi_thao_tac_ghi_hoc_sinh_va_thu_tra_403(self):
        self.tao_thuc_don()
        hoc_sinh = self.tao_hoc_sinh()
        self.hieu_truong.email = "hieutruong@example.test"
        self.hieu_truong.save(update_fields=["email"])
        self.client = self.csrf_client(self.hieu_truong)
        truoc = (Student.objects.count(), ParentContact.objects.count(), NotificationLog.objects.count(),
                 AuditLog.objects.count())
        for method, url, body in [
            ("POST", "/api/students/", {"full_name": "Bé Mới", "class_id": self.lop.id, "contacts": []}),
            ("PATCH", f"/api/students/{hoc_sinh.id}/", {"full_name": "Đổi tên"}),
            ("DELETE", f"/api/students/{hoc_sinh.id}/", None),
            ("POST", "/api/notifications/send/", {"date": "2026-10-01"}),
            ("POST", "/api/notifications/test/", {"date": "2026-10-01"}),
        ]:
            with self.subTest(method=method, url=url):
                self.gui(method, url, body, status=403)
        self.assertEqual(self.nhap_csv([["Bé Bình", "1A", "", "", "khong"]]).status_code, 403)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(Student.objects.get().full_name, "Bé An")
        self.assertEqual((Student.objects.count(), ParentContact.objects.count(), NotificationLog.objects.count(),
                          AuditLog.objects.count()), truoc)

    def test_chua_dang_nhap_tra_401_tru_huy_nhan(self):
        # Có CSRF hợp lệ nhưng chưa đăng nhập → 401 (thiếu CSRF thì middleware trả 403 trước).
        client = self.csrf_client()
        for method, url in [("GET", "/api/students/"), ("GET", "/api/notifications/"),
                            ("POST", "/api/students/"), ("POST", "/api/parent-contacts/1/reveal/"),
                            ("POST", "/api/students/import/"), ("POST", "/api/notifications/send/")]:
            with self.subTest(method=method, url=url):
                self.assertEqual(self.call(client, method, url, {}).status_code, 401)
        self.assertFalse(Student.objects.exists())

    def test_csv_dry_run_co_loi_tra_200_khong_ghi(self):
        rows = [["Bé An", "1A", "phuhuynh.a@example.com", "", "co"],
                ["", "1A", "", "", "co"],
                ["Bé Chi", "1A", "", "", "co"],
                ["Bé Dũng", "1A", "", "", "chua_ro"]]
        response = self.nhap_csv(rows, dry_run=True)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["saved"])
        self.assertEqual(body["summary"], {"rows": 4, "ok": 1, "errors": 3, "with_email": 1})
        loi = {r["line"]: r["errors"] for r in body["rows"] if r["status"] == "error"}
        self.assertIn("ho_ten", loi[3])
        self.assertIn("email_1", loi[4])  # đồng ý nhưng không có email
        self.assertIn("da_dong_y", loi[5])
        self.assertFalse(Student.objects.exists())

    def test_csv_trung_trong_file_va_trung_db_bi_chan(self):
        self.tao_hoc_sinh("Bé An", ())
        response = self.nhap_csv([["bé an", "1A", "", "", "khong"],
                                  ["Bé Bình", "1A", "", "", "khong"],
                                  ["Bé Bình", "1a", "", "", "khong"]])
        self.assertEqual(response.status_code, 400)
        loi = {r["line"]: r["errors"] for r in response.json()["rows"] if r["status"] == "error"}
        self.assertEqual(set(loi), {2, 4})
        self.assertEqual(Student.objects.count(), 1)

    @override_settings(EMAIL_MODE="smtp")
    def test_thu_bay_skipped_khong_gui(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        thu_bay = date(2026, 10, 3)
        with patch("django.utils.timezone.now", return_value=BAY_GIO.replace(day=3)):
            stats = notifications.send_daily_menu(thu_bay)
        self.assertEqual(stats, {"sent": 0, "dry_run": 0, "failed": 0, "skipped": 1, "already": 0})
        self.assertEqual(NotificationLog.objects.get(date=thu_bay).status, "skipped")
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(EMAIL_MODE="smtp")
    def test_sai_app_password_dung_ca_dot(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        self.tao_hoc_sinh("Bé Bình", ("phuhuynh.b@example.test",))
        loi = smtplib.SMTPAuthenticationError(535, b"Username and Password not accepted")
        with patch("django.core.mail.EmailMultiAlternatives.send", side_effect=loi) as send:
            stats = notifications.send_daily_menu(NGAY)
        send.assert_called_once()
        self.assertEqual(stats["failed"], 2)
        self.assertEqual(set(self.nhat_ky_nguoi_nhan().values_list("status", flat=True)), {"failed"})
        tong = NotificationLog.objects.get(date=NGAY, email_hash="*")
        self.assertEqual(tong.status, "failed")
        self.assertIn("App Password", tong.error)

    @override_settings(EMAIL_MODE="smtp")
    def test_lien_ket_huy_nhan_trong_thu_hoat_dong_va_hom_sau_khong_gui(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        notifications.send_daily_menu(NGAY)
        thu = mail.outbox[0]
        duong_dan = thu.extra_headers["List-Unsubscribe"].strip("<>")
        self.assertTrue(duong_dan.startswith("https://schoolfood.example.test/api/unsubscribe/"))
        token = duong_dan.rstrip("/").rsplit("/", 1)[1]
        self.assertIn(f"https://schoolfood.example.test/huy-nhan/{token}", thu.body)
        response = Client(enforce_csrf_checks=True).post(f"/api/unsubscribe/{token}/")
        self.assertEqual(response.status_code, 200)
        audit = AuditLog.objects.get(action="email_unsubscribe")
        self.assertIsNone(audit.actor_id)
        ngay_mai = date(2026, 10, 2)
        with patch("django.utils.timezone.now", return_value=BAY_GIO.replace(day=2)):
            stats = notifications.send_daily_menu(ngay_mai)
        self.assertEqual(stats["sent"], 0)
        self.assertEqual(len(mail.outbox), 1)
        self.assertFalse(self.nhat_ky_nguoi_nhan(ngay_mai).exists())

    def test_huy_nhan_token_sai_salt_hoac_noi_dung_tra_400(self):
        contact = self.tao_hoc_sinh().contacts.get()
        client = Client(enforce_csrf_checks=True)
        for token in [signing.dumps({"h": contact.email_hash}, salt="salt-khac"),
                      signing.dumps({"h": "ngan"}, salt=mailer.UNSUBSCRIBE_SALT),
                      signing.dumps(["khong-phai-object"], salt=mailer.UNSUBSCRIBE_SALT)]:
            with self.subTest(token=token[:20]):
                response = client.post(f"/api/unsubscribe/{token}/")
                self.assertEqual(response.status_code, 400)
                self.assertIn("message", response.json())
        contact.refresh_from_db()
        self.assertIsNone(contact.unsubscribed_at)

    def test_gui_thu_thu_toi_email_cua_chinh_minh_khong_ghi_nhat_ky(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        self.quan_ly.email = "quanly@example.test"
        self.quan_ly.save(update_fields=["email"])
        self.client = self.csrf_client(self.quan_ly)
        self.gui("POST", "/api/notifications/test/", {"date": "2026-10-01"})
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["quanly@example.test"])
        self.assertTrue(mail.outbox[0].subject.startswith("[Thử]"))
        self.assertNotIn("Bé An", mail.outbox[0].body)
        self.assertFalse(NotificationLog.objects.exists())
        self.assertTrue(AuditLog.objects.filter(action="email_test").exists())

    def test_gui_thu_tai_khoan_chua_co_email_tra_400(self):
        self.gui("POST", "/api/notifications/test/", {}, status=400)
        self.assertEqual(len(mail.outbox), 0)

    def test_gui_thu_loi_smtp_tra_json_khong_500(self):
        """BUG? notifications_test không bắt SMTPException/OSError: lỗi SMTP khi gửi thử trả 500 (HTML
        traceback khi DEBUG) thay vì JSON {"message"} theo quy ước lỗi API §10.2."""
        self.tao_thuc_don()
        self.quan_ly.email = "quanly@example.test"
        self.quan_ly.save(update_fields=["email"])
        self.client = self.csrf_client(self.quan_ly)
        self.client.raise_request_exception = False
        with patch("django.core.mail.EmailMultiAlternatives.send", side_effect=smtplib.SMTPServerDisconnected("mất kết nối")):
            response = self.call(self.client, "POST", "/api/notifications/test/", {"date": "2026-10-01"})
        self.assertNotEqual(response.status_code, 500)
        self.assertIn("message", response.json())

    @override_settings(EMAIL_MODE="smtp")
    def test_scheduler_thu_bay_ghi_skipped_khong_gui(self):
        self.tao_thuc_don()
        self.tao_hoc_sinh()
        stdout = io.StringIO()
        with patch("django.utils.timezone.now", return_value=BAY_GIO.replace(day=3)), \
                patch("apps.inventory.management.commands.run_scheduler.close_old_connections"), \
                patch("apps.inventory.management.commands.run_scheduler.signal.signal"):
            call_command("run_scheduler", "--once", stdout=stdout)
        self.assertEqual(NotificationLog.objects.get(date=date(2026, 10, 3), email_hash="*").status, "skipped")
        self.assertEqual(len(mail.outbox), 0)


class GioiHanEmailTriggerTests(TransactionTestCase):
    """BE-04: trigger PostgreSQL chặn email thứ ba của một bé, kể cả khi bỏ qua service."""

    def test_email_thu_ba_bi_trigger_chan(self):
        user = make_user("quan_ly_trigger_email", "manager")
        lop = SchoolClass.objects.create(code="TRG", name="Lớp trigger", enrolled=10)
        hoc_sinh = Student.objects.create(school_class=lop, full_name="Bé Trigger")

        def lien_he(i):
            return ParentContact(
                student=hoc_sinh, email_encrypted=f"gAAAAA-ban-ma-{i}", email_hash=f"{i:064x}",
                email_hint=f"p{i}•••@example.test", consent_at=BAY_GIO, created_by=user,
            )

        lien_he(1).save()
        lien_he(2).save()
        with self.assertRaises(IntegrityError) as caught:
            with transaction.atomic():
                lien_he(3).save()
        self.assertEqual(caught.exception.__cause__.sqlstate, "23514")
        self.assertEqual(caught.exception.__cause__.diag.constraint_name, "parent_contact_limit")
        self.assertEqual(hoc_sinh.contacts.count(), 2)
