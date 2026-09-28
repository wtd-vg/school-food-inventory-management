"""Test đầu tiên, dùng test runner có sẵn của Django."""
from django.test import Client, TestCase
from django.db import IntegrityError
from .models import Category
from .models import Supplier, Receipt, ReceiptLine, Issue, IssueLine
from decimal import Decimal
from django.contrib.auth.models import User
from .services import post_receipt, post_issue
from django.core.exceptions import ValidationError
from .models import (
    Category,
    FoodItem,                                              # Sửa lỗi "FoodItem" is not defined
    Supplier,
    Receipt,
    ReceiptLine,
    Issue,
    IssueLine,
    InventoryLedger,
    StockTake,
    StockTakeItem
)

# Import các hàm service
from .services import post_receipt, post_issue
class HelloApiTest(TestCase):
    def test_hello_api_connects_to_database(self) -> None:
        response = Client().get("/api/hello/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["database"], "PostgreSQL đã kết nối.")

class CategoryModelTest(TestCase): 

    def test_empty_list(self): #test danh sách rỗng 
        count = Category.objects.count()
        self.assertEqual(count, 0)

    def test_valid_data(self): #test dữ liệu hợp lệ
        Category.objects.create(code="RICE",name="Các loại gạo")
        Category.objects.create(code="MEAT",name="Các loại thịt")

        count = Category.objects.count()
        self.assertEqual(count,2)

    def test_block_same_data(self):   #test xem 2 danh mục trùng nhau thì Db phải quăng lỗi Intergrity Error
        Category.objects.create(code="Vegetables", name="Rau")
        with self.assertRaises(IntegrityError):
            Category.objects.create(code="Vegetables",name="Rau củ quả")
    
    def test_api(self):
        Category.objects.create(code="RICE", name="Gạo")
        Category.objects.create(code="MEAT", name="Thịt")
        response = self.client.get('/api/categories/')
        data = response.json()
        self.assertEqual(len(data['results']), 2) 
        self.assertEqual(data['results'][0]['code'], 'RICE')
class InventoryPostingSF20SF26Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(username="admin_user", password="pwd")
        self.cat = Category.objects.create(code="CAT_TEST", name="Test Category")
        self.supplier = Supplier.objects.create(code="SUP01", name="Nhà cung cấp A")

        # Gà: Tồn 10kg, giá vốn 50.00
        self.food_ga = FoodItem.objects.create(
            code="GA", name="Thịt gà", category=self.cat, unit="kg",
            quantity=Decimal("10.000"), avg_cost=Decimal("50.00"), stock_version=1
        )
        # Bò: Tồn 5kg, giá vốn 200.00
        self.food_bo = FoodItem.objects.create(
            code="BO", name="Thịt bò", category=self.cat, unit="kg",
            quantity=Decimal("5.000"), avg_cost=Decimal("200.00"), stock_version=1
        )

    # --- TEST SF20: NHẬP KHO & GIÁ BÌNH QUÂN ---
    def test_sf20_post_receipt_updates_stock_and_avg_cost(self):
        # 10kg * 50k + 10kg * 70k = 1200k / 20kg = 60k
        receipt = Receipt.objects.create(
            supplier=self.supplier, date="2026-04-01", created_by=self.user, status=Receipt.Status.DRAFT
        )
        ReceiptLine.objects.create(
            receipt=receipt, food=self.food_ga, quantity=Decimal("10.000"), unit_price=Decimal("70.00")
        )

        post_receipt(receipt.id)

        self.food_ga.refresh_from_db()
        receipt.refresh_from_db()

        self.assertEqual(receipt.status, Receipt.Status.POSTED)
        self.assertIsNotNone(receipt.posted_at)
        self.assertEqual(self.food_ga.quantity, Decimal("20.000"))
        self.assertEqual(self.food_ga.avg_cost, Decimal("60.00"))
        self.assertEqual(self.food_ga.stock_version, 2)

    # --- TEST SF26: XUẤT KHO & CHỐNG ÂM ---
    def test_sf26_post_issue_success_keeps_avg_cost(self):
        # Xuất 4kg gà -> Còn 6kg, giá vốn 50k không đổi
        issue = Issue.objects.create(
            code="XK01", date="2026-04-01", created_by=self.user, status=Issue.Status.DRAFT
        )
        IssueLine.objects.create(issue=issue, food=self.food_ga, quantity=Decimal("4.000"))

        post_issue(issue.id)

        self.food_ga.refresh_from_db()
        self.assertEqual(self.food_ga.quantity, Decimal("6.000"))
        self.assertEqual(self.food_ga.avg_cost, Decimal("50.00"))
        self.assertEqual(self.food_ga.stock_version, 2)

    def test_sf26_post_issue_blocks_insufficient_stock(self):
        # Bò tồn 5kg, đòi xuất 10kg -> Báo lỗi, không trừ tồn kho
        issue = Issue.objects.create(
            code="XK02", date="2026-04-01", created_by=self.user, status=Issue.Status.DRAFT
        )
        IssueLine.objects.create(issue=issue, food=self.food_bo, quantity=Decimal("10.000"))

        with self.assertRaises(ValidationError):
            post_issue(issue.id)

        self.food_bo.refresh_from_db()
        self.assertEqual(self.food_bo.quantity, Decimal("5.000"))
    