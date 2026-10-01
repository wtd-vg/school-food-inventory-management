"""BE-06/07/13: công thức, thực đơn cố định, bản chụp và ràng buộc PostgreSQL."""

from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.db import IntegrityError, connection, transaction
from django.test import TestCase, TransactionTestCase, override_settings

from .models import (
    AuditLog, Category, DayMenuSnapshot, Dish, FoodItem, MenuVersion,
    MenuVersionItem, RecipeComponent, SchoolHoliday,
)
from .test_security import CsrfClientMixin, make_user


NGAY = date(2026, 10, 1)
GIO_VN = ZoneInfo("Asia/Ho_Chi_Minh")
BAY_GIO = datetime(2026, 10, 1, 6, 31, tzinfo=GIO_VN)


def dat_ngay_postgres(ngay):
    """Chỉ thay đồng hồ của trigger trong transaction test, giữ nguyên mọi guard."""
    with connection.cursor() as cursor:
        cursor.execute(
            "CREATE OR REPLACE FUNCTION be03_menu_today() RETURNS date AS $$ "
            f"SELECT DATE '{ngay.isoformat()}'; $$ LANGUAGE sql STABLE;"
        )


@contextmanager
def dong_ho_postgres(ngay):
    """Rollback cả hàm đồng hồ và dữ liệu, kể cả khi assertion thất bại."""
    with transaction.atomic():
        dat_ngay_postgres(ngay)
        try:
            yield
        finally:
            transaction.set_rollback(True)


