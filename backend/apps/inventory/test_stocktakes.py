"""SF31: contract kiểm kê, sổ kho duy nhất và bộ số chuẩn AC15–AC18 (PostgreSQL, COMMIT thật)."""

import json
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, connection, transaction
from django.test import TransactionTestCase

from .models import (
    Category, FoodItem, Issue, IssueLine, StockTake, StockTakeItem, StockTransaction, Supplier,
)
from .services import (
    InventoryConflict, StaleStocktake, create_receipt_draft, create_stocktake, post_issue,
    post_receipt, post_stocktake, update_stocktake_item,
)


class StandardDataset:
    """Bộ số chuẩn của checklist: nhập 50×90000 + 50×110000, xuất 20, kiểm kê đếm 77."""

    def setUp(self):
        users = get_user_model().objects
        self.manager = users.create_user(username="sf31_manager", password="pwd")
        self.manager.groups.add(Group.objects.get_or_create(name="manager")[0])
        self.category = Category.objects.create(code="DRY", name="Đồ khô")
        self.supplier = Supplier.objects.create(code="SUP", name="Đại lý gạo")
        self.rice = FoodItem.objects.create(code="RICE", name="Gạo", category=self.category, unit="kg")
        self.day = date(2026, 9, 30)

    def receive(self, qty, price):
        receipt = create_receipt_draft(
            supplier_id=self.supplier.id, date=self.day, user=self.manager,
            lines=[{"food_id": self.rice.id, "quantity": qty, "unit_price": price}],
        )
        return post_receipt(receipt.id, self.manager)

    def issue(self, qty):
        with transaction.atomic():
            issue = Issue.objects.create(code=f"XK{Issue.objects.count() + 1}", date=self.day, created_by=self.manager)
            IssueLine.objects.create(issue=issue, food=self.rice, quantity=Decimal(qty))
        return post_issue(issue.id, self.manager)

    def ac11_state(self):
        self.receive("50.000", "90000.00")
        self.receive("50.000", "110000.00")
        self.issue("20.000")
        self.rice.refresh_from_db()


class StocktakeServiceTests(StandardDataset, TransactionTestCase):
    def test_ac08_ac11_precondition(self):
        self.ac11_state()
        self.assertEqual(self.rice.quantity, Decimal("80.000"))
        self.assertEqual(self.rice.avg_cost, Decimal("100000.00"))

    def test_ac15_count_77_gives_adjust_minus_3(self):
        self.ac11_state()
        version = self.rice.stock_version
        st = create_stocktake([self.rice.id], self.manager, date=self.day)
        item = st.items.get()
        self.assertEqual(item.snapshot_qty, Decimal("80.000"))
        update_stocktake_item(item.id, "77")
        post_stocktake(st.id, self.manager)

        self.rice.refresh_from_db()
        st.refresh_from_db()
        entry = StockTransaction.objects.get(type="ADJUST")
        self.assertEqual(self.rice.quantity, Decimal("77.000"))
        self.assertEqual(self.rice.avg_cost, Decimal("100000.00"))
        self.assertEqual(self.rice.stock_version, version + 1)
        self.assertEqual(entry.quantity_delta, Decimal("-3.000"))
        self.assertEqual(entry.value_delta, Decimal("-300000.00"))
        self.assertEqual(entry.created_by, self.manager)
        self.assertEqual((st.status, st.posted_by), ("posted", self.manager))
        self.assertIsNotNone(st.posted_at)

    def test_ac16_stock_changed_after_snapshot_is_rejected(self):
        self.ac11_state()
        st = create_stocktake([self.rice.id], self.manager, date=self.day)
        update_stocktake_item(st.items.get().id, "77")
        self.issue("5.000")  # tồn đổi 80 → 75 sau khi mở kiểm kê
        with self.assertRaises(StaleStocktake):
            post_stocktake(st.id, self.manager)
        self.rice.refresh_from_db()
        st.refresh_from_db()
        self.assertEqual(self.rice.quantity, Decimal("75.000"))  # không bị số đếm cũ ghi đè
        self.assertEqual(st.status, "draft")
        self.assertFalse(StockTransaction.objects.filter(type="ADJUST").exists())

    def test_ac17_zero_null_negative_equal_and_repost(self):
        self.ac11_state()
        st = create_stocktake([self.rice.id], self.manager, date=self.day)
        item = st.items.get()
        with self.assertRaises(Exception):  # chưa đếm (NULL) khác 0 → chặn chốt
            post_stocktake(st.id, self.manager)
        for bad in ("-1", "abc", "1.2345", True, None, "NaN"):
            with self.subTest(bad=bad), self.assertRaises(Exception):
                update_stocktake_item(item.id, bad)
        update_stocktake_item(item.id, "0")  # 0 hợp lệ
        item.refresh_from_db()
        self.assertEqual((item.counted_qty, item.variance), (Decimal("0.000"), Decimal("-80.000")))

        update_stocktake_item(item.id, "80.000")  # bằng snapshot → không ghi sổ, không đổi version
        version = FoodItem.objects.get(pk=self.rice.pk).stock_version
        post_stocktake(st.id, self.manager)
        self.assertFalse(StockTransaction.objects.filter(type="ADJUST").exists())
        self.assertEqual(FoodItem.objects.get(pk=self.rice.pk).stock_version, version)
        with self.assertRaises(InventoryConflict):
            post_stocktake(st.id, self.manager)
        with self.assertRaises(InventoryConflict):
            update_stocktake_item(item.id, "70")


