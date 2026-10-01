"""G2 SF55–SF72: nhu cầu → đề xuất → đơn đặt → nhận hàng → xuất bếp → chi phí → đóng ngày.

Kiểm thử 8 kịch bản contract outputs/team-6/contracts/G2_SF55_SF72_nhu_cau_dat_hang_xuat_ngay.md §5 qua API
thật (Client, CSRF bật), số chuẩn README.md §6:
300 suất × (60 g + 10 g thịt) = 21 kg; dự phòng 1; tồn 5; đơn cũ chờ về 4 → mua 13; nhận 10 rồi 3, thêm 4 bị chặn.
Ngày ăn D là một Thứ Hai ≥ 14 ngày sau hôm nay (thực đơn chỉ lập được từ ngày mai), không phụ thuộc lịch thật.
"""

import threading
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.management import call_command
from django.db import connection
from django.test import Client, TestCase, TransactionTestCase
from django.utils import timezone

from .models import (
    DemandRevision,
    FoodItem,
    Issue,
    LunchDay,
    LunchDayClose,
    PurchaseOrder,
    PurchaseOrderLine,
    StockAllocation,
    StockTransaction,
)
from .test_security import CsrfClientMixin, make_user

Alloc = StockAllocation
CENT = Decimal("0.01")


def ngay_an(weeks_after=0):
    """Thứ Hai đầu tiên cách hôm nay ít nhất 14 ngày (+ weeks_after tuần)."""
    d = timezone.localdate() + timedelta(days=14)
    return d + timedelta(days=(7 - d.weekday()) % 7 + 7 * weeks_after)


