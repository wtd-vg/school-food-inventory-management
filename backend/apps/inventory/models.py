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

    class Meta:
        constraints = [
            # SF25: không âm kho kể cả khi có đường ghi bỏ qua service (update/SQL tay).
            models.CheckConstraint(condition=models.Q(quantity__gte=0, quantity__lt=Decimal("100000000000")), name="food_quantity_nonnegative"),
            models.CheckConstraint(condition=models.Q(avg_cost__gte=0, avg_cost__lt=Decimal("1000000000000")), name="food_avg_cost_nonnegative"),
        ]

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
    # Sổ kho chung (architecture.md §2): mỗi bút toán trỏ ĐÚNG MỘT dòng chứng từ nguồn.
    # IN ↔ receipt_line (SF19), OUT ↔ issue_line (SF25), ADJUST ↔ stocktake_item (SF31).
    receipt_line = models.OneToOneField(
        ReceiptLine, on_delete=models.PROTECT, related_name="stock_transaction", null=True, blank=True,
    )
    issue_line = models.OneToOneField(
        "IssueLine", on_delete=models.PROTECT, related_name="stock_transaction", null=True, blank=True,
    )
    stocktake_item = models.OneToOneField(
        "StockTakeItem", on_delete=models.PROTECT, related_name="stock_transaction", null=True, blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        ordering = ["date", "id"]
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(receipt_line__isnull=False, issue_line__isnull=True, stocktake_item__isnull=True)
                           | models.Q(receipt_line__isnull=True, issue_line__isnull=False, stocktake_item__isnull=True)
                           | models.Q(receipt_line__isnull=True, issue_line__isnull=True, stocktake_item__isnull=False)),
                name="stock_transaction_one_source",
            ),
            models.CheckConstraint(
                condition=(models.Q(type="IN", receipt_line__isnull=False)
                           | models.Q(type="OUT", issue_line__isnull=False)
                           | models.Q(type="ADJUST", stocktake_item__isnull=False)),
                name="stock_transaction_type_matches_source",
            ),
            # Giới hạn hai phía cũng loại NaN của PostgreSQL.
            models.CheckConstraint(
                condition=~models.Q(type="IN") | models.Q(
                    quantity_delta__gt=0, quantity_delta__lt=Decimal("100000000000"),
                    unit_cost__gt=0, unit_cost__lt=Decimal("1000000000000"),
                    value_delta__gte=0, value_delta__lt=Decimal("100000000000000000000000000"),
                ),
                name="stock_transaction_in_values",
            ),
            # OUT: lượng và giá trị âm; giá vốn chụp tại lúc chốt, có thể bằng 0 với hàng chưa có giá.
            models.CheckConstraint(
                condition=~models.Q(type="OUT") | models.Q(
                    quantity_delta__lt=0, quantity_delta__gt=Decimal("-100000000000"),
                    unit_cost__gte=0, unit_cost__lt=Decimal("1000000000000"),
                    value_delta__lte=0, value_delta__gt=Decimal("-100000000000000000000000000"),
                ),
                name="stock_transaction_out_values",
            ),
            # ADJUST: chênh lệch khác 0, giá trị cùng dấu với lượng; giá vốn = giá lúc snapshot.
            models.CheckConstraint(
                condition=~models.Q(type="ADJUST") | (
                    models.Q(unit_cost__gte=0, unit_cost__lt=Decimal("1000000000000"))
                    & (models.Q(quantity_delta__gt=0, quantity_delta__lt=Decimal("100000000000"),
                                value_delta__gte=0, value_delta__lt=Decimal("100000000000000000000000000"))
                       | models.Q(quantity_delta__lt=0, quantity_delta__gt=Decimal("-100000000000"),
                                  value_delta__lte=0, value_delta__gt=Decimal("-100000000000000000000000000")))
                ),
                name="stock_transaction_adjust_values",
            ),
        ]


