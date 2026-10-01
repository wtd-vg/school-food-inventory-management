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
    # SF61/62: dòng nhận theo đơn đặt (null = nhập lẻ ngoài đơn).
    po_line = models.ForeignKey("PurchaseOrderLine", on_delete=models.PROTECT, null=True, blank=True,
                                related_name="receipt_lines")

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
    # SF67/68: phiếu xuất cho bếp theo ngày ăn (null = xuất khác, không được dùng phần đã giữ).
    lunch_day = models.ForeignKey("LunchDay", on_delete=models.PROTECT, null=True, blank=True, related_name="issues")

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


# =========================================================================
# SF43 (G2.1): LỚP, NGÀY ĂN VÀ SUẤT TRƯA
# =========================================================================
MAX_CLASS_SIZE = 200  # chặn gõ nhầm (ví dụ 3000 thay vì 30); trường tiểu học không có lớp > 200.
MAX_STAFF_MEALS = 1000


class SchoolClass(models.Model):
    """Lớp học. `enrolled` là sĩ số HIỆN HÀNH; ngày ăn chụp lại sĩ số riêng (enrolled_snapshot)."""

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    grade = models.PositiveSmallIntegerField(null=True, blank=True)
    # default=0: lớp tạo từ API SF44 (chưa có ô sĩ số) vẫn hợp lệ. 0 = chưa nhập sĩ số,
    # khi đó suất của lớp chỉ được là 0 cho tới khi cập nhật sĩ số.
    enrolled = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]
        constraints = [
            models.CheckConstraint(condition=models.Q(enrolled__gte=0, enrolled__lte=MAX_CLASS_SIZE), name="school_class_enrolled_valid"),
            models.CheckConstraint(condition=models.Q(grade__isnull=True) | models.Q(grade__gte=1, grade__lte=12), name="school_class_grade_valid"),
            models.CheckConstraint(condition=~models.Q(code=""), name="school_class_code_not_empty"),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class LunchDay(models.Model):
    """Một ngày bữa trưa. Số dự kiến và số thực tế độc lập, mỗi loại chốt riêng.

    NULL = chưa nhập; 0 = không ăn. `version` tăng đúng 1 ở mọi lần sửa (khóa lạc quan cho SF46).
    """

    date = models.DateField(unique=True)
    staff_planned = models.PositiveSmallIntegerField(null=True, blank=True)
    staff_actual = models.PositiveSmallIntegerField(null=True, blank=True)
    planned_confirmed_at = models.DateTimeField(null=True, blank=True, editable=False)
    planned_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lunch_planned_confirmed",
        null=True, blank=True, editable=False,
    )
    actual_confirmed_at = models.DateTimeField(null=True, blank=True, editable=False)
    actual_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lunch_actual_confirmed",
        null=True, blank=True, editable=False,
    )
    version = models.PositiveIntegerField(default=1, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date"]
        constraints = [
            models.CheckConstraint(condition=models.Q(staff_planned__isnull=True) | models.Q(staff_planned__lte=MAX_STAFF_MEALS), name="lunch_day_staff_planned_valid"),
            models.CheckConstraint(condition=models.Q(staff_actual__isnull=True) | models.Q(staff_actual__lte=MAX_STAFF_MEALS), name="lunch_day_staff_actual_valid"),
            models.CheckConstraint(
                condition=(models.Q(planned_confirmed_at__isnull=True, planned_confirmed_by__isnull=True)
                           | models.Q(planned_confirmed_at__isnull=False, planned_confirmed_by__isnull=False)),
                name="lunch_day_planned_confirm_pair",
            ),
            models.CheckConstraint(
                condition=(models.Q(actual_confirmed_at__isnull=True, actual_confirmed_by__isnull=True)
                           | models.Q(actual_confirmed_at__isnull=False, actual_confirmed_by__isnull=False)),
                name="lunch_day_actual_confirm_pair",
            ),
            # Chốt thực tế sau khi đã chốt dự kiến.
            models.CheckConstraint(
                condition=models.Q(actual_confirmed_at__isnull=True) | models.Q(planned_confirmed_at__isnull=False),
                name="lunch_day_actual_after_planned",
            ),
            models.CheckConstraint(condition=models.Q(version__gte=1), name="lunch_day_version_positive"),
        ]

    def __str__(self):
        return f"LunchDay {self.date} v{self.version}"

    @property
    def planned_total(self):
        """Tổng suất dự kiến = các lớp + nhân viên; None nếu còn chỗ chưa nhập."""
        rows = list(self.class_counts.values_list("planned", flat=True))
        if self.staff_planned is None or any(v is None for v in rows):
            return None
        return sum(rows) + self.staff_planned

    @property
    def actual_total(self):
        rows = list(self.class_counts.values_list("actual", flat=True))
        if self.staff_actual is None or any(v is None for v in rows):
            return None
        return sum(rows) + self.staff_actual


class ClassMealCount(models.Model):
    """Suất trưa của một lớp trong một ngày. enrolled_snapshot = sĩ số tại lúc mở ngày."""

    lunch_day = models.ForeignKey(LunchDay, on_delete=models.PROTECT, related_name="class_counts")
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, related_name="meal_counts")
    enrolled_snapshot = models.PositiveSmallIntegerField()
    planned = models.PositiveSmallIntegerField(null=True, blank=True)
    actual = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["lunch_day_id", "school_class_id"]
        constraints = [
            models.UniqueConstraint(fields=["lunch_day", "school_class"], name="class_meal_count_unique_day"),
            models.CheckConstraint(condition=models.Q(enrolled_snapshot__lte=MAX_CLASS_SIZE), name="class_meal_count_snapshot_valid"),
            # Suất lớp không vượt sĩ số snapshot; NULL (chưa nhập) được phép.
            models.CheckConstraint(
                condition=models.Q(planned__isnull=True) | models.Q(planned__lte=models.F("enrolled_snapshot")),
                name="class_meal_count_planned_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(actual__isnull=True) | models.Q(actual__lte=models.F("enrolled_snapshot")),
                name="class_meal_count_actual_valid",
            ),
        ]