class StocktakeDatabaseTests(StandardDataset, TransactionTestCase):
    def test_empty_stocktake_cannot_commit(self):
        with self.assertRaises(IntegrityError):
            StockTake.objects.create(date=self.day, created_by=self.manager)

    def test_item_constraints(self):
        self.receive("10.000", "1000.00")
        st = create_stocktake([self.rice.id], self.manager, date=self.day)
        item = st.items.get()
        for values in ({"counted_qty": Decimal("-1")},
                       {"counted_qty": Decimal("5"), "variance": Decimal("0")},   # variance lệch
                       {"counted_qty": None, "variance": Decimal("1")}):
            with self.subTest(values=values), self.assertRaises(IntegrityError), transaction.atomic():
                StockTakeItem.objects.filter(pk=item.pk).update(**values)
        with self.assertRaises(IntegrityError), transaction.atomic():
            StockTakeItem.objects.create(stock_take=st, food=self.rice, snapshot_qty=0, snapshot_cost=0, snapshot_version=0)

    def test_draft_stocktake_cannot_commit_ledger(self):
        self.receive("10.000", "1000.00")
        st = create_stocktake([self.rice.id], self.manager, date=self.day)
        item = st.items.get()
        update_stocktake_item(item.id, "9")
        with self.assertRaises(IntegrityError):
            StockTransaction.objects.create(
                stocktake_item=item, food=self.rice, type="ADJUST", quantity_delta=Decimal("-1"),
                unit_cost=item.snapshot_cost, value_delta=Decimal("-1000.00"), date=self.day, created_by=self.manager,
            )

    def test_posted_stocktake_is_read_only(self):
        self.receive("10.000", "1000.00")
        st = create_stocktake([self.rice.id], self.manager, date=self.day)
        update_stocktake_item(st.items.get().id, "9")
        post_stocktake(st.id, self.manager)
        with self.assertRaises(IntegrityError):
            StockTakeItem.objects.filter(stock_take=st).update(counted_qty=Decimal("8"), variance=Decimal("-2"))
        with self.assertRaises(IntegrityError):
            StockTake.objects.filter(pk=st.pk).update(note="Sửa")
        with self.assertRaises(IntegrityError), connection.cursor() as cursor:
            cursor.execute("DELETE FROM inventory_stocktake WHERE id = %s", [st.id])
        with self.assertRaises(IntegrityError):
            StockTransaction.objects.filter(type="ADJUST").delete()


class SingleLedgerReportTests(StandardDataset, TransactionTestCase):
    def test_ac18_reports_read_single_ledger(self):
        self.ac11_state()
        st = create_stocktake([self.rice.id], self.manager, date=self.day)
        update_stocktake_item(st.items.get().id, "77")
        post_stocktake(st.id, self.manager)

        self.client.force_login(self.manager)
        stock = self.client.get("/api/reports/stock/").json()["results"][0]
        self.assertEqual((stock["quantity"], stock["avg_cost"], stock["stock_value"], stock["transaction_count"]),
                         ("77.000", "100000.00", "7700000.00", 4))

        rows = self.client.get(f"/api/reports/transactions/?food={self.rice.id}&from=2026-09-30&to=2026-09-30").json()["results"]
        self.assertEqual([(r["transaction_type"], r["quantity_change"]) for r in rows],
                         [("IN", "50.000"), ("IN", "50.000"), ("OUT", "-20.000"), ("ADJUST", "-3.000")])
        self.assertEqual(rows[2]["value_delta"], "-2000000.00")
        self.assertEqual(rows[3]["reference"], f"StockTake #{st.id}")
        self.assertEqual(self.client.get("/api/reports/transactions/?from=30-09-2026").status_code, 400)

        out = StringIO()
        call_command("sf31_ledger_audit", "--strict", stdout=out)
        self.assertIn("khớp", out.getvalue())

    def test_audit_flags_stock_set_outside_ledger(self):
        FoodItem.objects.filter(pk=self.rice.pk).update(quantity=Decimal("5.000"))
        with self.assertRaises(CommandError):
            call_command("sf31_ledger_audit", "--strict", stdout=StringIO())

    def test_stocktake_api_contract(self):
        self.ac11_state()
        self.client.force_login(self.manager)
        created = self.client.post("/api/stocktakes/", data=json.dumps({"food_ids": [self.rice.id]}),
                                   content_type="application/json")
        self.assertEqual(created.status_code, 201)
        body = created.json()
        item = body["items"][0]
        self.assertEqual((item["snapshot_qty"], item["counted_qty"]), ("80.000", None))

        patched = self.client.patch(f"/api/stocktake-items/{item['id']}/", data=json.dumps({"counted_qty": "77"}),
                                    content_type="application/json")
        self.assertEqual(patched.json(), {"id": item["id"], "counted_qty": "77.000", "variance": "-3.000"})
        bad = self.client.patch(f"/api/stocktake-items/{item['id']}/", data=json.dumps({"counted_qty": "-1"}),
                                content_type="application/json")
        self.assertEqual(bad.status_code, 400)

        self.issue("1.000")
        stale = self.client.post(f"/api/stocktakes/{body['id']}/post/")
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(self.client.post("/api/stocktakes/999999/post/").status_code, 404)
