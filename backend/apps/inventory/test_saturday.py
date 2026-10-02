"""SF79: Thứ Bảy là ngày ăn tuỳ chọn theo từng phiên bản thực đơn (phương án A, duyệt 02/10/2026).

- Version có món Thứ Bảy (khóa "5") → Thứ Bảy là ngày ăn: thực đơn, bản chụp, nhu cầu, thư phụ huynh chạy như ngày thường.
- Version không có khóa "5" → Thứ Bảy nghỉ như trước; Thứ Bảy đã qua của version cũ không đổi.
- Chủ nhật luôn nghỉ: khóa "6" bị 400, DB chặn weekday 6.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings

from . import menu_services, notifications
from .models import Category, DayMenuSnapshot, Dish, FoodItem, MenuVersion, MenuVersionItem, RecipeComponent, SchoolHoliday
from .test_g2 import G2Fixture
from .test_menus import dat_ngay_postgres, dong_ho_postgres
from .test_security import CsrfClientMixin, make_user

GIO_VN = ZoneInfo("Asia/Ho_Chi_Minh")
NGAY = date(2026, 10, 1)  # Thứ Năm
BAY_GIO = datetime(2026, 10, 1, 6, 31, tzinfo=GIO_VN)
T7 = date(2026, 10, 3)
CN = date(2026, 10, 4)


@override_settings(TIME_ZONE="Asia/Ho_Chi_Minh")
class ThuBayThucDonTests(CsrfClientMixin, TestCase):
    def setUp(self):
        self.enterContext(patch("django.utils.timezone.now", return_value=BAY_GIO))
        self.enterContext(dong_ho_postgres(NGAY))
        self.quan_ly = make_user("ql_thu_bay", "manager")
        self.client = self.csrf_client(self.quan_ly)
        nhom = Category.objects.create(code="NL", name="Nguyên liệu")
        thit = FoodItem.objects.create(code="THIT", name="Thịt", unit="kg", category=nhom)
        self.mon = Dish.objects.create(code="KHO", name="Thịt kho")
        RecipeComponent.objects.create(dish=self.mon, food=thit, quantity=Decimal("0.060000"))
        self.mon_t7 = Dish.objects.create(code="CHAO", name="Cháo thịt")
        RecipeComponent.objects.create(dish=self.mon_t7, food=thit, quantity=Decimal("0.030000"))

    def gui(self, method, url, body=None, status=200):
        response = self.call(self.client, method, url, body)
        self.assertEqual(response.status_code, status, response.content.decode())
        return response.json()

    def tao(self, ngay, thu_bay=None, status=201):
        days = {str(w): [self.mon.id] for w in range(5)}
        if thu_bay is not None:
            days["5"] = thu_bay
        return self.gui("POST", "/api/menu/versions/", {"effective_from": ngay, "days": days}, status=status)

    def ngay(self, d):
        body = self.gui("GET", f"/api/menu/week/?date={d.isoformat()}")
        return next(x for x in body["days"] if x["date"] == d.isoformat())

    def test_version_co_thu_bay_thi_thu_bay_la_ngay_an(self):
        version = self.tao("2026-10-02", [self.mon_t7.id])
        self.assertEqual([m["dish_id"] for m in version["days"]["5"]], [self.mon_t7.id])
        t7 = self.ngay(T7)
        self.assertEqual((t7["status"], t7["weekday"], t7["weekday_label"]), ("menu", 5, "Thứ Bảy"))
        self.assertEqual([m["dish_id"] for m in t7["dishes"]], [self.mon_t7.id])
        self.assertEqual(t7["dishes"][0]["components"][0]["quantity"], "0.030000")
        cn = self.ngay(CN)
        self.assertEqual((cn["status"], cn["dishes"]), ("weekend", []))
        self.assertEqual(MenuVersionItem.objects.filter(weekday=5).count(), 1)

    def test_version_khong_co_thu_bay_giu_nghi_va_khong_tra_khoa_5(self):
        version = self.tao("2026-10-02")
        self.assertEqual(set(version["days"]), {str(w) for w in range(5)})
        self.assertEqual(self.ngay(T7)["status"], "weekend")
        self.assertEqual(menu_services.day_status(T7), menu_services.WEEKEND)

    def test_thu_bay_cua_version_cu_khong_doi_khi_version_moi_them_thu_bay(self):
        self.tao("2026-10-02")
        self.tao("2026-10-05", [self.mon_t7.id])
        self.assertEqual(self.ngay(T7)["status"], "weekend")  # thuộc version cũ
        t7_sau = self.ngay(date(2026, 10, 10))
        self.assertEqual(t7_sau["status"], "menu")
        self.assertEqual([m["dish_id"] for m in t7_sau["dishes"]], [self.mon_t7.id])
        lich_su = {v["effective_from"]: v for v in self.gui("GET", "/api/menu/versions/")["results"]}
        self.assertNotIn("5", lich_su["2026-10-02"]["days"])
        self.assertIn("5", lich_su["2026-10-05"]["days"])

    def test_chan_chu_nhat_thu_bay_rong_va_thieu_thu_trong_tuan(self):
        days = {str(w): [self.mon.id] for w in range(5)}
        for ten, body_days, truong in [
            ("Chủ nhật", {**days, "6": [self.mon.id]}, "days"),
            ("Thứ Bảy rỗng", {**days, "5": []}, "days.5"),
            ("Thứ Bảy không phải list", {**days, "5": self.mon.id}, "days.5"),
            ("thiếu Thứ Sáu", {k: v for k, v in days.items() if k != "4"} | {"5": [self.mon.id]}, "days"),
        ]:
            with self.subTest(ten):
                body = self.gui("POST", "/api/menu/versions/", {"effective_from": "2026-10-02", "days": body_days}, status=400)
                self.assertIn(truong, body["errors"])
        self.assertFalse(MenuVersion.objects.exists())

    def test_ngay_nghi_thu_bay(self):
        self.tao("2026-10-02")
        # Thứ Bảy không có thực đơn và Chủ nhật đã nghỉ sẵn → 400.
        for d in (T7, CN):
            with self.subTest(d=d):
                body = self.gui("POST", "/api/holidays/", {"date": d.isoformat(), "name": "Nghỉ"}, status=400)
                self.assertIn("date", body["errors"])
        # Thứ Bảy có thực đơn → đánh dấu nghỉ được, trạng thái holiday.
        self.tao("2026-10-05", [self.mon_t7.id])
        t7 = date(2026, 10, 10)
        self.gui("POST", "/api/holidays/", {"date": t7.isoformat(), "name": "Họp phụ huynh"}, status=201)
        self.assertEqual(self.ngay(t7)["status"], "holiday")
        self.assertTrue(SchoolHoliday.objects.filter(date=t7).exists())

    def test_db_chan_weekday_chu_nhat_cho_phep_thu_bay(self):
        version = MenuVersion.objects.create(effective_from=date(2026, 10, 12), created_by=self.quan_ly)
        MenuVersionItem.objects.create(version=version, weekday=5, dish=self.mon)
        with self.assertRaises(IntegrityError) as caught, transaction.atomic():
            MenuVersionItem.objects.create(version=version, weekday=6, dish=self.mon_t7)
        self.assertIn("menu_item_weekday_valid", str(caught.exception))


@override_settings(TIME_ZONE="Asia/Ho_Chi_Minh")
class ThuBayBanChupVaThuTests(CsrfClientMixin, TestCase):
    """Hôm nay là Thứ Bảy 03/10: chụp thực đơn Thứ Bảy và cho gửi thư như ngày thường."""

    def setUp(self):
        self.enterContext(patch("django.utils.timezone.now", return_value=datetime(2026, 10, 3, 6, 31, tzinfo=GIO_VN)))
        self.enterContext(dong_ho_postgres(date(2026, 9, 30)))
        quan_ly = make_user("ql_thu_bay_chup", "manager")
        nhom = Category.objects.create(code="NL", name="Nguyên liệu")
        thit = FoodItem.objects.create(code="THIT", name="Thịt", unit="kg", category=nhom)
        self.mon = Dish.objects.create(code="KHO", name="Thịt kho")
        RecipeComponent.objects.create(dish=self.mon, food=thit, quantity=Decimal("0.060000"))
        co_t7 = MenuVersion.objects.create(effective_from=date(2026, 10, 1), created_by=quan_ly)
        MenuVersionItem.objects.bulk_create([MenuVersionItem(version=co_t7, weekday=w, dish=self.mon) for w in range(6)])
        dat_ngay_postgres(T7)

    def test_chup_thuc_don_thu_bay_va_cho_gui_thu(self):
        menu = menu_services.menu_for_date(T7)
        self.assertEqual((menu["status"], menu["source"]), ("menu", "snapshot"))
        self.assertEqual([m["dish_id"] for m in menu["dishes"]], [self.mon.id])
        self.assertTrue(DayMenuSnapshot.objects.filter(date=T7).exists())
        self.assertIsNone(notifications.check_sendable(T7))
        self.assertEqual(notifications.check_sendable(CN), "Ngày nghỉ: không có bữa trưa nên không gửi thư.")
        self.assertIsNone(menu_services.snapshot_day(CN))


class ThuBayNhuCauTests(G2Fixture, TestCase):
    """Chuỗi G2 trên Thứ Bảy: 300 suất × (60 g + 10 g thịt) = 21 kg như ngày thường (README.md §6)."""

    def setUp(self):
        self.dung_du_lieu()  # version T2–T6 từ thứ Hai D, không có Thứ Bảy
        self.T7 = self.D + timedelta(days=5)
        mon = {d["code"]: d["id"] for d in self.gui("GET", "/api/dishes/")["results"]}
        self.gui("POST", "/api/menu/versions/", {
            "effective_from": (self.D + timedelta(days=7)).isoformat(),
            "days": {str(w): [mon["THIT_KHO"], mon["CANH_BI"]] for w in range(6)},
        }, 201)

    def test_thu_bay_co_thuc_don_tinh_duoc_nhu_cau(self):
        t7 = self.T7 + timedelta(days=7)
        self.chot_so_suat(t7)
        revision = self.tinh_nhu_cau(t7, du_phong=False)
        self.assertEqual(Decimal(self.dong(revision, self.thit)["required_qty"]), Decimal("21.000"))
        self.assertEqual(Decimal(self.dong(revision, self.bi)["required_qty"]), Decimal("9.000"))

    def test_thu_bay_cua_version_khong_co_thu_bay_van_nghi(self):
        self.chot_so_suat(self.T7)
        body = self.gui("POST", f"/api/lunch-days/{self.T7.isoformat()}/demand/calculate/", {}, 409)
        self.assertIn("Ngày nghỉ", body["message"])
