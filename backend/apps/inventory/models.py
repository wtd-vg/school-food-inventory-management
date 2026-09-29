from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Category(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
class FoodItem(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)

    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="food_items"
    )

    unit = models.CharField(max_length=32)
    is_active = models.BooleanField(default=True)

    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=0
    )

    avg_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0
    )
    stock_version = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.code} - {self.name}"
class Supplier(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    phone = models.CharField(max_length=32, blank=True, default="")
    def __str__(self):
        return f"{self.code} - {self.name}"


class Receipt(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Nháp"
        POSTED = "posted", "Đã chốt"

    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="receipts")
    date = models.DateField()
    note = models.TextField(blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="receipts_created",
    )
    posted_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(status="draft", posted_at__isnull=True)
                           | models.Q(status="posted", posted_at__isnull=False)),
                name="receipt_status_posted_at_valid",
            ),
        ]

    def __str__(self):
        return f"Receipt #{self.pk} ({self.status})"


class ReceiptLine(models.Model):
    receipt = models.ForeignKey(Receipt, on_delete=models.CASCADE, related_name="lines")
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="receipt_lines")
    quantity = models.DecimalField(
        max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))],
    )
    unit_price = models.DecimalField(
        max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))],
    )

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["receipt", "food"], name="receipt_line_unique_food"),
            # Giới hạn trên cũng loại NaN của PostgreSQL (NaN được so sánh lớn hơn số hữu hạn).
            models.CheckConstraint(condition=models.Q(quantity__gt=0, quantity__lt=Decimal("100000000000")), name="receipt_line_quantity_positive"),
            models.CheckConstraint(condition=models.Q(unit_price__gt=0, unit_price__lt=Decimal("1000000000000")), name="receipt_line_price_positive"),
        ]


class StockTransaction(models.Model):
    class Type(models.TextChoices):
        IN = "IN", "Nhập"
        OUT = "OUT", "Xuất"
        ADJUST = "ADJUST", "Kiểm kê"

    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="stock_transactions")
    type = models.CharField(max_length=6, choices=Type.choices)
    quantity_delta = models.DecimalField(max_digits=14, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2)
    # Một lượng (11 chữ số nguyên) nhân đơn giá (12 chữ số nguyên) cần đủ chỗ.
    value_delta = models.DecimalField(max_digits=28, decimal_places=2)
    date = models.DateField(db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stock_transactions_created",
    )
    receipt_line = models.OneToOneField(
        ReceiptLine, on_delete=models.PROTECT, related_name="stock_transaction",
    )

    class Meta:
        ordering = ["date", "id"]
        constraints = [
            # M3 chỉ có nguồn ReceiptLine. M4/M5 sẽ mở OUT/ADJUST cùng FK nguồn tương ứng.
            models.CheckConstraint(condition=models.Q(type="IN"), name="stock_transaction_m3_in_only"),
            models.CheckConstraint(condition=models.Q(quantity_delta__gt=0, quantity_delta__lt=Decimal("100000000000")), name="stock_transaction_m3_qty_positive"),
            models.CheckConstraint(condition=models.Q(unit_cost__gt=0, unit_cost__lt=Decimal("1000000000000")), name="stock_transaction_m3_cost_positive"),
            models.CheckConstraint(condition=models.Q(value_delta__gte=0, value_delta__lt=Decimal("100000000000000000000000000")), name="stock_transaction_m3_value_nonnegative"),
        ]
class InventoryLedger(models.Model):
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="ledger_entries")
    transaction_type = models.CharField(max_length=32)
    quantity_change = models.DecimalField(max_digits=14, decimal_places=3)
    cost = models.DecimalField(max_digits=14, decimal_places=2)
    reference = models.CharField(max_length=120, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

class StockTake(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
    ]
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='draft')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class StockTakeItem(models.Model):
    stock_take = models.ForeignKey(StockTake, on_delete=models.CASCADE, related_name="items")
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="stock_take_items")
    snapshot_qty = models.DecimalField(max_digits=14, decimal_places=3)
    snapshot_cost = models.DecimalField(max_digits=14, decimal_places=2)
    snapshot_version = models.IntegerField()
    counted_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    variance = models.DecimalField(max_digits=14, decimal_places=3, default=0)
class Issue(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Nháp"
        POSTED = "posted", "Đã chốt"

    code = models.CharField(max_length=32, unique=True)
    date = models.DateField()
    note = models.TextField(blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="issues_created"
    )
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"Issue #{self.pk} - {self.code} ({self.status})"


class IssueLine(models.Model):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="lines")
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="issue_lines")
    quantity = models.DecimalField(
        max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))]
    )
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["issue", "food"], name="issue_line_unique_food"),
        ]
class SchoolClass(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.code} - {self.name}"

class Dish(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.code} - {self.name}"

class RecipeComponent(models.Model):
    dish = models.ForeignKey(Dish, on_delete=models.CASCADE, related_name="components")
    food = models.ForeignKey("FoodItem", on_delete=models.PROTECT, related_name="recipe_components")
    quantity = models.DecimalField(
        max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))]
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["dish", "food"], name="recipe_component_unique_food"),
        ]

