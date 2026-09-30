"""SF25: contract phiếu xuất và bất biến sổ kho OUT (PostgreSQL, COMMIT thật)."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from threading import Barrier

from django.contrib.auth import get_user_model
from django.db import IntegrityError, close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.utils import timezone

from .models import Category, FoodItem, Issue, IssueLine, StockTransaction
from .services import InventoryConflict, post_issue


class IssueFixtures:
    def setUp(self):
        users = get_user_model().objects
        self.creator = users.create_user(username="sf25_creator")
        self.poster = users.create_user(username="sf25_poster")
        category = Category.objects.create(code="FOOD", name="Thực phẩm")
        # Bộ số chuẩn AC08/AC11: tồn 100 kg, giá vốn 100000.
        self.rice = FoodItem.objects.create(
            code="RICE", name="Gạo", category=category, unit="kg",
            quantity=Decimal("100.000"), avg_cost=Decimal("100000.00"), stock_version=2,
        )
        self.meat = FoodItem.objects.create(
            code="MEAT", name="Thịt", category=category, unit="kg",
            quantity=Decimal("10.000"), avg_cost=Decimal("120000.00"), stock_version=1,
        )
        self.day = date(2026, 9, 30)
        self._seq = 0

    def draft(self, *lines):
        """lines: (food, "quantity"). Đầu phiếu và dòng trong một transaction như API thật."""
        self._seq += 1
        with transaction.atomic():
            issue = Issue.objects.create(code=f"XK{self._seq:03d}", date=self.day, created_by=self.creator)
            for food, qty in lines or ((self.rice, "20.000"),):
                IssueLine.objects.create(issue=issue, food=food, quantity=Decimal(qty))
        return issue

    def out_entry(self, line, **kwargs):
        cost = kwargs.pop("unit_cost", line.food.avg_cost)
        return StockTransaction.objects.create(**{
            "issue_line": line, "food": line.food, "type": StockTransaction.Type.OUT,
            "quantity_delta": -line.quantity, "unit_cost": cost,
            "value_delta": -(line.quantity * cost).quantize(Decimal("0.01")),
            "date": self.day, "created_by": self.poster, **kwargs,
        })


class IssuePostingTests(IssueFixtures, TransactionTestCase):
    def test_ac11_post_issue_writes_matching_out_entry(self):
        issue = self.draft()
        post_issue(issue.id, self.poster)
        self.rice.refresh_from_db()
        issue.refresh_from_db()
        line = issue.lines.get()
        entry = line.stock_transaction
        self.assertEqual(issue.status, Issue.Status.POSTED)
        self.assertIsNotNone(issue.posted_at)
        self.assertEqual(self.rice.quantity, Decimal("80.000"))
        self.assertEqual(self.rice.avg_cost, Decimal("100000.00"))
        self.assertEqual(self.rice.stock_version, 3)
        self.assertEqual(line.unit_cost, Decimal("100000.00"))
        self.assertEqual(entry.type, "OUT")
        self.assertEqual(entry.quantity_delta, Decimal("-20.000"))
        self.assertEqual(entry.value_delta, Decimal("-2000000.00"))
        self.assertEqual(entry.created_by, self.poster)  # người chốt, không phải người lập

    def test_draft_does_not_touch_stock_or_ledger(self):
        self.draft()
        self.rice.refresh_from_db()
        self.assertEqual(self.rice.quantity, Decimal("100.000"))
        self.assertEqual(self.rice.stock_version, 2)
        self.assertEqual(StockTransaction.objects.count(), 0)

    def test_insufficient_line_rejects_whole_issue(self):
        issue = self.draft((self.rice, "20.000"), (self.meat, "11.000"))
        with self.assertRaises(InventoryConflict) as ctx:
            post_issue(issue.id, self.poster)
        self.assertIn("Thịt", " ".join(ctx.exception.messages))
        self.rice.refresh_from_db()
        self.meat.refresh_from_db()
        issue.refresh_from_db()
        self.assertEqual(self.rice.quantity, Decimal("100.000"))
        self.assertEqual(self.meat.quantity, Decimal("10.000"))
        self.assertEqual(issue.status, Issue.Status.DRAFT)
        self.assertEqual(issue.lines.get(food=self.rice).unit_cost, Decimal("0.00"))
        self.assertEqual(StockTransaction.objects.count(), 0)

    def test_issue_exactly_all_stock_keeps_avg_cost(self):
        issue = self.draft((self.meat, "10.000"))
        post_issue(issue.id, self.poster)
        self.meat.refresh_from_db()
        self.assertEqual(self.meat.quantity, Decimal("0.000"))
        self.assertEqual(self.meat.avg_cost, Decimal("120000.00"))

    def test_posting_twice_is_conflict(self):
        issue = self.draft()
        post_issue(issue.id, self.poster)
        with self.assertRaises(InventoryConflict):
            post_issue(issue.id, self.poster)
        self.rice.refresh_from_db()
        self.assertEqual(self.rice.quantity, Decimal("80.000"))
        self.assertEqual(StockTransaction.objects.count(), 1)

    def test_ac14_two_connections_cannot_oversell(self):
        self.meat.quantity = Decimal("10.000")
        self.meat.save(update_fields=["quantity"])
        first = self.draft((self.meat, "8.000"))
        second = self.draft((self.meat, "8.000"))
        barrier = Barrier(2)

        def post(issue_id):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                post_issue(issue_id, self.poster)
                return "posted"
            except InventoryConflict:
                return "conflict"
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = [f.result(timeout=30) for f in [pool.submit(post, first.id), pool.submit(post, second.id)]]
        self.assertCountEqual(outcomes, ["posted", "conflict"])
        self.meat.refresh_from_db()
        self.assertEqual(self.meat.quantity, Decimal("2.000"))
        self.assertEqual(StockTransaction.objects.filter(type="OUT").count(), 1)


class IssueDatabaseTests(IssueFixtures, TransactionTestCase):
    """Bất biến ở tầng PostgreSQL, kể cả khi bỏ qua service."""

    def test_empty_issue_cannot_commit(self):
        with self.assertRaises(IntegrityError):
            Issue.objects.create(code="EMPTY", date=self.day, created_by=self.creator)
        self.assertEqual(Issue.objects.count(), 0)

    def test_cannot_remove_last_line_of_draft(self):
        issue = self.draft()
        with self.assertRaises(IntegrityError):
            issue.lines.all().delete()
        self.assertEqual(issue.lines.count(), 1)

    def test_draft_issue_cannot_commit_ledger(self):
        issue = self.draft()
        with self.assertRaises(IntegrityError):
            self.out_entry(issue.lines.get())
        self.assertEqual(StockTransaction.objects.count(), 0)

    def test_posted_issue_needs_matching_ledger(self):
        issue = self.draft()
        line = issue.lines.get()
        for values in ({}, {"quantity_delta": Decimal("-1.000")}, {"unit_cost": Decimal("1.00")},
                       {"date": date(2026, 9, 29)}, {"food": self.meat}):
            with self.subTest(values=values), self.assertRaises(IntegrityError), transaction.atomic():
                if values:
                    self.out_entry(line, **values)
                Issue.objects.filter(pk=issue.pk).update(status="posted", posted_at=timezone.now())
        issue.refresh_from_db()
        self.assertEqual(issue.status, "draft")

    def test_posted_issue_lines_and_ledger_are_read_only(self):
        issue = self.draft()
        post_issue(issue.id, self.poster)
        with self.assertRaises(IntegrityError):
            Issue.objects.filter(pk=issue.pk).update(note="Sửa")
        with self.assertRaises(IntegrityError):
            issue.lines.update(quantity=Decimal("1.000"))
        with self.assertRaises(IntegrityError):
            IssueLine.objects.create(issue=issue, food=self.meat, quantity=Decimal("1.000"))
        with self.assertRaises(IntegrityError):
            StockTransaction.objects.update(value_delta=Decimal("0.00"))
        with self.assertRaises(IntegrityError):
            StockTransaction.objects.all().delete()
        with self.assertRaises(IntegrityError), connection.cursor() as cursor:
            cursor.execute("DELETE FROM inventory_issue WHERE id = %s", [issue.id])
        self.assertEqual(StockTransaction.objects.count(), 1)

    def test_ledger_needs_exactly_one_matching_source(self):
        issue = self.draft()
        line = issue.lines.get()
        base = {"food": self.rice, "quantity_delta": Decimal("-1.000"), "unit_cost": Decimal("1.00"),
                "value_delta": Decimal("-1.00"), "date": self.day, "created_by": self.poster}
        for values in ({"type": "OUT"},                                   # không nguồn
                       {"type": "IN", "issue_line": line},                # sai loại so với nguồn
                       {"type": "OUT", "issue_line": line, "quantity_delta": Decimal("1.000")},  # OUT dương
                       {"type": "OUT", "issue_line": line, "value_delta": Decimal("1.00")}):
            with self.subTest(values=values), self.assertRaises(IntegrityError), transaction.atomic():
                StockTransaction.objects.create(**{**base, **values})

    def test_food_stock_cannot_go_negative_in_database(self):
        with self.assertRaises(IntegrityError):
            FoodItem.objects.filter(pk=self.meat.pk).update(quantity=Decimal("-0.001"))
        with self.assertRaises(IntegrityError):
            IssueLine.objects.filter(pk=self.draft().lines.get().pk).update(quantity=Decimal("0"))