class G2Fixture(CsrfClientMixin):
    """Dựng dữ liệu bằng API như người dùng thật. Dùng chung cho TestCase và TransactionTestCase."""

    def dung_du_lieu(self):
        self.quan_ly = make_user("ql_g2", "manager", email="ql@example.test")
        self.hieu_truong = make_user("ht_g2", "principal")
        self.ql = self.csrf_client(self.quan_ly)
        self.ht = self.csrf_client(self.hieu_truong)
        self.D = ngay_an()
        self.hom_nay = timezone.localdate().isoformat()

        nhom = self.gui("POST", "/api/categories/", {"code": "THUC_PHAM", "name": "Thực phẩm"}, 201)
        self.thit = self.gui("POST", "/api/foods/", {"code": "THIT", "name": "Thịt heo", "category_id": nhom["id"], "unit": "kg"}, 201)
        self.bi = self.gui("POST", "/api/foods/", {"code": "BI", "name": "Bí xanh", "category_id": nhom["id"], "unit": "kg"}, 201)
        self.ncc = self.gui("POST", "/api/suppliers/", {"code": "NCC1", "name": "Chợ đầu mối", "phone": ""}, 201)

        # 10 lớp: 9 × 30 + 25 = 295 học sinh; + 5 suất nhân viên = 300 suất.
        self.lop = [
            self.gui("POST", "/api/classes/", {"code": f"L{i:02d}", "name": f"Lớp {i}", "grade": 1,
                                               "enrolled": 25 if i == 10 else 30}, 201)
            for i in range(1, 11)
        ]
        thit_kho = self.gui("POST", "/api/dishes/", {
            "code": "THIT_KHO", "name": "Thịt kho",
            "components": [{"food_id": self.thit["id"], "quantity": "60", "unit": "g"}],
        }, 201)
        canh = self.gui("POST", "/api/dishes/", {
            "code": "CANH_BI", "name": "Canh bí thịt bằm",
            "components": [{"food_id": self.thit["id"], "quantity": "10", "unit": "g"},
                           {"food_id": self.bi["id"], "quantity": "30", "unit": "g"}],
        }, 201)
        self.gui("POST", "/api/menu/versions/", {
            "effective_from": self.D.isoformat(),
            "days": {str(w): [thit_kho["id"], canh["id"]] for w in range(5)},
        }, 201)

    # ---------------------------------------------------------------- tiện ích
    def gui(self, method, url, body=None, status=200, client=None):
        response = self.call(client or self.ql, method, url, body)
        self.assertEqual(response.status_code, status, f"{method} {url}: {response.content.decode()}")
        return response.json()

    def ton(self, food):
        return FoodItem.objects.get(pk=food["id"]).quantity

    def nhap_kho(self, food, quantity, price, chot=True):
        receipt = self.gui("POST", "/api/receipts/", {
            "supplier_id": self.ncc["id"], "date": self.hom_nay,
            "lines": [{"food_id": food["id"], "quantity": quantity, "unit_price": price}],
        }, 201)
        if chot:
            self.gui("POST", f"/api/receipts/{receipt['id']}/post/")
        return receipt

    def chot_so_suat(self, d, kind="planned", tong_lop=None):
        """Mở ngày (nếu chưa), nhập suất các lớp + 5 nhân viên, chốt. tong_lop mặc định 295 (= 300 suất)."""
        url = f"/api/lunch-days/{d.isoformat()}"
        day = self.gui("GET", f"{url}/counts/")
        if day["status"] == "not_open":
            day = self.gui("POST", f"{url}/open/", status=201)
        lines = [{"class_id": l["class_id"], kind: l["enrolled_snapshot"]} for l in day["lines"]]
        if tong_lop is not None:
            lines[0][kind] -= sum(l[kind] for l in lines) - tong_lop
        day = self.gui("PUT", f"{url}/counts/", {"version": day["version"], f"staff_{kind}": 5, "lines": lines})
        return self.gui("POST", f"{url}/lock/", {"kind": kind, "version": day["version"]})

    def dong(self, revision, food):
        return next(l for l in revision["lines"] if l["food_id"] == food["id"])

    def tinh_nhu_cau(self, d=None, du_phong=True):
        body = {"reserves": [{"food_id": self.thit["id"], "qty": "1.000", "reason": "Hao hụt khi sơ chế"}]} if du_phong else {}
        return self.gui("POST", f"/api/lunch-days/{(d or self.D).isoformat()}/demand/calculate/", body, 201)

    def don_cu_4kg(self):
        """Đơn đặt tay 4 kg thịt đã gửi NCC, về trước ngày ăn."""
        po = self.gui("POST", "/api/purchase-orders/", {
            "supplier_id": self.ncc["id"], "expected_date": (self.D - timedelta(days=3)).isoformat(),
            "lines": [{"food_id": self.thit["id"], "qty_ordered": "4.000", "unit_price_est": "110000.00"}],
        }, 201)
        po = self.gui("POST", f"/api/purchase-orders/{po['id']}/approve/", {"version": po["version"]})
        return self.gui("POST", f"/api/purchase-orders/{po['id']}/send/", {"version": po["version"]})

    def den_buoc_duyet(self):
        """Kịch bản 1–2: 300 suất đã chốt, tồn thịt 5 kg (giá 100.000), đơn cũ 4 kg đã gửi, duyệt đề xuất.
        Bí xanh có đủ 9 kg tồn để đơn từ đề xuất chỉ có dòng thịt 13 kg."""
        self.chot_so_suat(self.D)
        self.nhap_kho(self.thit, "5.000", "100000.00")
        self.nhap_kho(self.bi, "9.000", "15000.00")
        self.don_cu = self.don_cu_4kg()
        revision = self.tinh_nhu_cau()
        return self.gui("POST", f"/api/demand-revisions/{revision['id']}/approve/")

    def don_moi_da_gui(self, revision):
        po = self.gui("POST", "/api/purchase-orders/from-demand/", {
            "revision_id": revision["id"], "supplier_id": self.ncc["id"],
            "expected_date": (self.D - timedelta(days=1)).isoformat(),
        }, 201)
        po = self.gui("POST", f"/api/purchase-orders/{po['id']}/approve/", {"version": po["version"]})
        return self.gui("POST", f"/api/purchase-orders/{po['id']}/send/", {"version": po["version"]})

    def phieu_nhan(self, po, quantity, price="120000.00", status=201):
        return self.gui("POST", f"/api/purchase-orders/{po['id']}/receipts/", {
            "date": self.hom_nay,
            "lines": [{"po_line_id": po["lines"][0]["id"], "quantity": quantity, "unit_price": price}],
        }, status)

    def giu_cho_ngay(self, d=None, **filters):
        day = LunchDay.objects.get(date=d or self.D)
        return sum((a.qty for a in Alloc.objects.filter(lunch_day=day, food_id=self.thit["id"], **filters)), Decimal("0"))

    def ledger_dat(self):
        call_command("sf31_ledger_audit", "--strict", stdout=open("/dev/null", "w"))


