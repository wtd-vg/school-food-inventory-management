"""Tạo nháp SF19. Contract post_receipt được bàn giao cho SF20 trong architecture.md."""

from datetime import date as CalendarDate, datetime
from decimal import Decimal, InvalidOperation

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from .models import Receipt, ReceiptLine


def _positive_decimal(value, field):
    # API gửi Decimal bằng chuỗi; không nhận float/bool để tránh mất độ chính xác.
    if isinstance(value, bool) or not isinstance(value, (str, int, Decimal)):
        raise ValidationError({field: "Phải là số thập phân dạng chuỗi."})
    try:
        number = Decimal(value)
    except InvalidOperation:
        raise ValidationError({field: "Số thập phân không hợp lệ."})
    if not number.is_finite() or number <= 0:
        raise ValidationError({field: "Phải lớn hơn 0 và là số hữu hạn."})
    return number


@transaction.atomic
def create_receipt_draft(*, supplier_id, date, lines, user, note=""):
    """Lưu toàn bộ phiếu hoặc không lưu gì; user phải đến từ session của view."""
    if not user.is_authenticated or user.pk is None or not user.is_active:
        raise PermissionDenied("Cần tài khoản đang hoạt động để lập phiếu.")
    if isinstance(supplier_id, bool) or not isinstance(supplier_id, int) or supplier_id <= 0:
        raise ValidationError({"supplier_id": "Nhà cung cấp không hợp lệ."})
    if not isinstance(note, str):
        raise ValidationError({"note": "Ghi chú phải là chuỗi."})
    if not isinstance(date, (str, CalendarDate)) or isinstance(date, datetime):
        raise ValidationError({"date": "Ngày phải có dạng YYYY-MM-DD."})
    if not isinstance(lines, list) or not lines:
        raise ValidationError({"lines": "Phiếu nháp phải có ít nhất một dòng hợp lệ."})

    receipt = Receipt(supplier_id=supplier_id, date=date, note=note.strip(), created_by=user)
    receipt.full_clean()
    validated_lines = []
    seen_food_ids = set()
    for index, data in enumerate(lines, start=1):
        prefix = f"lines.{index}"
        if not isinstance(data, dict) or set(data) != {"food_id", "quantity", "unit_price"}:
            raise ValidationError({prefix: "Mỗi dòng chỉ nhận food_id, quantity và unit_price."})
        food_id = data["food_id"]
        if isinstance(food_id, bool) or not isinstance(food_id, int) or food_id <= 0:
            raise ValidationError({prefix: "Thực phẩm không hợp lệ."})
        if food_id in seen_food_ids:
            raise ValidationError({prefix: "Một thực phẩm chỉ được xuất hiện một lần trong phiếu."})
        seen_food_ids.add(food_id)
        line = ReceiptLine(
            food_id=food_id,
            quantity=_positive_decimal(data["quantity"], f"{prefix}.quantity"),
            unit_price=_positive_decimal(data["unit_price"], f"{prefix}.unit_price"),
        )
        # Chưa có id phiếu; kiểm tra các field còn lại trước khi ghi bất kỳ dòng nào.
        line.full_clean(exclude=["receipt"])
        validated_lines.append(line)

    receipt.save()
    for line in validated_lines:
        line.receipt = receipt
        line.save()
    return receipt
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from .models import FoodItem, StockTake, StockTakeItem, InventoryLedger

@transaction.atomic
def create_stocktake(food_ids):
    foods = FoodItem.objects.filter(id__in=food_ids).select_for_update()
    if not foods:
        raise ValidationError("No valid food items provided.")
    
    st = StockTake.objects.create(status='draft')
    items = []
    for food in foods:
        items.append(StockTakeItem(
            stock_take=st,
            food=food,
            snapshot_qty=food.quantity,
            snapshot_cost=food.avg_cost,
            snapshot_version=food.stock_version,
            counted_qty=None,
            variance=0
        ))
    StockTakeItem.objects.bulk_create(items)
    return st

@transaction.atomic
def update_stocktake_item(item_id, counted_qty):
    if counted_qty is None or Decimal(counted_qty) < 0:
        raise ValidationError("counted_qty must be a non-negative number.")
    
    item = StockTakeItem.objects.select_related('stock_take').get(id=item_id)
    if item.stock_take.status != 'draft':
        raise ValidationError("Can only update draft stock takes.")
    
    item.counted_qty = Decimal(counted_qty)
    item.variance = item.counted_qty - item.snapshot_qty
    item.save(update_fields=['counted_qty', 'variance'])
    return item

@transaction.atomic
def post_stocktake(stocktake_id):
    # Lock the stocktake first to avoid concurrent posting
    try:
        st = StockTake.objects.select_for_update(nowait=True).get(id=stocktake_id)
    except Exception:
        raise ValidationError("StockTake is already being processed.")

    if st.status != 'draft':
        raise ValidationError("Only draft stock takes can be posted.")

    items = list(st.items.select_related('food').all())
    food_ids = [item.food_id for item in items]
    
    # Lock foods to prevent concurrent stock updates
    foods = {f.id: f for f in FoodItem.objects.filter(id__in=food_ids).select_for_update()}

    for item in items:
        if item.counted_qty is None:
            raise ValidationError(f"Food {item.food.name} has not been counted.")
        
        current_food = foods[item.food_id]
        if current_food.stock_version != item.snapshot_version:
            # 409 Conflict logic
            raise ValueError(f"Snapshot for {current_food.name} is outdated.")
            
        variance = item.counted_qty - item.snapshot_qty
        
        # Only create ledger if there is a variance
        if variance != 0:
            InventoryLedger.objects.create(
                food=current_food,
                transaction_type='ADJUST',
                quantity_change=variance,
                cost=current_food.avg_cost,
                reference=f"StockTake {st.id}"
            )
        
        # Update food
        current_food.quantity = item.counted_qty
        current_food.stock_version += 1
        current_food.save(update_fields=['quantity', 'stock_version'])
    
    st.status = 'posted'
    st.save(update_fields=['status'])
    return st
