"""SF61/62/64: đơn đặt hàng và nhận hàng theo đơn (contract G2 §3).

Vòng đời: draft → approved → sent → closed (nhận đủ hoặc đóng phần còn lại); draft/approved hủy được.
Mọi thao tác đổi trạng thái kiểm version (khóa lạc quan) → sai version 409. Hủy/đóng bỏ giữ phần
allocation "đơn đang chờ" chưa về. Chốt phiếu nhận hàng ở services.post_receipt.
"""

from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from .http_input import Conflict, InputError, field_error
from .models import (
    DemandRevision,
    FoodItem,
    PurchaseOrder,
    PurchaseOrderLine,
    Receipt,
    ReceiptLine,
    StockAllocation,
    Supplier,
)
from .services import create_receipt_draft

Status = PurchaseOrder.Status


def _supplier(supplier_id):
    supplier = Supplier.objects.filter(id=supplier_id, is_active=True).first()
    if supplier is None:
        raise field_error("supplier_id", "Không tồn tại hoặc đã ngừng.", "Nhà cung cấp không tồn tại hoặc đã ngừng.")
    return supplier


def _next_code(on):
    prefix = f"DH{on:%Y%m%d}-"
    n = PurchaseOrder.objects.filter(code__startswith=prefix).count() + 1
    while PurchaseOrder.objects.filter(code=f"{prefix}{n}").exists():
        n += 1
    return f"{prefix}{n}"


def _lock(po_id, version):
    order = PurchaseOrder.objects.select_for_update(of=("self",)).get(id=po_id)
    if version != order.version:
        raise Conflict(f"Đơn {order.code} đã được cập nhật (phiên bản {order.version}). Tải lại rồi thử lại.")
    return order


def _bump(order, **fields):
    for k, v in fields.items():
        setattr(order, k, v)
    order.version += 1
    order.save(update_fields=[*fields, "version"])
    return order


@transaction.atomic
def create(supplier_id, expected_date, lines, user, note=""):
    """Đơn tay. lines: [(food_id, qty_ordered Decimal, unit_price_est Decimal|None)]."""
    supplier = _supplier(supplier_id)
    if not lines:
        raise field_error("lines", "Cần ít nhất một dòng.", "Đơn đặt cần ít nhất một mặt hàng.")
    foods = FoodItem.objects.in_bulk([fid for fid, _, _ in lines])
    missing = [fid for fid, _, _ in lines if fid not in foods]
    if missing:
        raise InputError(f"Mặt hàng không tồn tại: {missing}.")
    order = PurchaseOrder.objects.create(code=_next_code(timezone.localdate()), supplier=supplier,
                                         expected_date=expected_date, note=note, created_by=user)
    PurchaseOrderLine.objects.bulk_create([
        PurchaseOrderLine(order=order, food_id=fid, qty_ordered=qty, unit_price_est=price) for fid, qty, price in lines
    ])
    return order


@transaction.atomic
def create_from_demand(revision_id, supplier_id, expected_date, user):
    """Đơn từ đề xuất đã duyệt: mỗi dòng = to_buy; giữ lượng đó cho ngày ăn (allocation po_line)."""
    revision = DemandRevision.objects.select_for_update(of=("self",)).select_related("lunch_day").get(id=revision_id)
    if revision.status != DemandRevision.Status.APPROVED:
        raise Conflict("Chỉ tạo đơn từ đề xuất đã duyệt và còn hiệu lực.")
    if revision.purchase_orders.exclude(status=Status.CANCELLED).exists():
        raise Conflict("Đề xuất này đã có đơn đặt.")
    if expected_date > revision.lunch_day.date:
        raise field_error("expected_date", "Phải về trước ngày ăn.", "Ngày giao dự kiến phải không muộn hơn ngày ăn.")
    lines = list(revision.lines.filter(to_buy_qty__gt=0).order_by("food_id"))
    if not lines:
        raise Conflict("Đề xuất không cần mua thêm gì.")
    supplier = _supplier(supplier_id)
    order = PurchaseOrder.objects.create(code=_next_code(timezone.localdate()), supplier=supplier,
                                         expected_date=expected_date, demand_revision=revision, created_by=user,
                                         note=f"Từ đề xuất ngày {revision.lunch_day.date:%d/%m/%Y}")
    for line in lines:
        po_line = PurchaseOrderLine.objects.create(order=order, food_id=line.food_id, qty_ordered=line.to_buy_qty)
        StockAllocation.objects.create(lunch_day=revision.lunch_day, demand_line=line, food_id=line.food_id,
                                       source=StockAllocation.Source.PO_LINE, po_line=po_line, qty=line.to_buy_qty)
    return order