class LunchDayEvent(models.Model):
    """Lịch sử chốt/mở lại (append-only). Mỗi lần đổi trạng thái chốt phải có đúng một sự kiện."""

    class Action(models.TextChoices):
        CONFIRM_PLANNED = "confirm_planned", "Chốt dự kiến"
        REOPEN_PLANNED = "reopen_planned", "Mở lại dự kiến"
        CONFIRM_ACTUAL = "confirm_actual", "Chốt thực tế"
        REOPEN_ACTUAL = "reopen_actual", "Mở lại thực tế"

    lunch_day = models.ForeignKey(LunchDay, on_delete=models.PROTECT, related_name="events")
    action = models.CharField(max_length=20, choices=Action.choices)
    version = models.PositiveIntegerField()
    reason = models.TextField(blank=True, default="")
    snapshot = models.JSONField(default=dict)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lunch_events")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["lunch_day_id", "version", "id"]
        constraints = [
            models.UniqueConstraint(fields=["lunch_day", "version"], name="lunch_day_event_unique_version"),
            # Mở lại bắt buộc có lý do (architecture.md §5).
            models.CheckConstraint(
                condition=models.Q(action__in=["confirm_planned", "confirm_actual"]) | ~models.Q(reason__regex=r"^\s*$"),
                name="lunch_day_event_reopen_needs_reason",
            ),
        ]


# =========================================================================
# SF44/SF50 (G2): MÓN ĂN VÀ ĐỊNH LƯỢNG
# =========================================================================
class Dish(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.code} - {self.name}"


class RecipeComponent(models.Model):
    """Định lượng cho MỘT suất, theo đơn vị chuẩn của food (kg/lit/piece). 6 số lẻ (BE-03/ISSUE-003):
    0,4 g = 0.000400 kg không bị làm tròn thành 0 trước khi nhân số suất."""

    dish = models.ForeignKey(Dish, on_delete=models.CASCADE, related_name="components")
    food = models.ForeignKey("FoodItem", on_delete=models.PROTECT, related_name="recipe_components")
    quantity = models.DecimalField(
        max_digits=14, decimal_places=6, validators=[MinValueValidator(Decimal("0.000001"))]
    )

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["dish", "food"], name="recipe_component_unique_food"),
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0, quantity__lt=Decimal("100000000")),
                name="recipe_component_quantity_positive",
            ),
        ]


