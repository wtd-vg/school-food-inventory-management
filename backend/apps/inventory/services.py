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
