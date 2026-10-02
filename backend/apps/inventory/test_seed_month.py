"""seed_month: một tháng dữ liệu đi đủ luồng, sổ kho khớp, tồn theo ngày không âm, chạy lại không nhân bản."""

import io
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.core.management import CommandError, call_command
from django.db import connection
from django.test import TestCase, override_settings

from . import menu_services
from .models import (
    DayMenuSnapshot,
    DemandRevision,
    Issue,
    LunchDay,
    LunchDayClose,
    MenuVersion,
    PurchaseOrder,
    Receipt,
    StockTake,
    StockTransaction,
)
from .test_security import make_user


@override_settings(DEBUG=True)
class SeedMonthTests(TestCase):
    def setUp(self):
        self.admin = make_user("admin_mau", is_superuser=True, is_staff=True)
        self.today = menu_services.today()
        self.start = menu_services.week_start(self.today) - timedelta(weeks=3)

    def chay(self, command="seed_month", *args):
        out = io.StringIO()
        call_command(command, *args, stdout=out)
        return out.getvalue()

    def ngay_hoc(self, start, end):
        return [start + timedelta(days=i) for i in range((end - start).days)
                if menu_services.day_status(start + timedelta(days=i)) == menu_services.MENU]

    def test_can_seed_sample_truoc(self):
        with self.assertRaisesMessage(CommandError, "seed_sample"):
            self.chay()

    def test_mot_thang_du_luong_va_so_kho_khop(self):
        self.chay("seed_sample")
        self.assertIn("Xong", self.chay())

        # Mọi ngày học từ start tới hôm qua: có ngày ăn, đã đóng, có nhu cầu đã duyệt hoặc phiếu xuất đã chốt.
        past = self.ngay_hoc(self.start, self.today)
        closed = set(LunchDayClose.objects.filter(reopened_at__isnull=True).values_list("lunch_day__date", flat=True))
        self.assertEqual(set(past) - closed, set())
        self.assertGreaterEqual(len(past), 15)
        backfilled = [d for d in past if DemandRevision.objects.filter(lunch_day__date=d, status="approved").exists()]
        self.assertGreaterEqual(len(backfilled), len(past) - 10)

        # Thực đơn có từ start, trigger be03 vẫn còn nguyên (đồng hồ được khôi phục).
        self.assertTrue(MenuVersion.objects.filter(effective_from=self.start).exists())
        self.assertTrue(DayMenuSnapshot.objects.filter(date=past[0]).exists())
        with connection.cursor() as cursor:
            cursor.execute("SELECT be03_menu_today() = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date")
            self.assertTrue(cursor.fetchone()[0])

        # Đơn đặt đủ trạng thái; có đơn nhận 2 đợt và đơn đóng phần thiếu.
        statuses = set(PurchaseOrder.objects.values_list("status", flat=True))
        self.assertTrue({"closed", "sent", "draft", "cancelled"} <= statuses, statuses)
        self.assertTrue(PurchaseOrder.objects.filter(close_reason__startswith="NCC giao thiếu").exists())
        two = [o for o in PurchaseOrder.objects.filter(status="closed")
               if Receipt.objects.filter(lines__po_line__order=o).distinct().count() == 2]
        self.assertTrue(two)
        self.assertFalse(PurchaseOrder.objects.filter(code__startswith=f"DH{self.today:%Y%m%d}-",
                                                      expected_date__lt=self.today).exists())
        self.assertEqual(StockTake.objects.filter(status="posted").count(), 1)

        # Hôm nay (nếu là ngày học): đã xuất, chưa chốt thực tế; tuần tới đã chốt dự kiến.
        if menu_services.day_status(self.today) == menu_services.MENU:
            day = LunchDay.objects.get(date=self.today)
            self.assertTrue(Issue.objects.filter(lunch_day=day, status="posted").exists())
            self.assertIsNone(day.actual_confirmed_at)
        upcoming = LunchDay.objects.filter(date__gt=self.today)
        self.assertEqual(upcoming.count(), 5)
        self.assertTrue(all(d.planned_confirmed_at for d in upcoming))

        # Sổ kho khớp tồn, và tồn cộng dồn theo ngày chứng từ không bao giờ âm.
        call_command("sf31_ledger_audit", "--strict", stdout=io.StringIO())
        balance = defaultdict(Decimal)
        for fid, delta in StockTransaction.objects.order_by("date", "id").values_list("food_id", "quantity_delta"):
            balance[fid] += delta
            self.assertGreaterEqual(balance[fid], 0)

        # Báo cáo ngày: mọi ngày đã đóng có chi phí/suất.
        self.client.force_login(self.admin)
        body = self.client.get(f"/api/reports/daily/?from={self.start}&to={self.today}").json()
        self.assertTrue(all(d["cost_per_serving"] for d in body["days"] if d["closed"]))

    def test_chay_lai_khong_nhan_ban(self):
        self.chay("seed_sample")
        self.chay()
        before = (StockTransaction.objects.count(), PurchaseOrder.objects.count(), LunchDay.objects.count())
        self.assertIn("đã chạy", self.chay())
        self.assertEqual((StockTransaction.objects.count(), PurchaseOrder.objects.count(), LunchDay.objects.count()),
                         before)

    def test_dry_run_khong_ghi_gi(self):
        self.chay("seed_sample")
        before = (StockTransaction.objects.count(), PurchaseOrder.objects.count(), MenuVersion.objects.count())
        self.assertIn("DIỄN TẬP", self.chay("seed_month", "--dry-run"))
        self.assertEqual((StockTransaction.objects.count(), PurchaseOrder.objects.count(), MenuVersion.objects.count()),
                         before)
        self.assertIn("Xong", self.chay())

    def test_production_bat_buoc_co_co_xac_nhan(self):
        self.chay("seed_sample")
        with override_settings(DEBUG=False):
            with self.assertRaises(CommandError):
                self.chay()
            self.assertFalse(PurchaseOrder.objects.exists())
            self.chay("seed_month", "--production", "--user", "admin_mau")
        self.assertTrue(PurchaseOrder.objects.exists())