# =========================================================================
# BE-03 / SF49 (R10): THỰC ĐƠN CỐ ĐỊNH THEO THỨ, NGÀY NGHỈ, BẢN CHỤP THEO NGÀY
# =========================================================================
WEEKDAY_LABELS = ("Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu")


class MenuVersion(models.Model):
    """Một phiên bản thực đơn cố định T2–T6, có hiệu lực từ effective_from tới version kế tiếp.

    Bất biến khi đã có hiệu lực (trigger 0016): muốn đổi thực đơn thì tạo version mới cho ngày sau.
    """

    effective_from = models.DateField(unique=True)
    note = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="menu_versions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-effective_from"]

    def __str__(self):
        return f"Thực đơn từ {self.effective_from}"


class MenuVersionItem(models.Model):
    version = models.ForeignKey(MenuVersion, on_delete=models.CASCADE, related_name="items")
    weekday = models.PositiveSmallIntegerField()  # 0 = Thứ Hai … 4 = Thứ Sáu
    dish = models.ForeignKey(Dish, on_delete=models.PROTECT, related_name="menu_items")
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["version_id", "weekday", "position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["version", "weekday", "dish"], name="menu_item_unique_dish"),
            models.CheckConstraint(condition=models.Q(weekday__gte=0, weekday__lte=4), name="menu_item_weekday_valid"),
        ]


class SchoolHoliday(models.Model):
    """Ngày nghỉ ngoài T7/CN (lễ, Tết, hè): không có bữa trưa, không gửi email thực đơn."""

    date = models.DateField(unique=True)
    name = models.CharField(max_length=120)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="holidays_created")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date"]
        constraints = [models.CheckConstraint(condition=~models.Q(name=""), name="school_holiday_name_not_empty")]


class DayMenuSnapshot(models.Model):
    """Bản chụp thực đơn của một ngày (món + định lượng lúc chụp). Bất biến (trigger 0016).

    items: [{"dish_id", "dish_name", "components": [{"food_id", "food_name", "unit", "quantity"}]}].
    """

    date = models.DateField(unique=True)
    menu_version = models.ForeignKey(MenuVersion, on_delete=models.PROTECT, related_name="snapshots")
    items = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date"]


# =========================================================================
# BE-02 (PR1 security): VAI TRÒ, KHÓA ĐĂNG NHẬP SAI, NHẬT KÝ THAO TÁC
# Vai trò là Django Group "manager" (Quản lý) và "principal" (Hiệu trưởng), tạo ở migration 0014.
# =========================================================================
ROLE_MANAGER = "manager"
ROLE_PRINCIPAL = "principal"


class LoginThrottle(models.Model):
    """Đếm số lần đăng nhập sai theo tên đăng nhập hoặc theo IP (logic đếm/khóa ở BE-10).

    Không lưu username/IP rõ: key_hash = HMAC-SHA256 dùng SECRET_KEY (xem `hash_key`), để bảng này
    lộ ra cũng không suy ngược được (băm trần IPv4 dò hết được vì chỉ có 2^32 giá trị).
    """

    class Scope(models.TextChoices):
        USER = "user", "Tên đăng nhập"
        IP = "ip", "Địa chỉ IP"

    scope = models.CharField(max_length=10, choices=Scope.choices)
    key_hash = models.CharField(max_length=64)
    failures = models.PositiveIntegerField(default=0)
    window_start = models.DateTimeField()
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["scope", "key_hash"], name="login_throttle_unique_key"),
            models.CheckConstraint(condition=models.Q(scope__in=["user", "ip"]), name="login_throttle_scope_valid"),
            models.CheckConstraint(condition=models.Q(key_hash__regex=r"^[0-9a-f]{64}$"), name="login_throttle_key_hash_hex"),
        ]

    @staticmethod
    def hash_key(scope, value):
        from django.utils.crypto import salted_hmac

        normalized = f"{scope}:{str(value).strip().lower()}"
        return salted_hmac("schoolfood.login-throttle", normalized, algorithm="sha256").hexdigest()