@override_settings(TIME_ZONE="Asia/Ho_Chi_Minh")
class ThucDonApiTests(CsrfClientMixin, TestCase):
    def setUp(self):
        self.enterContext(patch("django.utils.timezone.now", return_value=BAY_GIO))
        self.enterContext(dong_ho_postgres(NGAY))
        self.quan_ly = make_user("quan_ly_thuc_don", "manager")
        self.hieu_truong = make_user("hieu_truong_thuc_don", "principal")
        self.client = self.csrf_client(self.quan_ly)
        nhom = Category.objects.create(code="NL", name="Nguyên liệu")
        self.thit = FoodItem.objects.create(code="THIT", name="Thịt", unit="kg", category=nhom)
        self.sua = FoodItem.objects.create(code="SUA", name="Sữa", unit="lit", category=nhom)
        self.trung = FoodItem.objects.create(code="TRUNG", name="Trứng", unit="piece", category=nhom)
        self.mon = Dish.objects.create(code="KHO", name="Thịt kho")
        RecipeComponent.objects.create(dish=self.mon, food=self.thit, quantity=Decimal("0.060000"))

    def gui(self, method, url, body=None, status=200):
        response = self.call(self.client, method, url, body)
        self.assertEqual(response.status_code, status, response.content.decode())
        return response.json()

    def ngay_trong_tuan(self, ngay):
        body = self.gui("GET", f"/api/menu/week/?date={ngay}")
        self.assertEqual(len(body["days"]), 7)
        return next(d for d in body["days"] if d["date"] == ngay)

    def tao_phien_ban(self, ngay="2026-10-02", mon=None):
        return self.gui("POST", "/api/menu/versions/", {
            "effective_from": ngay,
            "days": {str(w): [mon or self.mon.id] for w in range(5)},
        }, status=201)

    def phien_ban_hien_hanh(self):
        # Tạo đủ món trước ngày hiệu lực, sau đó tiến đồng hồ DB tới ngày kiểm tra.
        dat_ngay_postgres(date(2026, 9, 30))
        version = MenuVersion.objects.create(effective_from=NGAY, created_by=self.quan_ly)
        MenuVersionItem.objects.bulk_create([
            MenuVersionItem(version=version, weekday=w, dish=self.mon) for w in range(5)
        ])
        dat_ngay_postgres(NGAY)
        return version

    def test_quy_doi_kg_lit_piece_chinh_xac_sau_so_le(self):
        for i, (food, luong, don_vi, expected) in enumerate([
            (self.thit, "60", "g", "0.060000"),
            (self.thit, "0.4", "g", "0.000400"),
            (self.sua, "150", "ml", "0.150000"),
            (self.trung, "1", "piece", "1.000000"),
        ]):
            with self.subTest(don_vi=don_vi, luong=luong):
                body = self.gui("POST", "/api/dishes/", {
                    "code": f"MON{i}", "name": "Món kiểm thử",
                    "components": [{"food_id": food.id, "quantity": luong, "unit": don_vi}],
                }, status=201)
                self.assertEqual(body["components"][0]["quantity"], expected)
                self.assertEqual(body["components"][0]["food_unit"], food.unit)
                self.assertEqual(RecipeComponent.objects.get(dish_id=body["id"]).quantity, Decimal(expected))

    def test_cong_thuc_sai_tra_400_khong_de_lai_mon(self):
        hop_le = {"food_id": self.thit.id, "quantity": "60", "unit": "g"}
        for components in [
            [{**hop_le, "quantity": "0.0004"}],
            [{**hop_le, "unit": "ml"}],
            [{**hop_le, "food_id": self.sua.id}],
            [hop_le, hop_le],
            [{**hop_le, "quantity": 0.4}],  # Cố ý gửi float để kiểm tra từ chối.
            [{**hop_le, "quantity": "NaN"}],
            [{**hop_le, "quantity": "-1"}],
            [{**hop_le, "quantity": "0"}],
            [{**hop_le, "quantity": True}],
        ]:
            with self.subTest(components=components):
                truoc = (Dish.objects.count(), RecipeComponent.objects.count(), AuditLog.objects.count())
                self.gui("POST", "/api/dishes/", {
                    "code": "MON_LOI", "name": "Món lỗi", "components": components,
                }, status=400)
                self.assertEqual(
                    (Dish.objects.count(), RecipeComponent.objects.count(), AuditLog.objects.count()), truoc,
                )

    def test_loi_luu_cong_thuc_rollback_ca_dish(self):
        """Lỗi sau INSERT Dish cũng không để lại món mồ côi hoặc nhật ký."""
        truoc = (Dish.objects.count(), AuditLog.objects.count())
        with patch("apps.inventory.recipe_views.replace_components", side_effect=IntegrityError("Lỗi thử")):
            self.gui("POST", "/api/dishes/", {
                "code": "ROLLBACK", "name": "Món thử rollback",
                "components": [{"food_id": self.thit.id, "quantity": "60", "unit": "g"}],
            }, status=409)
        self.assertEqual((Dish.objects.count(), AuditLog.objects.count()), truoc)

    def test_thit_kho_va_canh_bi_cong_du_0070_kg_moi_suat(self):
        canh = self.gui("POST", "/api/dishes/", {
            "code": "CANH", "name": "Canh bí thịt bằm",
            "components": [{"food_id": self.thit.id, "quantity": "10", "unit": "g"}],
        }, status=201)
        self.gui("POST", "/api/menu/versions/", {
            "effective_from": "2026-10-02",
            "days": {str(w): [self.mon.id, canh["id"]] for w in range(5)},
        }, status=201)
        ngay = self.ngay_trong_tuan("2026-10-02")
        self.assertEqual([d["dish_id"] for d in ngay["dishes"]], [self.mon.id, canh["id"]])
        luong_thit = [Decimal(c["quantity"]) for d in ngay["dishes"] for c in d["components"]
                     if c["food_id"] == self.thit.id]
        self.assertEqual(luong_thit, [Decimal("0.060000"), Decimal("0.010000")])
        self.assertEqual(sum(luong_thit, Decimal("0")), Decimal("0.070"))

    def test_tao_phien_ban_du_nam_thu_tu_ngay_mai(self):
        body = self.tao_phien_ban()
        self.assertEqual(body["effective_from"], "2026-10-02")
        self.assertEqual(set(body["days"]), {str(w) for w in range(5)})
        self.assertEqual(MenuVersionItem.objects.filter(version_id=body["id"]).count(), 5)

    def test_phien_ban_hom_nay_qua_khu_thieu_thu_tra_400(self):
        days = {str(w): [self.mon.id] for w in range(5)}
        for ngay, thu in [("2026-10-01", days), ("2026-09-30", days),
                          ("2026-10-02", {k: v for k, v in days.items() if k != "4"})]:
            with self.subTest(ngay=ngay, thu=thu):
                self.gui("POST", "/api/menu/versions/", {"effective_from": ngay, "days": thu}, status=400)
                self.assertFalse(MenuVersion.objects.exists())
                self.assertFalse(MenuVersionItem.objects.exists())

    def test_phien_ban_tu_choi_mon_thieu_cong_thuc_hoac_ngung_dung(self):
        trong = Dish.objects.create(code="TRONG", name="Chưa có công thức")
        self.mon.is_active = False
        self.mon.save(update_fields=["is_active"])
        for mon in (trong, self.mon):
            with self.subTest(mon=mon.code):
                self.gui("POST", "/api/menu/versions/", {
                    "effective_from": "2026-10-02", "days": {str(w): [mon.id] for w in range(5)},
                }, status=400)
                self.assertFalse(MenuVersion.objects.exists())

    def test_trung_ngay_hieu_luc_tra_409(self):
        self.tao_phien_ban()
        self.gui("POST", "/api/menu/versions/", {
            "effective_from": "2026-10-02", "days": {str(w): [self.mon.id] for w in range(5)},
        }, status=409)
        self.assertEqual(MenuVersion.objects.count(), 1)
        self.assertEqual(MenuVersionItem.objects.count(), 5)

    def test_tuan_chon_dung_phien_ban_va_nghi_cuoi_tuan(self):
        mon_b = Dish.objects.create(code="MON_B", name="Món phiên bản B")
        RecipeComponent.objects.create(dish=mon_b, food=self.trung, quantity=Decimal("1"))
        a = self.tao_phien_ban("2026-10-05")
        b = self.tao_phien_ban("2026-10-12", mon_b.id)
        for ngay, version, mon in [("2026-10-09", a, self.mon), ("2026-10-12", b, mon_b)]:
            with self.subTest(ngay=ngay):
                body = self.gui("GET", f"/api/menu/week/?date={ngay}")
                self.assertEqual(len(body["days"]), 7)
                for d in body["days"][:5]:
                    self.assertEqual(d["menu_version_id"], version["id"])
                    self.assertEqual([m["dish_id"] for m in d["dishes"]], [mon.id])
                for d in body["days"][5:]:
                    self.assertEqual(d["status"], "weekend")
                    self.assertEqual(d["dishes"], [])

    def test_xoa_phien_ban_tuong_lai(self):
        version = self.tao_phien_ban()
        self.gui("DELETE", f"/api/menu/versions/{version['id']}/")
        self.assertFalse(MenuVersion.objects.exists())
        self.assertFalse(MenuVersionItem.objects.exists())

    def test_khong_xoa_phien_ban_da_hieu_luc(self):
        version = self.phien_ban_hien_hanh()
        self.gui("DELETE", f"/api/menu/versions/{version.id}/", status=409)
        self.assertTrue(MenuVersion.objects.filter(pk=version.pk).exists())
        self.assertEqual(version.items.count(), 5)

    def test_ban_chup_giu_cong_thuc_cu_ngay_tuong_lai_dung_cong_thuc_moi(self):
        self.phien_ban_hien_hanh()
        self.assertFalse(DayMenuSnapshot.objects.exists())
        cu = self.gui("GET", "/api/menu/today/")
        self.assertEqual(cu["source"], "snapshot")
        self.assertEqual(cu["dishes"][0]["components"][0]["quantity"], "0.060000")
        snap = DayMenuSnapshot.objects.get(date=NGAY)
        self.assertEqual(snap.items, cu["dishes"])
        self.gui("PATCH", f"/api/dishes/{self.mon.id}/", {
            "components": [{"food_id": self.thit.id, "quantity": "80", "unit": "g"}],
        })
        self.assertEqual(self.gui("GET", "/api/menu/today/"), cu)
        snap.refresh_from_db()
        self.assertEqual(snap.items, cu["dishes"])
        moi = self.ngay_trong_tuan("2026-10-02")
        self.assertEqual(moi["source"], "version")
        self.assertEqual(moi["dishes"][0]["components"][0]["quantity"], "0.080000")
        self.assertEqual(DayMenuSnapshot.objects.count(), 1)

    def test_ngay_nghi_tuong_lai_hien_ten_va_xoa_duoc(self):
        self.tao_phien_ban()
        holiday = self.gui("POST", "/api/holidays/", {"date": "2026-10-02", "name": "Nghỉ lễ"}, status=201)
        ngay = self.ngay_trong_tuan("2026-10-02")
        self.assertEqual((ngay["status"], ngay["holiday_name"], ngay["dishes"]), ("holiday", "Nghỉ lễ", []))
        self.gui("DELETE", f"/api/holidays/{holiday['id']}/")
        self.assertFalse(SchoolHoliday.objects.exists())
        self.assertEqual(self.ngay_trong_tuan("2026-10-02")["status"], "menu")

    def test_ngay_nghi_qua_khu_thu_bay_va_trung(self):
        for ngay in ("2026-09-30", "2026-10-03"):
            with self.subTest(ngay=ngay):
                self.gui("POST", "/api/holidays/", {"date": ngay, "name": "Nghỉ thử"}, status=400)
                self.assertFalse(SchoolHoliday.objects.exists())
        self.gui("POST", "/api/holidays/", {"date": "2026-10-02", "name": "Nghỉ lễ"}, status=201)
        self.gui("POST", "/api/holidays/", {"date": "2026-10-02", "name": "Trùng ngày"}, status=409)
        self.assertEqual(SchoolHoliday.objects.count(), 1)

    def test_hieu_truong_duoc_xem_khong_duoc_tao_thuc_don_ngay_nghi(self):
        self.tao_phien_ban()
        self.client = self.csrf_client(self.hieu_truong)
        for url in ("/api/menu/versions/", "/api/menu/week/?date=2026-10-02", "/api/menu/today/", "/api/holidays/"):
            with self.subTest(url=url):
                self.gui("GET", url)
        self.gui("POST", "/api/menu/versions/", {
            "effective_from": "2026-10-05", "days": {str(w): [self.mon.id] for w in range(5)},
        }, status=403)
        self.gui("POST", "/api/holidays/", {"date": "2026-10-02", "name": "Nghỉ lễ"}, status=403)
        self.assertEqual(MenuVersion.objects.count(), 1)
        self.assertFalse(SchoolHoliday.objects.exists())

    def test_ngung_mon_trong_thuc_don_hien_hanh_tra_409(self):
        self.phien_ban_hien_hanh()
        self.gui("PATCH", f"/api/dishes/{self.mon.id}/", {"is_active": False}, status=409)
        self.mon.refresh_from_db()
        self.assertTrue(self.mon.is_active)


