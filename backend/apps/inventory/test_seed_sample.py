"""seed_sample: dữ liệu mẫu đầy đủ, sổ kho khớp, chạy lại không nhân bản, email mẫu không bao giờ gửi qua SMTP."""

import io
from datetime import timedelta

from django.core import mail
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from . import menu_services, notifications
from .models import (
    DayMenuSnapshot,
    FoodItem,
    Issue,
    LunchDay,
    LunchDayClose,
    MenuVersion,
    NotificationLog,
    ParentContact,
    Receipt,
    Student,
)
from .test_security import make_user


@override_settings(DEBUG=True)
class SeedSampleTests(TestCase):
    def setUp(self):
        self.admin = make_user("admin_mau", is_superuser=True, is_staff=True)

    def chay(self, *args):
        out = io.StringIO()
        call_command("seed_sample", *args, stdout=out)
        return out.getvalue()

    def test_tao_du_lieu_day_du_va_so_kho_khop(self):
        self.chay()
        self.assertEqual(FoodItem.objects.filter(code__in=["GAO", "THIT_HEO", "TRUNG_GA"]).count(), 3)
        self.assertEqual(Student.objects.count(), 30)
        self.assertTrue(all(c.email_hint.endswith(".invalid") for c in ParentContact.objects.all()))
        self.assertEqual(Receipt.objects.filter(status="posted").count(), 6)
        self.assertEqual(LunchDayClose.objects.count(), 10)
        self.assertEqual(Issue.objects.filter(status="posted", lunch_day__isnull=False).count(), 10)
        self.assertEqual(MenuVersion.objects.get().effective_from, menu_services.today() + timedelta(days=1))
        report = self.client
        report.force_login(self.admin)
        first = LunchDay.objects.order_by("date").first().date
        body = report.get(f"/api/reports/daily/?from={first}&to={menu_services.today()}").json()
        closed = [d for d in body["days"] if d["closed"]]
        self.assertEqual(len(closed), 10)
        self.assertTrue(all(d["cost_per_serving"] for d in closed))
        call_command("sf31_ledger_audit", "--strict", stdout=io.StringIO())
        # Ngày học kế tiếp đã mở và chốt số dự kiến để đi tiếp Nhu cầu → Đơn trên giao diện.
        upcoming = LunchDay.objects.filter(date__gt=menu_services.today()).get()
        self.assertIsNotNone(upcoming.planned_confirmed_at)

    def test_chay_lai_khong_nhan_ban(self):
        self.chay()
        before = (Student.objects.count(), Receipt.objects.count(), Issue.objects.count())
        self.assertIn("đã có", self.chay())
        self.assertEqual((Student.objects.count(), Receipt.objects.count(), Issue.objects.count()), before)

    @override_settings(DEBUG=False)
    def test_production_bat_buoc_co_co_xac_nhan(self):
        with self.assertRaises(CommandError):
            self.chay()
        self.assertFalse(FoodItem.objects.exists())
        self.chay("--production", "--user", "admin_mau")
        self.assertTrue(FoodItem.objects.exists())

    @override_settings(EMAIL_MODE="smtp")
    def test_email_mau_khong_bao_gio_gui_qua_smtp(self):
        self.chay()
        d = menu_services.today() + timedelta(days=1)
        while menu_services.day_status(d) != menu_services.MENU:
            d += timedelta(days=1)
        with self.settings(TIME_ZONE="Asia/Ho_Chi_Minh"):
            from unittest.mock import patch
            with patch("apps.inventory.menu_services.today", return_value=d):
                stats = notifications.send_daily_menu(d)
        self.assertEqual(stats["sent"], 0)
        self.assertEqual(stats["skipped"], 30)
        self.assertEqual(len(mail.outbox), 0)
        self.assertTrue(DayMenuSnapshot.objects.filter(date=d).exists())
        self.assertFalse(NotificationLog.objects.filter(date=d, status="sent").exists())