class AuditLog(models.Model):
    """Nhật ký thao tác, chỉ thêm (trigger chặn UPDATE/DELETE ở 0014). Ghi qua audit.record (BE-15).

    actor PROTECT: tài khoản chỉ được khóa, không xóa; SET_NULL sẽ phải UPDATE dòng nhật ký và bị trigger chặn.
    changes không bao giờ chứa mật khẩu, token hay email phụ huynh rõ.
    """

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="audit_logs", null=True, blank=True,
    )
    actor_username = models.CharField(max_length=150, blank=True, default="")
    action = models.CharField(max_length=40)
    entity_type = models.CharField(max_length=40, blank=True, default="")
    entity_id = models.CharField(max_length=40, blank=True, default="")
    summary = models.CharField(max_length=255, blank=True, default="")
    changes = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["created_at"], name="audit_log_created_idx"),
            models.Index(fields=["actor", "created_at"], name="audit_log_actor_idx"),
            models.Index(fields=["entity_type", "entity_id"], name="audit_log_entity_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=~models.Q(action=""), name="audit_log_action_not_empty"),
        ]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.actor_username or '-'} {self.action}"


# =========================================================================
# BE-04 (R11): HỌC SINH, EMAIL PHỤ HUYNH (MÃ HÓA), NHẬT KÝ GỬI EMAIL THỰC ĐƠN
# =========================================================================
MAX_CONTACTS_PER_STUDENT = 2


class Student(models.Model):
    """Chỉ họ tên + lớp (ngoài phạm vi: hồ sơ học sinh). Bé nghỉ học → xóa hẳn (xóa luôn email)."""

    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, related_name="students")
    full_name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["school_class_id", "full_name", "id"]
        constraints = [models.CheckConstraint(condition=~models.Q(full_name=""), name="student_name_not_empty")]

    def __str__(self):
        return self.full_name


class ParentContact(models.Model):
    """Email phụ huynh: lưu bản mã hóa (crypto_fields), HMAC để tìm trùng, gợi ý đã che để hiển thị."""

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="contacts")
    email_encrypted = models.TextField()
    email_hash = models.CharField(max_length=64, db_index=True)
    email_hint = models.CharField(max_length=80)
    consent_at = models.DateTimeField()
    consent_note = models.CharField(max_length=200, blank=True, default="")
    unsubscribed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="parent_contacts_created")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["student_id", "id"]
        constraints = [
            models.UniqueConstraint(fields=["student", "email_hash"], name="parent_contact_unique_email"),
            models.CheckConstraint(condition=models.Q(email_hash__regex=r"^[0-9a-f]{64}$"), name="parent_contact_hash_hex"),
            models.CheckConstraint(condition=~models.Q(email_encrypted__contains="@"), name="parent_contact_not_plaintext"),
        ]


class NotificationLog(models.Model):
    """Mỗi email nhận tối đa một thư thực đơn mỗi ngày (unique date + email_hash). Dòng tổng của ngày
    dùng email_hash = "*" (ghi ngày đã chạy / bỏ qua vì ngày nghỉ)."""

    class Status(models.TextChoices):
        DRY_RUN = "dry_run", "Chế độ thử"
        SENT = "sent", "Đã gửi"
        FAILED = "failed", "Lỗi"
        SKIPPED = "skipped", "Bỏ qua"
        PENDING = "pending", "Đang gửi"

    date = models.DateField()
    email_hash = models.CharField(max_length=64)
    student_count = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=10, choices=Status.choices)
    error = models.CharField(max_length=300, blank=True, default="")
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "id"]
        constraints = [models.UniqueConstraint(fields=["date", "email_hash"], name="notification_unique_per_day")]


# =========================================================================
# ĐỢT 2 — SF55 NHU CẦU & PHÂN BỔ · SF61 ĐƠN ĐẶT · SF67 XUẤT THEO NGÀY & ĐÓNG NGÀY
# Thứ tự khóa (plan_final §3): đầu chứng từ → LunchDay/DemandRevision/PurchaseOrder → FoodItem (id tăng)
# → StockAllocation (id tăng) → PurchaseOrderLine (id tăng).
# =========================================================================
QTY_LIMIT = Decimal("100000000000")


