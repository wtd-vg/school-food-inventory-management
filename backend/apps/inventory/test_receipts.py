"""SF19: model, phương án B và ràng buộc PostgreSQL, chưa kiểm thử nghiệp vụ SF20."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, close_old_connections, connection, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from .models import Category, FoodItem, Receipt, ReceiptLine, StockTransaction, Supplier
from .services import create_receipt_draft


class ReceiptFixtures:
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="sf19_manager")
        self.supplier = Supplier.objects.create(code="SUP", name="Nhà cung cấp")
        category = Category.objects.create(code="FOOD", name="Thực phẩm")
        self.rice = FoodItem.objects.create(
            code="RICE", name="Gạo", category=category, unit="kg",
            quantity=Decimal("10.000"), avg_cost=Decimal("20000.00"), stock_version=3,
        )
        self.meat = FoodItem.objects.create(code="MEAT", name="Thịt", category=category, unit="kg")
        self.day = date(2026, 9, 28)

    def line(self, food=None, **kwargs):
        return {"food_id": (food or self.rice).id, "quantity": "50.000", "unit_price": "90000.00", **kwargs}

    def draft(self, lines=None, **kwargs):
        return create_receipt_draft(
            supplier_id=self.supplier.id, date=self.day,
            lines=[self.line()] if lines is None else lines,
            user=self.user, **kwargs,
        )

    def ledger(self, line, **kwargs):
        return StockTransaction.objects.create(**{
            "receipt_line": line, "food": line.food, "type": StockTransaction.Type.IN,
            "quantity_delta": line.quantity, "unit_cost": line.unit_price,
            "value_delta": (line.quantity * line.unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            "date": self.day, "created_by": self.user, **kwargs,
        })

    def posted_fixture(self):
        # Chỉ là fixture chứng minh cấu trúc posted/ledger hợp lệ, không thay post_receipt SF20.
        receipt = self.draft()
        with transaction.atomic():
            self.ledger(receipt.lines.get())
            receipt.status = Receipt.Status.POSTED
            receipt.posted_at = timezone.now()
            receipt.save(update_fields=["status", "posted_at"])
        return receipt


class ReceiptDraftTests(ReceiptFixtures, TestCase):
    def test_multiple_lines_do_not_change_stock(self):
        receipt = self.draft([self.line(), self.line(self.meat)], note="  Nhập buổi sáng  ")
        self.assertEqual(receipt.status, Receipt.Status.DRAFT)
        self.assertIsNone(receipt.posted_at)
        self.assertEqual(receipt.created_by, self.user)
        self.assertEqual(receipt.note, "Nhập buổi sáng")
        self.assertEqual(receipt.lines.count(), 2)
        self.assertEqual(StockTransaction.objects.count(), 0)
        self.rice.refresh_from_db()
        self.meat.refresh_from_db()
        self.assertEqual((self.rice.quantity, self.rice.avg_cost, self.rice.stock_version),
                         (Decimal("10.000"), Decimal("20000.00"), 3))
        self.assertEqual((self.meat.quantity, self.meat.avg_cost, self.meat.stock_version), (0, 0, 0))

    def test_option_b_rejects_empty_lines(self):
        for lines in ([], None, {}, "invalid"):
            with self.subTest(lines=lines), self.assertRaises(ValidationError):
                create_receipt_draft(supplier_id=self.supplier.id, date=self.day, lines=lines, user=self.user)
        self.assertEqual(Receipt.objects.count(), 0)

    def test_repeated_food_rejected_before_save(self):
        with self.assertRaises(ValidationError):
            self.draft([self.line(), self.line()])
        self.assertEqual(Receipt.objects.count(), 0)
        self.assertEqual(ReceiptLine.objects.count(), 0)

    def test_food_can_appear_in_different_receipts(self):
        first = self.draft()
        second = self.draft()
        self.assertNotEqual(first.id, second.id)
        self.assertEqual(ReceiptLine.objects.filter(food=self.rice).count(), 2)

    def test_invalid_second_line_leaves_no_partial_receipt(self):
        for value in ("0", "-1", "NaN", "Infinity", "bad", 1.2, True, "0.0001", "100000000000.000"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                self.draft([self.line(), self.line(self.meat, quantity=value)])
        self.assertEqual(Receipt.objects.count(), 0)
        self.assertEqual(ReceiptLine.objects.count(), 0)

    def test_price_precision_and_positive_values(self):
        for value in ("0", "-1", "0.001", "NaN", "1000000000000.00"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                self.draft([self.line(unit_price=value)])
        self.assertEqual(Receipt.objects.count(), 0)

    def test_missing_food_and_unknown_fields_rejected(self):
        for data in (self.line(food_id=999999), self.line(food_id=True), self.line(created_by=123), {}):
            with self.subTest(data=data), self.assertRaises(ValidationError):
                self.draft([data])
        self.assertEqual(Receipt.objects.count(), 0)

    def test_write_failure_rolls_back_header_and_first_line(self):
        original_save = ReceiptLine.save
        calls = 0

        def fail_second(line, *args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise IntegrityError("Simulated second-line write failure")
            return original_save(line, *args, **kwargs)

        with patch.object(ReceiptLine, "save", fail_second), self.assertRaises(IntegrityError):
            self.draft([self.line(), self.line(self.meat)])
        self.assertEqual(calls, 2)
        self.assertEqual(Receipt.objects.count(), 0)
        self.assertEqual(ReceiptLine.objects.count(), 0)

    def test_authenticated_creator_required(self):
        with self.assertRaises(PermissionDenied):
            create_receipt_draft(supplier_id=self.supplier.id, date=self.day, lines=[self.line()], user=AnonymousUser())
        self.assertEqual(Receipt.objects.count(), 0)

    def test_invalid_header_leaves_no_data(self):
        for values in ({"supplier_id": True}, {"supplier_id": 999999}, {"date": 123},
                       {"date": "2026-02-30"}, {"note": []}):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                create_receipt_draft(**{
                    "supplier_id": self.supplier.id, "date": self.day,
                    "lines": [self.line()], "user": self.user, **values,
                })
        self.assertEqual(Receipt.objects.count(), 0)


class ReceiptDatabaseTests(ReceiptFixtures, TransactionTestCase):
    """Dùng commit thật để kiểm tra constraint deferred, không chỉ full_clean()."""

    def test_database_refuses_empty_committed_receipt(self):
        with self.assertRaises(IntegrityError):
            Receipt.objects.create(supplier=self.supplier, date=self.day, created_by=self.user)
        self.assertEqual(Receipt.objects.count(), 0)

    def test_database_allows_header_then_lines_in_one_transaction(self):
        with transaction.atomic():
            receipt = Receipt.objects.create(supplier=self.supplier, date=self.day, created_by=self.user)
            ReceiptLine.objects.create(receipt=receipt, food=self.rice, quantity="1.000", unit_price="1.00")
        self.assertEqual(receipt.lines.count(), 1)

    def test_unique_food_is_enforced_without_validation(self):
        receipt = self.draft()
        with self.assertRaises(IntegrityError):
            ReceiptLine.objects.create(receipt=receipt, food=self.rice, quantity="2.000", unit_price="1.00")
        self.assertEqual(receipt.lines.count(), 1)

    def test_nonpositive_line_rejected_by_database(self):
        receipt = self.draft()
        for values in ({"quantity": 0}, {"quantity": -1}, {"unit_price": 0}, {"unit_price": -1},
                       {"quantity": Decimal("NaN")}, {"unit_price": Decimal("NaN")}):
            with self.subTest(values=values), self.assertRaises((IntegrityError, ValidationError)):
                receipt.lines.update(**values)
        self.assertEqual(receipt.lines.get().quantity, Decimal("50.000"))

    def test_cannot_remove_or_move_last_line(self):
        receipt = self.draft()
        other = self.draft([self.line(self.meat)])
        with self.assertRaises(IntegrityError):
            receipt.lines.all().delete()
        with self.assertRaises(IntegrityError):
            receipt.lines.update(receipt=other)
        self.assertEqual(receipt.lines.count(), 1)
        self.assertEqual(other.lines.count(), 1)

    def test_deleting_whole_draft_is_allowed(self):
        receipt = self.draft()
        receipt.delete()
        self.assertEqual(Receipt.objects.count(), 0)
        self.assertEqual(ReceiptLine.objects.count(), 0)

    def test_posted_status_needs_timestamp_and_ledger(self):
        receipt = self.draft()
        for values in ({"status": "posted"}, {"status": "unknown"},
                       {"posted_at": timezone.now()}, {"status": "posted", "posted_at": timezone.now()}):
            with self.subTest(values=values), self.assertRaises(IntegrityError):
                Receipt.objects.filter(pk=receipt.pk).update(**values)
        receipt.refresh_from_db()
        self.assertEqual(receipt.status, "draft")

    def test_draft_cannot_commit_ledger(self):
        receipt = self.draft()
        with self.assertRaises(IntegrityError):
            self.ledger(receipt.lines.get())
        self.assertEqual(StockTransaction.objects.count(), 0)

    def test_posted_fixture_has_exactly_one_source_per_line(self):
        receipt = self.posted_fixture()
        entry = receipt.lines.get().stock_transaction
        self.assertEqual(entry.food, self.rice)
        self.assertEqual(entry.value_delta, Decimal("4500000.00"))
        self.assertEqual(entry.date, receipt.date)
        self.assertEqual(receipt.status, "posted")

    def test_duplicate_ledger_source_rejected(self):
        receipt = self.draft()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.ledger(receipt.lines.get())
            self.ledger(receipt.lines.get())
        self.assertEqual(StockTransaction.objects.count(), 0)

    def test_posted_ledger_must_match_source(self):
        receipt = self.draft()
        for values in ({"food": self.meat}, {"quantity_delta": Decimal("1")},
                       {"unit_cost": Decimal("1")}, {"value_delta": Decimal("1")},
                       {"date": date(2026, 9, 27)}, {"type": "OUT"}):
            with self.subTest(values=values), self.assertRaises(IntegrityError), transaction.atomic():
                self.ledger(receipt.lines.get(), **values)
                Receipt.objects.filter(pk=receipt.pk).update(status="posted", posted_at=timezone.now())
        receipt.refresh_from_db()
        self.assertEqual(receipt.status, "draft")
        self.assertEqual(StockTransaction.objects.count(), 0)

    def test_posted_header_lines_and_ledger_are_read_only(self):
        receipt = self.posted_fixture()
        for values in ({"note": "Sửa"}, {"status": "draft", "posted_at": None}):
            with self.assertRaises(IntegrityError):
                Receipt.objects.filter(pk=receipt.pk).update(**values)
        with self.assertRaises(IntegrityError):
            receipt.lines.update(quantity="1.000")
        with self.assertRaises(IntegrityError):
            ReceiptLine.objects.create(receipt=receipt, food=self.meat, quantity="1.000", unit_price="1.00")
        with self.assertRaises(IntegrityError):
            StockTransaction.objects.update(value_delta="1.00")
        with self.assertRaises(IntegrityError):
            StockTransaction.objects.all().delete()
        with self.assertRaises(IntegrityError), connection.cursor() as cursor:
            cursor.execute("DELETE FROM inventory_receipt WHERE id = %s", [receipt.id])
        with self.assertRaises(IntegrityError), connection.cursor() as cursor:
            cursor.execute("DELETE FROM inventory_receiptline WHERE receipt_id = %s", [receipt.id])
        self.assertEqual(ReceiptLine.objects.count(), 1)
        self.assertEqual(StockTransaction.objects.count(), 1)

    def test_two_concurrent_deletes_cannot_leave_empty_receipt(self):
        receipt = self.draft([self.line(), self.line(self.meat)])
        line_ids = list(receipt.lines.values_list("id", flat=True))
        barrier = Barrier(2)

        def delete_line(line_id):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                with transaction.atomic():
                    ReceiptLine.objects.filter(pk=line_id).delete()
                return "deleted"
            except IntegrityError:
                return "blocked"
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(delete_line, line_id) for line_id in line_ids]
            outcomes = [future.result(timeout=20) for future in futures]
        self.assertCountEqual(outcomes, ["deleted", "blocked"])
        self.assertEqual(receipt.lines.count(), 1)