class G2KichBanTests(G2Fixture, TestCase):
    def setUp(self):
        self.dung_du_lieu()

    # 1 ------------------------------------------------------------------------------------------
    def test_1_300_suat_nhu_cau_thit_21kg(self):
        ngay = self.chot_so_suat(self.D)
        self.assertEqual(ngay["planned_total"], 300)
        revision = self.tinh_nhu_cau(du_phong=False)
        self.assertEqual((revision["status"], revision["servings"]), ("draft", 300))
        self.assertEqual(self.dong(revision, self.thit)["required_qty"], "21.000")
        self.assertEqual(self.dong(revision, self.bi)["required_qty"], "9.000")
        demand = self.gui("GET", f"/api/lunch-days/{self.D}/demand/")
        self.assertEqual(demand["current"]["id"], revision["id"])
        self.assertFalse(demand["is_outdated"])
        self.assertEqual([m["dish_name"] for m in revision["menu_items"]], ["Thịt kho", "Canh bí thịt bằm"])

    def test_1_chua_chot_du_kien_hoac_ngay_chua_mo_409(self):
        self.gui("POST", f"/api/lunch-days/{self.D}/demand/calculate/", {}, 409)  # ngày chưa mở
        self.gui("POST", f"/api/lunch-days/{self.D}/open/", status=201)
        self.gui("POST", f"/api/lunch-days/{self.D}/demand/calculate/", {}, 409)  # chưa chốt dự kiến
        self.assertFalse(DemandRevision.objects.exists())

    # 2 ------------------------------------------------------------------------------------------
    def test_2_du_phong_ton_don_cu_mua_13kg(self):
        approved = self.den_buoc_duyet()
        thit = self.dong(approved, self.thit)
        self.assertEqual(approved["status"], "approved")
        self.assertEqual(
            (thit["required_qty"], thit["reserve_qty"], thit["from_stock_qty"], thit["from_pending_qty"], thit["to_buy_qty"]),
            ("21.000", "1.000", "5.000", "4.000", "13.000"),
        )
        self.assertEqual(thit["reserve_reason"], "Hao hụt khi sơ chế")
        self.assertEqual(self.giu_cho_ngay(status="reserved", source="stock"), Decimal("5.000"))
        self.assertEqual(self.giu_cho_ngay(status="reserved", source="po_line"), Decimal("4.000"))
        self.ledger_dat()

    def test_2_du_phong_thieu_ly_do_400_nguyen_lieu_la_400(self):
        self.chot_so_suat(self.D)
        url = f"/api/lunch-days/{self.D}/demand/calculate/"
        self.gui("POST", url, {"reserves": [{"food_id": self.thit["id"], "qty": "1.000"}]}, 400)
        self.gui("POST", url, {"reserves": [{"food_id": self.thit["id"], "qty": 1.0, "reason": "x"}]}, 400)  # float
        khac = self.gui("POST", "/api/foods/", {"code": "GAO", "name": "Gạo", "category_id": FoodItem.objects.get(pk=self.thit["id"]).category_id, "unit": "kg"}, 201)
        self.gui("POST", url, {"reserves": [{"food_id": khac["id"], "qty": "1.000", "reason": "x"}]}, 400)
        self.assertFalse(DemandRevision.objects.exists())

    # 3 ------------------------------------------------------------------------------------------
    def test_3_don_tu_de_xuat_duyet_gui_nhan_hang(self):
        approved = self.den_buoc_duyet()
        po = self.gui("POST", "/api/purchase-orders/from-demand/", {
            "revision_id": approved["id"], "supplier_id": self.ncc["id"],
            "expected_date": (self.D - timedelta(days=1)).isoformat(),
        }, 201)
        self.assertEqual((po["status"], po["lines"][0]["qty_ordered"]), ("draft", "13.000"))
        self.gui("POST", "/api/purchase-orders/from-demand/", {
            "revision_id": approved["id"], "supplier_id": self.ncc["id"], "expected_date": self.D.isoformat(),
        }, 409)  # một đề xuất chỉ một đơn
        self.gui("POST", f"/api/purchase-orders/{po['id']}/send/", {"version": po["version"]}, 409)  # chưa duyệt
        po = self.gui("POST", f"/api/purchase-orders/{po['id']}/approve/", {"version": po["version"]})
        self.gui("POST", f"/api/purchase-orders/{po['id']}/approve/", {"version": po["version"] - 1}, 409)  # version cũ
        po = self.gui("POST", f"/api/purchase-orders/{po['id']}/send/", {"version": po["version"]})
        self.assertEqual(po["status"], "sent")
        # Tổng giữ cho ngày = 5 (tồn) + 4 (đơn cũ) + 13 (đơn mới) = 22.
        self.assertEqual(self.giu_cho_ngay(status="reserved"), Decimal("22.000"))

        # Nhận 4 kg đơn cũ: nháp không tăng tồn; chốt → phần giữ "đơn chờ" chuyển sang "tồn", tổng vẫn 22.
        nhan_cu = self.phieu_nhan(self.don_cu, "4.000", "110000.00")
        self.assertEqual((nhan_cu["status"], nhan_cu["lines"][0]["po_line_id"]), ("DRAFT", self.don_cu["lines"][0]["id"]))
        self.assertEqual(self.ton(self.thit), Decimal("5.000"))
        self.gui("POST", f"/api/receipts/{nhan_cu['id']}/post/")
        self.assertEqual(self.ton(self.thit), Decimal("9.000"))
        self.assertEqual(self.giu_cho_ngay(status="reserved", source="stock"), Decimal("9.000"))
        self.assertEqual(self.giu_cho_ngay(status="reserved", source="po_line"), Decimal("13.000"))
        self.assertEqual(self.giu_cho_ngay(status="reserved"), Decimal("22.000"))
        self.assertEqual(PurchaseOrder.objects.get(pk=self.don_cu["id"]).status, "closed")

        # Đơn mới: nhận 10, chốt 2 lần không cộng đôi.
        r10 = self.phieu_nhan(po, "10.000")
        self.assertEqual(self.ton(self.thit), Decimal("9.000"))
        self.gui("POST", f"/api/receipts/{r10['id']}/post/")
        self.gui("POST", f"/api/receipts/{r10['id']}/post/", status=409)
        self.assertEqual(self.ton(self.thit), Decimal("19.000"))
        self.assertEqual(StockTransaction.objects.filter(receipt_line__receipt_id=r10["id"]).count(), 1)
        self.assertEqual(PurchaseOrderLine.objects.get(pk=po["lines"][0]["id"]).qty_received, Decimal("10.000"))
        # Còn thiếu 3: nhận 4 bị chặn ngay khi tạo phiếu.
        self.phieu_nhan(po, "4.000", status=409)
        r3 = self.phieu_nhan(po, "3.000")
        self.gui("POST", f"/api/receipts/{r3['id']}/post/")
        po = self.gui("GET", f"/api/purchase-orders/{po['id']}/")
        self.assertEqual((po["status"], po["close_reason"], po["lines"][0]["qty_open"]), ("closed", "Đã nhận đủ", "0.000"))
        self.phieu_nhan(po, "4.000", status=409)  # đơn đã đóng
        self.assertEqual(self.ton(self.thit), Decimal("22.000"))
        self.assertEqual(self.giu_cho_ngay(status="reserved", source="stock"), Decimal("22.000"))
        self.assertEqual(self.giu_cho_ngay(status="reserved", source="po_line"), Decimal("0"))
        self.ledger_dat()

    def test_3_hai_phieu_nhap_nhap_vuot_bi_chan_khi_chot(self):
        """Hai phiếu nháp cùng dòng (mỗi phiếu ≤ phần còn chờ lúc tạo) nhưng tổng vượt → phiếu chốt sau 409."""
        po = self.don_moi_da_gui(self.den_buoc_duyet())
        a = self.phieu_nhan(po, "10.000")
        b = self.phieu_nhan(po, "10.000")
        self.gui("POST", f"/api/receipts/{a['id']}/post/")
        self.gui("POST", f"/api/receipts/{b['id']}/post/", status=409)
        self.assertEqual(PurchaseOrderLine.objects.get(pk=po["lines"][0]["id"]).qty_received, Decimal("10.000"))
        self.assertEqual(self.ton(self.thit), Decimal("15.000"))
        self.ledger_dat()

    def test_3_huy_va_dong_phan_con_lai_bo_giu(self):
        approved = self.den_buoc_duyet()
        po = self.gui("POST", "/api/purchase-orders/from-demand/", {
            "revision_id": approved["id"], "supplier_id": self.ncc["id"], "expected_date": self.D.isoformat(),
        }, 201)
        self.gui("POST", f"/api/purchase-orders/{po['id']}/cancel/", {"version": po["version"]}, 400)  # thiếu lý do
        self.gui("POST", f"/api/purchase-orders/{po['id']}/cancel/", {"version": po["version"], "reason": "NCC báo hết hàng"})
        self.assertEqual(self.giu_cho_ngay(status="reserved", source="po_line"), Decimal("4.000"))  # chỉ còn đơn cũ
        # Đơn cũ đã gửi: không hủy được, đóng phần còn lại thì bỏ giữ 4 kg.
        self.gui("POST", f"/api/purchase-orders/{self.don_cu['id']}/cancel/", {"version": self.don_cu["version"], "reason": "x"}, 409)
        self.gui("POST", f"/api/purchase-orders/{self.don_cu['id']}/close/", {"version": self.don_cu["version"], "reason": "Không giao"})
        self.assertEqual(self.giu_cho_ngay(status="reserved", source="po_line"), Decimal("0"))
        self.assertEqual(self.giu_cho_ngay(status="reserved", source="stock"), Decimal("5.000"))

    # 4 ------------------------------------------------------------------------------------------
    def nhan_du_hang(self):
        po = self.don_moi_da_gui(self.den_buoc_duyet())
        for po_x, qty, price in [(self.don_cu, "4.000", "110000.00"), (po, "10.000", "120000.00"), (po, "3.000", "120000.00")]:
            r = self.phieu_nhan(po_x, qty, price)
            self.gui("POST", f"/api/receipts/{r['id']}/post/")
        self.assertEqual(self.ton(self.thit), Decimal("22.000"))

    def test_4_phieu_xuat_khac_khong_lay_phan_da_giu_xuat_bep_consumed(self):
        self.nhan_du_hang()
        khac = self.gui("POST", "/api/issues/", {
            "date": self.hom_nay, "lines": [{"food_id": self.thit["id"], "quantity": "1.000"}],
        }, 201)
        self.gui("POST", f"/api/issues/{khac['id']}/post/", status=409)
        self.assertEqual(self.ton(self.thit), Decimal("22.000"))

        xuat = self.gui("POST", f"/api/lunch-days/{self.D}/issue/", status=201)
        self.assertEqual(xuat["lunch_date"], self.D.isoformat())
        luong = {l["food_id"]: l["quantity"] for l in xuat["lines"]}
        self.assertEqual(luong[self.thit["id"]], "22.000")  # 21 cần + 1 dự phòng
        self.gui("POST", f"/api/lunch-days/{self.D}/issue/", status=409)  # đã có nháp
        self.gui("POST", f"/api/issues/{xuat['id']}/post/")
        self.assertEqual(self.ton(self.thit), Decimal("0.000"))
        self.assertEqual(self.giu_cho_ngay(status="reserved"), Decimal("0"))
        self.assertEqual(self.giu_cho_ngay(status="consumed"), Decimal("22.000"))
        self.gui("POST", f"/api/lunch-days/{self.D}/issue/", status=409)  # đã xuất đủ
        self.ledger_dat()

    # 5 ------------------------------------------------------------------------------------------
    def test_5_chi_phi_ngay_theo_suat_thuc_te_gia_von_cu_khong_doi(self):
        self.nhan_du_hang()
        xuat = self.gui("POST", f"/api/lunch-days/{self.D}/issue/", status=201)
        self.gui("POST", f"/api/issues/{xuat['id']}/post/")
        ra = StockTransaction.objects.filter(issue_line__issue_id=xuat["id"], type="OUT")
        chi_phi = -sum((t.value_delta for t in ra), Decimal("0"))
        self.assertGreater(chi_phi, 0)

        cost = self.gui("GET", f"/api/lunch-days/{self.D}/cost/")
        self.assertEqual(cost["cost"], str(chi_phi.quantize(CENT)))
        self.assertIsNone(cost["cost_per_serving"])  # chưa chốt thực tế
        self.chot_so_suat(self.D, "actual", tong_lop=285)  # 285 + 5 = 290 suất thực tế
        cost = self.gui("GET", f"/api/lunch-days/{self.D}/cost/")
        self.assertEqual(cost["actual_total"], 290)
        self.assertEqual(cost["cost_per_serving"], str((chi_phi / 290).quantize(CENT, rounding=ROUND_HALF_UP)))

        # Nhập thịt giá mới (gấp đôi): chi phí ngày cũ giữ nguyên.
        self.nhap_kho(self.thit, "10.000", "250000.00")
        self.assertEqual(self.gui("GET", f"/api/lunch-days/{self.D}/cost/")["cost"], cost["cost"])
        report = self.gui("GET", f"/api/reports/daily/?from={self.D}&to={self.D}")
        self.assertEqual(report["days"][0]["cost"], cost["cost"])
        self.assertEqual(report["total_servings"], 290)
        self.ledger_dat()

    # 6 ------------------------------------------------------------------------------------------
    def test_6_dong_ngay_va_mo_lai(self):
        self.nhan_du_hang()
        xuat = self.gui("POST", f"/api/lunch-days/{self.D}/issue/", status=201)
        url = f"/api/lunch-days/{self.D}"
        self.gui("POST", f"{url}/close/", {"note": ""}, 409)  # chưa chốt thực tế
        self.chot_so_suat(self.D, "actual")
        self.gui("POST", f"{url}/close/", {"note": ""}, 409)  # còn phiếu xuất nháp
        self.gui("POST", f"/api/issues/{xuat['id']}/post/")
        # Đã xuất 22 kg thịt, cần 21 → chênh lệch +1: phải ghi chú.
        self.gui("POST", f"{url}/close/", {"note": "   "}, 400)
        self.assertFalse(LunchDayClose.objects.exists())
        closed = self.gui("POST", f"{url}/close/", {"note": "Dự phòng 1 kg đã dùng hết khi sơ chế"})
        self.assertTrue(closed["closed"])
        thit = next(f for f in closed["foods"] if f["food_id"] == self.thit["id"])
        self.assertEqual((thit["required"], thit["issued"], thit["variance"]), ("21.000", "22.000", "1.000"))
        self.gui("POST", f"{url}/close/", {"note": "x"}, 409)  # đã đóng
        self.gui("POST", f"{url}/issue/", status=409)  # đóng rồi không tạo phiếu xuất
        self.gui("POST", f"{url}/reopen-close/", {}, 400)  # thiếu lý do
        reopened = self.gui("POST", f"{url}/reopen-close/", {"reason": "Bếp báo trả lại 1 kg"})
        self.assertFalse(reopened["closed"])
        lich_su = LunchDayClose.objects.get()
        self.assertEqual((lich_su.reopen_reason, lich_su.reopened_by_id), ("Bếp báo trả lại 1 kg", self.quan_ly.id))
        self.assertIsNotNone(lich_su.closed_at)
        self.ledger_dat()

    # 7 (một luồng) ----------------------------------------------------------------------------
    def test_7_so_suat_doi_sau_khi_tinh_duyet_409_ban_tinh_stale(self):
        self.chot_so_suat(self.D)
        revision = self.tinh_nhu_cau()
        url = f"/api/lunch-days/{self.D}"
        day = self.gui("GET", f"{url}/counts/")
        day = self.gui("POST", f"{url}/reopen/", {"kind": "planned", "version": day["version"], "reason": "Lớp 1 báo nghỉ 2 bé"})
        self.gui("POST", f"/api/demand-revisions/{revision['id']}/approve/", status=409)
        self.assertEqual(DemandRevision.objects.get(pk=revision["id"]).status, "stale")
        self.assertFalse(Alloc.objects.exists())
        demand = self.gui("GET", f"{url}/demand/")
        self.assertTrue(demand["is_outdated"])
        self.assertEqual(demand["revisions"][0]["status"], "stale")
        # Tính lại sau khi chốt lại → duyệt được; bản cũ vẫn là lịch sử.
        self.chot_so_suat(self.D, tong_lop=293)
        moi = self.tinh_nhu_cau()
        self.assertEqual(moi["revision"], 2)
        self.assertEqual(self.dong(moi, self.thit)["required_qty"], "20.860")  # 298 × 0.070
        self.gui("POST", f"/api/demand-revisions/{moi['id']}/approve/")
        self.assertFalse(self.gui("GET", f"{url}/demand/")["is_outdated"])

    def test_7_ban_da_duyet_thanh_loi_thoi_khi_so_suat_doi(self):
        self.den_buoc_duyet()
        url = f"/api/lunch-days/{self.D}"
        day = self.gui("GET", f"{url}/counts/")
        self.gui("POST", f"{url}/reopen/", {"kind": "planned", "version": day["version"], "reason": "Đổi số"})
        self.assertTrue(self.gui("GET", f"{url}/demand/")["is_outdated"])

    def test_7_chot_thuc_te_khong_lam_ban_da_duyet_loi_thoi(self):
        """Nhập/chốt số thực tế làm tăng version ngày nhưng không đổi nhu cầu → is_outdated vẫn False.
        (Lỗi tìm thấy khi đi kịch bản trên giao diện: màn Hôm nay báo "Cần xem lại" cho ngày đã đóng.)"""
        self.den_buoc_duyet()
        self.chot_so_suat(self.D, "actual", tong_lop=285)
        self.assertFalse(self.gui("GET", f"/api/lunch-days/{self.D}/demand/")["is_outdated"])
        # Mở lại dự kiến → lỗi thời; chốt lại với tổng khác vẫn lỗi thời, cùng tổng thì hết lỗi thời.
        url = f"/api/lunch-days/{self.D}"
        day = self.gui("GET", f"{url}/counts/")
        day = self.gui("POST", f"{url}/reopen/", {"kind": "actual", "version": day["version"], "reason": "Sửa thực tế"})
        day = self.gui("POST", f"{url}/reopen/", {"kind": "planned", "version": day["version"], "reason": "Đổi dự kiến"})
        self.assertTrue(self.gui("GET", f"{url}/demand/")["is_outdated"])
        self.gui("POST", f"{url}/lock/", {"kind": "planned", "version": day["version"]})
        self.assertFalse(self.gui("GET", f"{url}/demand/")["is_outdated"])

    def test_7_duyet_lai_ban_moi_bo_giu_ban_cu(self):
        self.den_buoc_duyet()
        moi = self.tinh_nhu_cau(du_phong=False)
        self.gui("POST", f"/api/demand-revisions/{moi['id']}/approve/")
        self.assertEqual(DemandRevision.objects.filter(status="approved").count(), 1)
        # 21 kg cần: 5 từ tồn + 4 từ đơn cũ + 12 phải mua; phần giữ của bản cũ đã bỏ.
        self.assertEqual(self.giu_cho_ngay(status="reserved"), Decimal("9.000"))
        current = self.gui("GET", f"/api/lunch-days/{self.D}/demand/")["current"]
        self.assertEqual(self.dong(current, self.thit)["to_buy_qty"], "12.000")

    def test_7_kiem_ke_thieu_bao_shortages(self):
        """Kiểm kê thấy thịt chỉ còn 3 kg trong khi đã giữ 5 kg cho ngày ăn → cảnh báo phân bổ không đủ."""
        self.den_buoc_duyet()
        st = self.gui("POST", "/api/stocktakes/", {"food_ids": [self.thit["id"]]}, 201)
        item = st["items"][0]
        self.gui("PATCH", f"/api/stocktake-items/{item['id']}/", {"counted_qty": "3.000"})
        self.gui("POST", f"/api/stocktakes/{st['id']}/post/")
        shortages = self.gui("GET", f"/api/lunch-days/{self.D}/demand/")["shortages"]
        self.assertEqual([(x["food_id"], x["quantity"], x["reserved"]) for x in shortages],
                         [(self.thit["id"], "3.000", "5.000")])
        self.ledger_dat()

    def test_7_duyet_lai_khi_da_co_don_nhap_tu_de_xuat(self):
        """Đề xuất đã tạo đơn (còn nháp) rồi tính + duyệt lại: phần 13 kg đã đặt được giữ lại, không đề xuất mua trùng.
        (Lỗi tìm thấy khi viết test: approve() bỏ giữ mọi allocation của ngày, còn pending_lines bỏ qua đơn nháp nên
        bản mới đề xuất mua lại 13 kg. Đã sửa: pending_lines tính cả đơn nháp tạo từ đề xuất của chính ngày.)"""
        approved = self.den_buoc_duyet()
        self.gui("POST", "/api/purchase-orders/from-demand/", {
            "revision_id": approved["id"], "supplier_id": self.ncc["id"], "expected_date": self.D.isoformat(),
        }, 201)
        moi = self.tinh_nhu_cau()
        moi = self.gui("POST", f"/api/demand-revisions/{moi['id']}/approve/")
        thit = self.dong(moi, self.thit)
        self.assertEqual((thit["from_stock_qty"], thit["from_pending_qty"], thit["to_buy_qty"]), ("5.000", "17.000", "0.000"))
        self.assertEqual(self.giu_cho_ngay(status="reserved"), Decimal("22.000"))
        self.gui("POST", "/api/purchase-orders/from-demand/", {
            "revision_id": moi["id"], "supplier_id": self.ncc["id"], "expected_date": self.D.isoformat(),
        }, 409)  # không còn gì phải mua

    def test_probe_dau_vao_sai_khong_500(self):
        approved = self.den_buoc_duyet()
        po = self.don_moi_da_gui(approved)
        for method, url, body, status in [
            ("GET", "/api/lunch-days/2026-99-99/demand/", None, 400),
            ("POST", f"/api/lunch-days/{self.D}/demand/calculate/", {"reserves": "x"}, 400),
            ("POST", f"/api/lunch-days/{self.D}/demand/calculate/", {"reserves": [{"food_id": self.thit["id"], "qty": "-1", "reason": "x"}]}, 400),
            ("POST", "/api/demand-revisions/999999/approve/", {}, 404),
            ("POST", "/api/purchase-orders/", {"supplier_id": self.ncc["id"], "expected_date": self.D.isoformat(), "lines": []}, 400),
            ("POST", "/api/purchase-orders/", {"supplier_id": self.ncc["id"], "expected_date": self.D.isoformat(),
                                               "lines": [{"food_id": self.thit["id"], "qty_ordered": 1}]}, 400),
            ("POST", f"/api/purchase-orders/{po['id']}/send/", {"version": "1"}, 400),
            ("POST", f"/api/purchase-orders/{po['id']}/khac/", {"version": 1}, 405),
            ("POST", f"/api/purchase-orders/{po['id']}/receipts/", {"date": self.hom_nay,
                                                                  "lines": [{"po_line_id": 999999, "quantity": "1.000", "unit_price": "1.00"}]}, 400),
            ("POST", f"/api/purchase-orders/{po['id']}/receipts/", {"date": self.hom_nay,
                                                                  "lines": [{"po_line_id": po["lines"][0]["id"], "quantity": "0", "unit_price": "1.00"}]}, 400),
            ("GET", "/api/reports/daily/?from=2026-10-10&to=2026-10-01", None, 400),
            ("GET", "/api/reports/daily/", None, 400),
            ("POST", "/api/lunch-days/2026-10-04/issue/", {}, 409),
        ]:
            with self.subTest(method=method, url=url):
                self.gui(method, url, body, status)

    # 8 + quyền ---------------------------------------------------------------------------------
    def test_8_hieu_truong_xem_duoc_khong_ghi_duoc(self):
        approved = self.den_buoc_duyet()
        po = self.don_moi_da_gui(approved)
        for url in [f"/api/lunch-days/{self.D}/demand/", "/api/purchase-orders/", f"/api/purchase-orders/{po['id']}/",
                    f"/api/lunch-days/{self.D}/cost/", f"/api/reports/daily/?from={self.D}&to={self.D}"]:
            with self.subTest(url=url):
                self.gui("GET", url, client=self.ht)
        truoc = (DemandRevision.objects.count(), PurchaseOrder.objects.count(), Issue.objects.count(),
                 Alloc.objects.count(), LunchDayClose.objects.count())
        for url, body in [
            (f"/api/lunch-days/{self.D}/demand/calculate/", {}),
            (f"/api/demand-revisions/{approved['id']}/approve/", {}),
            ("/api/purchase-orders/", {"supplier_id": self.ncc["id"], "expected_date": self.D.isoformat(),
                                       "lines": [{"food_id": self.thit["id"], "qty_ordered": "1.000"}]}),
            ("/api/purchase-orders/from-demand/", {"revision_id": approved["id"], "supplier_id": self.ncc["id"],
                                                   "expected_date": self.D.isoformat()}),
            (f"/api/purchase-orders/{po['id']}/close/", {"version": po["version"], "reason": "x"}),
            (f"/api/purchase-orders/{po['id']}/receipts/", {"date": self.hom_nay, "lines": []}),
            (f"/api/lunch-days/{self.D}/issue/", {}),
            (f"/api/lunch-days/{self.D}/close/", {"note": "x"}),
            (f"/api/lunch-days/{self.D}/reopen-close/", {"reason": "x"}),
        ]:
            with self.subTest(url=url):
                self.gui("POST", url, body, 403, client=self.ht)
        self.assertEqual((DemandRevision.objects.count(), PurchaseOrder.objects.count(), Issue.objects.count(),
                          Alloc.objects.count(), LunchDayClose.objects.count()), truoc)

    def test_8_ledger_audit_strict_sau_toan_bo_kich_ban(self):
        self.nhan_du_hang()
        xuat = self.gui("POST", f"/api/lunch-days/{self.D}/issue/", status=201)
        self.gui("POST", f"/api/issues/{xuat['id']}/post/")
        self.chot_so_suat(self.D, "actual")
        self.gui("POST", f"/api/lunch-days/{self.D}/close/", {"note": "Dùng hết dự phòng"})
        self.ledger_dat()


