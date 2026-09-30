"""Tạo nháp SF19. Contract post_receipt được bàn giao cho SF20 trong architecture.md."""

from datetime import date as CalendarDate, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.utils import timezone
from .models import (
    FoodItem, Issue, IssueLine, Receipt, ReceiptLine, StockTake, StockTakeItem, StockTransaction,
)
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction


class InventoryConflict(ValidationError):
    """Xung đột trạng thái/tồn kho → view trả 409.

    Kế thừa ValidationError để code và test cũ (bắt ValidationError) vẫn chạy.
    """


class StaleStocktake(InventoryConflict):
    """Tồn kho đã đổi sau khi mở kiểm kê (stock_version khác snapshot) → 409, lập lại kiểm kê."""



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


# =========================================================================
# SF20: CHỐT PHIẾU NHẬP (theo contract SF19)
# =========================================================================
@transaction.atomic
def post_receipt(receipt_id, user=None):
    """Chốt phiếu nhập: khóa phiếu → khóa food theo id tăng dần → cập nhật tồn/giá bình quân →
    ghi đúng một bút toán IN mỗi dòng → posted. Lỗi bất kỳ bước nào rollback toàn bộ.

    Giá bình quân gia quyền: (tồn cũ × giá cũ + lượng nhập × giá nhập) / tồn mới,
    làm tròn 2 số lẻ ROUND_HALF_UP (không dùng round() vì Python làm tròn kiểu ngân hàng).
    """
    receipt = Receipt.objects.select_for_update(of=("self",)).get(id=receipt_id)
    if receipt.status != Receipt.Status.DRAFT:
        raise InventoryConflict("Chỉ có thể chốt phiếu nhập ở trạng thái nháp.")
    actor = user if user is not None and getattr(user, "is_authenticated", False) else receipt.created_by

    lines = list(receipt.lines.order_by("id"))
    if not lines:
        raise ValidationError("Phiếu nhập không có dòng hàng nào.")

    food_ids = sorted({line.food_id for line in lines})
    foods = {f.id: f for f in FoodItem.objects.filter(id__in=food_ids).order_by("id").select_for_update()}

    for line in lines:
        food = foods[line.food_id]
        if not food.is_active:
            raise ValidationError(f"Thực phẩm {food.name} đang bị khóa.")
        if line.quantity <= 0 or line.unit_price <= 0:
            raise ValidationError("Số lượng và đơn giá nhập phải lớn hơn 0.")

        new_qty = food.quantity + line.quantity
        new_avg = (food.quantity * food.avg_cost + line.quantity * line.unit_price) / new_qty
        food.quantity = new_qty
        food.avg_cost = new_avg.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        food.stock_version += 1
        food.save(update_fields=["quantity", "avg_cost", "stock_version"])

        StockTransaction.objects.create(
            receipt_line=line,
            food=food,
            type=StockTransaction.Type.IN,
            quantity_delta=line.quantity,
            unit_cost=line.unit_price,
            value_delta=(line.quantity * line.unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            date=receipt.date,
            created_by=actor,
        )

    receipt.status = Receipt.Status.POSTED
    receipt.posted_at = timezone.now()
    receipt.save(update_fields=["status", "posted_at"])
    return receipt


# =========================================================================
# SF31 contract · SF32 nghiệp vụ: KIỂM KÊ
# =========================================================================
def _parse_counted_qty(value):
    """Số đếm: chuỗi/số nguyên/Decimal, hữu hạn, >= 0, tối đa 3 số lẻ. Không nhận bool; float
    được đổi qua str() để không mang sai số nhị phân (UI cũ gửi number)."""
    if isinstance(value, bool) or value is None:
        raise ValidationError({"counted_qty": "Số đếm là bắt buộc và phải là số."})
    if isinstance(value, float):
        value = str(value)
    if not isinstance(value, (str, int, Decimal)):
        raise ValidationError({"counted_qty": "Số đếm phải là số thập phân dạng chuỗi."})
    try:
        number = Decimal(value)
    except InvalidOperation:
        raise ValidationError({"counted_qty": "Số đếm không hợp lệ."})
    if not number.is_finite() or number < 0:
        raise ValidationError({"counted_qty": "Số đếm phải là số hữu hạn, không âm."})
    if number != number.quantize(Decimal("0.001")):
        raise ValidationError({"counted_qty": "Số đếm tối đa 3 chữ số thập phân."})
    return number.quantize(Decimal("0.001"))


@transaction.atomic
def create_stocktake(food_ids, user=None, date=None, note=""):
    """Mở kiểm kê: khóa food theo id tăng dần và chụp snapshot tồn, giá vốn, stock_version."""
    if not isinstance(food_ids, list) or not food_ids:
        raise ValidationError("food_ids phải là danh sách không rỗng.")
    if any(isinstance(i, bool) or not isinstance(i, int) or i <= 0 for i in food_ids):
        raise ValidationError("food_ids chỉ gồm id số nguyên dương.")
    if len(set(food_ids)) != len(food_ids):
        raise ValidationError("Một thực phẩm chỉ xuất hiện một lần trong phiếu kiểm kê.")

    foods = list(FoodItem.objects.filter(id__in=food_ids).order_by("id").select_for_update())
    missing = sorted(set(food_ids) - {f.id for f in foods})
    if missing:
        raise ValidationError(f"Thực phẩm không tồn tại: {missing}.")

    creator = user if user is not None and getattr(user, "is_authenticated", False) else None
    st = StockTake.objects.create(
        status=StockTake.Status.DRAFT, date=date or timezone.localdate(), note=note, created_by=creator,
    )
    StockTakeItem.objects.bulk_create([
        StockTakeItem(
            stock_take=st, food=food,
            snapshot_qty=food.quantity, snapshot_cost=food.avg_cost, snapshot_version=food.stock_version,
            counted_qty=None, variance=Decimal("0"),
        )
        for food in foods
    ])
    return st


@transaction.atomic
def update_stocktake_item(item_id, counted_qty):
    """Ghi số đếm cho một dòng nháp. Chưa đổi tồn; variance = đếm − snapshot."""
    counted = _parse_counted_qty(counted_qty)
    item = StockTakeItem.objects.select_related("stock_take").select_for_update(of=("self",)).get(id=item_id)
    if item.stock_take.status != StockTake.Status.DRAFT:
        raise InventoryConflict("Phiếu kiểm kê đã chốt, không sửa số đếm được.")
    item.counted_qty = counted
    item.variance = counted - item.snapshot_qty
    item.save(update_fields=["counted_qty", "variance"])
    return item


@transaction.atomic
def post_stocktake(stocktake_id, user=None):
    """SF31: chốt kiểm kê.

    1. Khóa phiếu (chờ, không nowait); không còn draft → InventoryConflict (409).
    2. Mọi dòng phải đã đếm (NULL khác 0).
    3. Khóa food theo id tăng dần; food nào có stock_version khác snapshot → StaleStocktake (409):
       có nhập/xuất sau khi mở kiểm kê, số đếm cũ không được ghi đè tồn mới → lập lại kiểm kê.
    4. Dòng có chênh lệch ≠ 0: tồn mới = số đếm, avg_cost giữ nguyên, version + 1, ghi đúng một
       bút toán ADJUST (giá = giá snapshot). Chênh lệch 0: không ghi sổ, không đổi version.
    5. posted, posted_by, posted_at. Chênh lệch chỉ là sai khác số liệu, không kết luận gian lận.
    """
    st = StockTake.objects.select_for_update(of=("self",)).get(id=stocktake_id)
    if st.status != StockTake.Status.DRAFT:
        raise InventoryConflict("Phiếu kiểm kê đã được chốt trước đó.")
    poster = user if user is not None and getattr(user, "is_authenticated", False) else st.created_by

    items = list(st.items.order_by("id"))
    if not items:
        raise ValidationError("Phiếu kiểm kê không có dòng nào.")
    uncounted = [item.food_id for item in items if item.counted_qty is None]
    if uncounted:
        names = ", ".join(FoodItem.objects.filter(id__in=uncounted).order_by("id").values_list("name", flat=True))
        raise ValidationError(f"Chưa nhập số đếm cho: {names}.")

    foods = {f.id: f for f in FoodItem.objects.filter(id__in=[i.food_id for i in items]).order_by("id").select_for_update()}
    stale = [foods[i.food_id].name for i in items if foods[i.food_id].stock_version != i.snapshot_version]
    if stale:
        raise StaleStocktake(
            "Tồn kho đã thay đổi sau khi mở kiểm kê (" + ", ".join(stale) + "). Hãy lập lại phiếu kiểm kê."
        )
    if poster is None:
        raise PermissionDenied("Cần người chốt kiểm kê.")

    for item in items:
        variance = item.counted_qty - item.snapshot_qty
        if variance == 0:
            continue
        food = foods[item.food_id]
        food.quantity = item.counted_qty
        food.stock_version += 1
        food.save(update_fields=["quantity", "stock_version"])
        StockTransaction.objects.create(
            stocktake_item=item,
            food=food,
            type=StockTransaction.Type.ADJUST,
            quantity_delta=variance,
            unit_cost=item.snapshot_cost,
            value_delta=(variance * item.snapshot_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            date=st.date,
            created_by=poster,
        )

    st.status = StockTake.Status.POSTED
    st.posted_by = poster
    st.posted_at = timezone.now()
    st.save(update_fields=["status", "posted_by", "posted_at", "updated_at"])
    return st

# =========================================================================
# SF25 contract · SF26 nghiệp vụ: CHỐT XUẤT KHO & CHỐNG ÂM KHO
# =========================================================================
@transaction.atomic
def post_issue(issue_id, user=None):
    """SF25: chốt phiếu xuất theo contract trong architecture.md (mục SF25).

    Thứ tự bắt buộc: khóa phiếu → khóa FoodItem theo id tăng dần → kiểm tra đủ tồn cho TẤT CẢ
    dòng → chụp giá vốn → trừ tồn, tăng version → ghi đúng một bút toán OUT mỗi dòng → posted.
    Lỗi ở bất kỳ bước nào rollback toàn bộ. `user` là người chốt (ghi vào sổ kho); tạm thời
    nếu view chưa truyền thì dùng người lập phiếu.
    """
    issue = Issue.objects.select_for_update(of=("self",)).get(id=issue_id)
    if issue.status != Issue.Status.DRAFT:
        raise InventoryConflict("Phiếu xuất đã được chốt trước đó.")
    actor = user if user is not None and getattr(user, "is_authenticated", False) else issue.created_by

    lines = list(issue.lines.order_by("id"))
    if not lines:
        raise ValidationError("Phiếu xuất không có dòng hàng nào.")

    food_ids = sorted({line.food_id for line in lines})
    foods = {f.id: f for f in FoodItem.objects.filter(id__in=food_ids).order_by("id").select_for_update()}

    # 1. Kiểm tra toàn phiếu trước khi ghi bất kỳ dòng nào.
    for line in lines:
        food = foods[line.food_id]
        if line.quantity <= 0:
            raise ValidationError("Số lượng xuất phải lớn hơn 0.")
        if food.quantity < line.quantity:
            raise InventoryConflict(
                f"Không đủ tồn kho cho '{food.name}'. Tồn kho: {food.quantity}, yêu cầu xuất: {line.quantity}."
            )

    # 2. Trừ tồn (giữ nguyên avg_cost) và ghi sổ kho OUT.
    for line in lines:
        food = foods[line.food_id]
        unit_cost = food.avg_cost
        line.unit_cost = unit_cost
        line.save(update_fields=["unit_cost"])

        food.quantity = food.quantity - line.quantity
        food.stock_version += 1
        food.save(update_fields=["quantity", "stock_version"])

        StockTransaction.objects.create(
            issue_line=line,
            food=food,
            type=StockTransaction.Type.OUT,
            quantity_delta=-line.quantity,
            unit_cost=unit_cost,
            value_delta=-(line.quantity * unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            date=issue.date,
            created_by=actor,
        )

    issue.status = Issue.Status.POSTED
    issue.posted_at = timezone.now()
    issue.save(update_fields=["status", "posted_at"])
    return issue