class ThucDonTriggerTests(TransactionTestCase):
    """Thử ORM trực tiếp, kiểm SQLSTATE và tên guard để tránh nhầm lỗi FK/unique."""

    def setUp(self):
        self.enterContext(dong_ho_postgres(date(2026, 9, 30)))
        user = make_user("quan_ly_trigger", "manager")
        self.mon = Dish.objects.create(code="MON", name="Món kiểm trigger")
        self.version = MenuVersion.objects.create(effective_from=NGAY, created_by=user)
        self.item = MenuVersionItem.objects.create(version=self.version, weekday=3, dish=self.mon)
        dat_ngay_postgres(NGAY)

    def bi_chan(self, thao_tac, constraint):
        with self.assertRaises(IntegrityError) as caught:
            with transaction.atomic():
                thao_tac()
        self.assertEqual(caught.exception.__cause__.sqlstate, "23514")
        self.assertEqual(caught.exception.__cause__.diag.constraint_name, constraint)

    def test_update_phien_ban_da_hieu_luc(self):
        self.bi_chan(lambda: MenuVersion.objects.filter(pk=self.version.pk).update(note="Sửa lịch sử"),
                     "menu_version_immutable")
        self.version.refresh_from_db()
        self.assertEqual(self.version.note, "")

    def test_delete_phien_ban_da_hieu_luc(self):
        # Version không có item để DELETE chạm đúng guard của đầu phiên bản.
        version = MenuVersion.objects.create(effective_from=date(2026, 9, 29), created_by=self.version.created_by)
        self.bi_chan(version.delete, "menu_version_immutable")
        self.assertTrue(MenuVersion.objects.filter(pk=version.pk).exists())

    def test_update_item_da_hieu_luc(self):
        self.bi_chan(lambda: MenuVersionItem.objects.filter(pk=self.item.pk).update(position=1),
                     "menu_version_immutable")
        self.item.refresh_from_db()
        self.assertEqual(self.item.position, 0)

    def test_delete_item_da_hieu_luc(self):
        self.bi_chan(self.item.delete, "menu_version_immutable")
        self.assertTrue(MenuVersionItem.objects.filter(pk=self.item.pk).exists())

    def test_insert_item_vao_phien_ban_da_hieu_luc(self):
        self.bi_chan(lambda: MenuVersionItem.objects.create(version=self.version, weekday=4, dish=self.mon),
                     "menu_version_immutable")
        self.assertEqual(self.version.items.count(), 1)

    def test_update_ban_chup(self):
        snap = DayMenuSnapshot.objects.create(date=NGAY, menu_version=self.version, items=[])
        self.bi_chan(lambda: DayMenuSnapshot.objects.filter(pk=snap.pk).update(items=[{"dish_id": self.mon.id}]),
                     "day_menu_snapshot_immutable")
        snap.refresh_from_db()
        self.assertEqual(snap.items, [])

    def test_delete_ban_chup(self):
        snap = DayMenuSnapshot.objects.create(date=NGAY, menu_version=self.version, items=[])
        self.bi_chan(snap.delete, "day_menu_snapshot_immutable")
        self.assertTrue(DayMenuSnapshot.objects.filter(pk=snap.pk).exists())