class G2DongThoiTests(G2Fixture, TransactionTestCase):
    """Kịch bản 7: hai kết nối PostgreSQL thật chạy song song; không deadlock (join có hạn giờ)."""

    def setUp(self):
        self.dung_du_lieu()

    def song_song(self, url):
        """Hai luồng (mỗi luồng một kết nối DB) cùng POST url; trả danh sách mã HTTP."""
        barrier = threading.Barrier(2)
        results, errors = [], []

        def worker():
            try:
                client = Client()
                client.force_login(self.quan_ly)
                barrier.wait(timeout=10)
                results.append(client.post(url, data="{}", content_type="application/json").status_code)
            except Exception as exc:  # ghi lại để assert ở luồng chính, kể cả lỗi deadlock của DB
                errors.append(repr(exc))
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertFalse(any(t.is_alive() for t in threads), "Luồng bị treo (nghi deadlock)")
        self.assertEqual(errors, [])
        return sorted(results)

    def test_hai_nguoi_duyet_cung_ban_tinh(self):
        self.chot_so_suat(self.D)
        self.nhap_kho(self.thit, "5.000", "100000.00")
        self.don_cu = self.don_cu_4kg()
        revision = self.tinh_nhu_cau()
        self.assertEqual(self.song_song(f"/api/demand-revisions/{revision['id']}/approve/"), [200, 409])
        self.assertEqual(DemandRevision.objects.get(pk=revision["id"]).status, "approved")
        # Giữ hàng chỉ ghi một lần: 5 tồn + 4 đơn cũ.
        self.assertEqual(Alloc.objects.filter(status="reserved", food_id=self.thit["id"]).count(), 2)
        self.assertEqual(self.giu_cho_ngay(status="reserved"), Decimal("9.000"))

    def test_hai_phieu_nhan_cung_dong_don_vuot_tong(self):
        po = self.don_moi_da_gui(self.den_buoc_duyet())
        a = self.phieu_nhan(po, "10.000")
        b = self.phieu_nhan(po, "10.000")
        barrier = threading.Barrier(2)
        results, errors = [], []

        def chot(receipt_id):
            try:
                client = Client()
                client.force_login(self.quan_ly)
                barrier.wait(timeout=10)
                results.append(client.post(f"/api/receipts/{receipt_id}/post/").status_code)
            except Exception as exc:
                errors.append(repr(exc))
            finally:
                connection.close()

        threads = [threading.Thread(target=chot, args=(r["id"],)) for r in (a, b)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertFalse(any(t.is_alive() for t in threads), "Luồng bị treo (nghi deadlock)")
        self.assertEqual(errors, [])
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(PurchaseOrderLine.objects.get(pk=po["lines"][0]["id"]).qty_received, Decimal("10.000"))
        self.assertEqual(self.ton(self.thit), Decimal("15.000"))
        self.ledger_dat()

    def test_nhan_hang_va_xuat_khac_song_song_khong_deadlock(self):
        """Chốt phiếu nhận (khóa đơn → food → allocation → dòng đơn) cùng lúc với phiếu xuất thường (khóa food)."""
        po = self.don_moi_da_gui(self.den_buoc_duyet())
        nhan = self.phieu_nhan(po, "13.000")
        xuat = self.gui("POST", "/api/issues/", {
            "date": self.hom_nay, "lines": [{"food_id": self.thit["id"], "quantity": "1.000"}],
        }, 201)
        barrier = threading.Barrier(2)
        results, errors = {}, []

        def chay(name, url):
            try:
                client = Client()
                client.force_login(self.quan_ly)
                barrier.wait(timeout=10)
                results[name] = client.post(url).status_code
            except Exception as exc:
                errors.append(repr(exc))
            finally:
                connection.close()

        threads = [threading.Thread(target=chay, args=("nhan", f"/api/receipts/{nhan['id']}/post/")),
                   threading.Thread(target=chay, args=("xuat", f"/api/issues/{xuat['id']}/post/"))]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertFalse(any(t.is_alive() for t in threads), "Luồng bị treo (nghi deadlock)")
        self.assertEqual(errors, [])
        self.assertEqual(results["nhan"], 200)
        # Phiếu xuất thường không lấy được phần đã giữ cho ngày ăn dù chạy trước hay sau.
        self.assertEqual(results["xuat"], 409)
        self.ledger_dat()