class DemandRevision(models.Model):
    """Một lần tính nhu cầu nguyên liệu cho một ngày ăn (SF55/56).

    draft: bản tính, chưa giữ hàng · approved: đã duyệt và giữ hàng (StockAllocation) · stale: lỗi thời vì số
    suất/thực đơn/tồn đã đổi hoặc có bản mới. Mỗi ngày tối đa một bản approved.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Bản tính"
        APPROVED = "approved", "Đã duyệt"
        STALE = "stale", "Lỗi thời"

    lunch_day = models.ForeignKey(LunchDay, on_delete=models.PROTECT, related_name="demand_revisions")
    revision = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    servings = models.PositiveIntegerField()
    lunch_day_version = models.PositiveIntegerField()
    menu_version = models.ForeignKey(MenuVersion, on_delete=models.PROTECT, null=True, blank=True,
                                     related_name="demand_revisions")
    menu_items = models.JSONField(default=list)
    stale_reason = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                   related_name="demand_revisions_created")
    created_at = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
                                    related_name="demand_revisions_approved")
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["lunch_day_id", "-revision"]
        constraints = [
            models.UniqueConstraint(fields=["lunch_day", "revision"], name="demand_revision_unique"),
            models.UniqueConstraint(fields=["lunch_day"], condition=models.Q(status="approved"),
                                    name="demand_one_approved_per_day"),
            models.CheckConstraint(
                condition=(models.Q(status="approved", approved_at__isnull=False, approved_by__isnull=False)
                           | ~models.Q(status="approved")),
                name="demand_approved_has_actor",
            ),
        ]


class DemandLine(models.Model):
    """Nhu cầu một nguyên liệu: required = Σ(suất × định lượng) làm tròn 3 số lẻ SAU khi cộng (ROUND_HALF_UP).

    Khi duyệt: from_stock (giữ từ tồn) + from_pending (giữ từ đơn đang chờ về) + to_buy = required + reserve.
    """

    revision = models.ForeignKey(DemandRevision, on_delete=models.CASCADE, related_name="lines")
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="demand_lines")
    required_qty = models.DecimalField(max_digits=14, decimal_places=3)
    reserve_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    reserve_reason = models.CharField(max_length=255, blank=True, default="")
    from_stock_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    from_pending_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    to_buy_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)

    class Meta:
        ordering = ["revision_id", "food_id"]
        constraints = [
            models.UniqueConstraint(fields=["revision", "food"], name="demand_line_unique_food"),
            models.CheckConstraint(
                condition=models.Q(required_qty__gte=0, required_qty__lt=QTY_LIMIT, reserve_qty__gte=0,
                                   reserve_qty__lt=QTY_LIMIT, from_stock_qty__gte=0, from_pending_qty__gte=0,
                                   to_buy_qty__gte=0),
                name="demand_line_quantities_valid",
            ),
            models.CheckConstraint(condition=models.Q(reserve_qty=0) | ~models.Q(reserve_reason=""),
                                   name="demand_line_reserve_needs_reason"),
        ]


class PurchaseOrder(models.Model):
    """Đơn đặt hàng (SF61): draft → approved → sent → closed; draft/approved hủy được; đóng/hủy cần lý do."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Nháp"
        APPROVED = "approved", "Đã duyệt"
        SENT = "sent", "Đã gửi NCC"
        CLOSED = "closed", "Đã đóng"
        CANCELLED = "cancelled", "Đã hủy"

    code = models.CharField(max_length=32, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    expected_date = models.DateField()
    note = models.TextField(blank=True, default="")
    demand_revision = models.ForeignKey(DemandRevision, on_delete=models.PROTECT, null=True, blank=True,
                                        related_name="purchase_orders")
    version = models.PositiveIntegerField(default=1)
    close_reason = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                   related_name="purchase_orders_created")
    created_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]
        constraints = [
            models.CheckConstraint(condition=models.Q(version__gte=1), name="purchase_order_version_positive"),
            models.CheckConstraint(
                condition=~models.Q(status__in=["closed", "cancelled"]) | ~models.Q(close_reason=""),
                name="purchase_order_close_needs_reason",
            ),
        ]