@transaction.atomic
def approve(po_id, version):
    order = _lock(po_id, version)
    if order.status != Status.DRAFT:
        raise Conflict("Chỉ duyệt đơn nháp.")
    return _bump(order, status=Status.APPROVED, approved_at=timezone.now())


@transaction.atomic
def mark_sent(po_id, version):
    order = _lock(po_id, version)
    if order.status != Status.APPROVED:
        raise Conflict("Chỉ đánh dấu đã gửi cho đơn đã duyệt.")
    return _bump(order, status=Status.SENT, sent_at=timezone.now())


def _release_open(order):
    allocations = (StockAllocation.objects.filter(po_line__order=order, status=StockAllocation.Status.RESERVED)
                   .order_by("id").select_for_update())
    for alloc in allocations:
        alloc.status = StockAllocation.Status.RELEASED
        alloc.save(update_fields=["status", "updated_at"])


@transaction.atomic
def cancel(po_id, version, reason):
    order = _lock(po_id, version)
    if order.status not in (Status.DRAFT, Status.APPROVED):
        raise Conflict("Chỉ hủy đơn nháp hoặc đã duyệt chưa gửi; đơn đã gửi thì đóng phần còn lại.")
    _release_open(order)
    return _bump(order, status=Status.CANCELLED, close_reason=reason, closed_at=timezone.now())


@transaction.atomic
def close_remaining(po_id, version, reason):
    order = _lock(po_id, version)
    if order.status != Status.SENT:
        raise Conflict("Chỉ đóng phần còn lại của đơn đã gửi.")
    _release_open(order)
    return _bump(order, status=Status.CLOSED, close_reason=reason, closed_at=timezone.now())


@transaction.atomic
def create_receipt(po_id, receipt_date, lines, user, note=""):
    """Phiếu nhập NHÁP theo đơn. lines: [(po_line_id, quantity, unit_price)]; lượng ≤ phần còn chờ."""
    order = PurchaseOrder.objects.select_for_update(of=("self",)).get(id=po_id)
    if order.status != Status.SENT:
        raise Conflict("Chỉ nhận hàng cho đơn đã gửi nhà cung cấp.")
    po_lines = {pl.id: pl for pl in order.lines.all()}
    payload = []
    for i, (po_line_id, qty, price) in enumerate(lines):
        pl = po_lines.get(po_line_id)
        if pl is None:
            raise field_error(f"lines[{i}].po_line_id", "Không thuộc đơn này.", f"Dòng {i + 1} không thuộc đơn {order.code}.")
        if qty > pl.qty_open:
            raise Conflict(f"Dòng {i + 1}: nhận {qty} vượt phần còn chờ {pl.qty_open}.")
        payload.append({"food_id": pl.food_id, "quantity": str(qty), "unit_price": str(price)})
    receipt = create_receipt_draft(supplier_id=order.supplier_id, date=receipt_date, lines=payload, user=user,
                                   note=note or f"Nhận theo đơn {order.code}")
    by_food = {pl.food_id: pl.id for pl in po_lines.values()}
    for rl in receipt.lines.all():
        ReceiptLine.objects.filter(pk=rl.pk).update(po_line_id=by_food[rl.food_id])
    return Receipt.objects.get(pk=receipt.pk)


def order_payload(order):
    lines = list(order.lines.select_related("food").order_by("id"))
    drafts = (Receipt.objects.filter(lines__po_line__order=order).annotate(n=Count("lines")).distinct().order_by("id"))
    return {
        "id": order.id,
        "code": order.code,
        "supplier_id": order.supplier_id,
        "supplier_name": order.supplier.name,
        "status": order.status,
        "expected_date": order.expected_date.isoformat(),
        "note": order.note,
        "version": order.version,
        "demand_revision_id": order.demand_revision_id,
        "lunch_date": order.demand_revision.lunch_day.date.isoformat() if order.demand_revision_id else None,
        "close_reason": order.close_reason,
        "created_at": order.created_at.isoformat(),
        "sent_at": order.sent_at.isoformat() if order.sent_at else None,
        "closed_at": order.closed_at.isoformat() if order.closed_at else None,
        "lines": [
            {"id": pl.id, "food_id": pl.food_id, "food_name": pl.food.name, "unit": pl.food.unit,
             "qty_ordered": str(pl.qty_ordered), "qty_received": str(pl.qty_received), "qty_open": str(pl.qty_open),
             "unit_price_est": None if pl.unit_price_est is None else str(pl.unit_price_est)}
            for pl in lines
        ],
        "receipts": [{"id": r.id, "date": r.date.isoformat(), "status": r.status.upper()} for r in drafts],
    }