class InventoryLedger(models.Model):
    """LEGACY (SF32/SF34 cũ). Từ SF31 không ghi thêm; sổ kho duy nhất là StockTransaction.

    Giữ bảng để đối chiếu dữ liệu local cũ (`manage.py sf31_ledger_audit`), không xoá khi chưa
    đối chiếu xong.
    """

    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="ledger_entries")
    transaction_type = models.CharField(max_length=32)
    quantity_change = models.DecimalField(max_digits=14, decimal_places=3)
    cost = models.DecimalField(max_digits=14, decimal_places=2)
    reference = models.CharField(max_length=120, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)


class StockTake(models.Model):
    """SF31: phiếu kiểm kê. Snapshot tồn/version lúc mở; chốt khi version chưa đổi."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Nháp"
        POSTED = "posted", "Đã chốt"

    STATUS_CHOICES = Status.choices  # giữ tên cũ cho code SF32

    date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    note = models.TextField(blank=True, default="")
    # Nullable chỉ vì dữ liệu local cũ không lưu người lập/chốt; service mới luôn ghi.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stocktakes_created",
        null=True, blank=True,
    )
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stocktakes_posted",
        null=True, blank=True,
    )
    posted_at = models.DateTimeField(null=True, blank=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(status="draft", posted_at__isnull=True)
                           | models.Q(status="posted", posted_at__isnull=False)),
                name="stocktake_status_posted_at_valid",
            ),
        ]


class StockTakeItem(models.Model):
    stock_take = models.ForeignKey(StockTake, on_delete=models.CASCADE, related_name="items")
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="stock_take_items")
    snapshot_qty = models.DecimalField(max_digits=14, decimal_places=3)
    snapshot_cost = models.DecimalField(max_digits=14, decimal_places=2)
    snapshot_version = models.IntegerField()
    # NULL = chưa đếm; 0 = đếm được 0 (AC17). Hai trạng thái khác nhau.
    counted_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    variance = models.DecimalField(max_digits=14, decimal_places=3, default=0)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["stock_take", "food"], name="stocktake_item_unique_food"),
            models.CheckConstraint(condition=models.Q(snapshot_qty__gte=0, snapshot_qty__lt=Decimal("100000000000")), name="stocktake_item_snapshot_qty_valid"),
            models.CheckConstraint(condition=models.Q(snapshot_cost__gte=0, snapshot_cost__lt=Decimal("1000000000000")), name="stocktake_item_snapshot_cost_valid"),
            models.CheckConstraint(
                condition=(models.Q(counted_qty__isnull=True, variance=0)
                           # counted_qty__isnull=False bắt buộc: NULL làm cả biểu thức thành NULL = CHECK cho qua.
                           | models.Q(counted_qty__isnull=False, counted_qty__gte=0, counted_qty__lt=Decimal("100000000000"),
                                      variance=models.F("counted_qty") - models.F("snapshot_qty"))),
                name="stocktake_item_variance_consistent",
            ),
        ]


class Issue(models.Model):
    """SF25: phiếu xuất. Nháp không đổi tồn; chốt một lần, sau đó chỉ đọc."""

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
    posted_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(status="draft", posted_at__isnull=True)
                           | models.Q(status="posted", posted_at__isnull=False)),
                name="issue_status_posted_at_valid",
            ),
        ]

    def __str__(self):
        return f"Issue #{self.pk} - {self.code} ({self.status})"


class IssueLine(models.Model):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="lines")
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="issue_lines")
    quantity = models.DecimalField(
        max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))]
    )
    # Client không gửi giá vốn. Nháp = 0; post_issue chụp avg_cost của food lúc chốt.
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0, editable=False)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["issue", "food"], name="issue_line_unique_food"),
            models.CheckConstraint(condition=models.Q(quantity__gt=0, quantity__lt=Decimal("100000000000")), name="issue_line_quantity_positive"),
            models.CheckConstraint(condition=models.Q(unit_cost__gte=0, unit_cost__lt=Decimal("1000000000000")), name="issue_line_cost_nonnegative"),
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