class PurchaseOrderLine(models.Model):
    order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="purchase_order_lines")
    qty_ordered = models.DecimalField(max_digits=14, decimal_places=3)
    qty_received = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    unit_price_est = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ["order_id", "id"]
        constraints = [
            models.UniqueConstraint(fields=["order", "food"], name="po_line_unique_food"),
            models.CheckConstraint(condition=models.Q(qty_ordered__gt=0, qty_ordered__lt=QTY_LIMIT),
                                   name="po_line_ordered_positive"),
            models.CheckConstraint(
                condition=models.Q(qty_received__gte=0, qty_received__lte=models.F("qty_ordered")),
                name="po_line_received_not_over",
            ),
        ]

    @property
    def qty_open(self):
        return self.qty_ordered - self.qty_received


class StockAllocation(models.Model):
    """Lượng giữ cho một ngày ăn (SF55/58). Tồn giữ vẫn nằm trong FoodItem.quantity.

    source stock: giữ từ tồn · source po_line: giữ từ đơn đang chờ về (po_line bắt buộc).
    reserved → consumed (xuất cho ngày đó) hoặc released (bỏ giữ: duyệt lại, hủy đơn, đóng phần còn lại).
    Nhận hàng chuyển phần po_line đã về sang stock (không tính đôi).
    """

    class Source(models.TextChoices):
        STOCK = "stock", "Tồn kho"
        PO_LINE = "po_line", "Đơn đang chờ"

    class Status(models.TextChoices):
        RESERVED = "reserved", "Đang giữ"
        CONSUMED = "consumed", "Đã dùng"
        RELEASED = "released", "Đã bỏ giữ"

    lunch_day = models.ForeignKey(LunchDay, on_delete=models.PROTECT, related_name="allocations")
    demand_line = models.ForeignKey(DemandLine, on_delete=models.PROTECT, related_name="allocations")
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="allocations")
    source = models.CharField(max_length=10, choices=Source.choices)
    po_line = models.ForeignKey(PurchaseOrderLine, on_delete=models.PROTECT, null=True, blank=True,
                                related_name="allocations")
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RESERVED)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["food", "status", "source"], name="allocation_food_status_idx")]
        constraints = [
            models.CheckConstraint(condition=models.Q(qty__gt=0, qty__lt=QTY_LIMIT), name="allocation_qty_positive"),
            models.CheckConstraint(
                condition=(models.Q(source="stock", po_line__isnull=True)
                           | models.Q(source="po_line", po_line__isnull=False)),
                name="allocation_source_matches_po_line",
            ),
        ]


class LunchDayClose(models.Model):
    """Đóng ngày (SF67): đã chốt số thực tế, mọi phiếu xuất của ngày đã chốt; chênh lệch cần giải thích.
    Mở lại giữ lịch sử (reopened_*); mỗi ngày tối đa một lần đóng đang hiệu lực."""

    lunch_day = models.ForeignKey(LunchDay, on_delete=models.PROTECT, related_name="closes")
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lunch_days_closed")
    closed_at = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True, default="")
    summary = models.JSONField(default=dict)
    reopened_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
                                    related_name="lunch_days_reopened")
    reopened_at = models.DateTimeField(null=True, blank=True)
    reopen_reason = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["lunch_day_id", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["lunch_day"], condition=models.Q(reopened_at__isnull=True),
                                    name="lunch_day_one_active_close"),
            models.CheckConstraint(condition=models.Q(reopened_at__isnull=True) | ~models.Q(reopen_reason=""),
                                   name="lunch_day_reopen_close_needs_reason"),
        ]


# =========================================================================
# SF73: ẢNH SUẤT ĂN THỰC TẾ (01/10/2026)
# =========================================================================
MAX_MEAL_PHOTOS_PER_DAY = 5


class MealPhoto(models.Model):
    """Ảnh suất ăn thực tế của một ngày ăn. Quản lý tải, tối đa 5 ảnh/ngày; Hiệu trưởng chỉ xem.

    File lưu trên ổ server (MEDIA_ROOT), đã nén lại JPEG ≤ 1600px và bỏ EXIF (vị trí GPS). Không công khai:
    chỉ tải qua API cần đăng nhập.
    """

    lunch_day = models.ForeignKey(LunchDay, on_delete=models.PROTECT, related_name="photos")
    image = models.FileField(upload_to="meal_photos/", max_length=200)
    note = models.CharField(max_length=200, blank=True, default="")
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    size = models.PositiveIntegerField()
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="meal_photos")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["lunch_day_id", "id"]
