"""API đơn đặt hàng và nhận hàng theo đơn (SF64, contract G2 §4). Nghiệp vụ ở purchase_services.py.

Phiếu nhận tạo ở đây là NHÁP; chốt bằng POST /api/receipts/<id>/post/ (services.post_receipt).
"""

from django.db import transaction
from django.http import JsonResponse

from . import audit, purchase_services as ps
from .auth_views import inventory_permission_required
from .http_input import (
    check_decimal,
    check_int,
    field_error,
    json_api,
    method_not_allowed,
    only_fields,
    read_object,
    req_date,
    req_id,
    req_int,
    req_list,
    req_str,
)
from .models import PurchaseOrder


def _orders():
    return PurchaseOrder.objects.select_related("supplier", "demand_revision__lunch_day").prefetch_related("lines__food")


@inventory_permission_required
@json_api
def purchase_orders(request):
    if request.method == "GET":
        rows = _orders().order_by("-id")
        status = request.GET.get("status")
        if status:
            rows = rows.filter(status=status)
        return JsonResponse({"results": [ps.order_payload(o) for o in rows[:200]]})
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"supplier_id", "expected_date", "note", "lines"})
    supplier_id = req_id(data, "supplier_id", label="Nhà cung cấp")
    expected = req_date(data, "expected_date", label="Ngày giao dự kiến")
    note = req_str(data, "note", 2000, required=False, allow_blank=True) or ""
    lines, seen = [], set()
    for i, line in enumerate(req_list(data, "lines", label="Dòng hàng")):
        key = f"lines[{i}]"
        if not isinstance(line, dict) or set(line) - {"food_id", "qty_ordered", "unit_price_est"}:
            raise field_error(key, "Chỉ nhận food_id, qty_ordered, unit_price_est.", f"Dòng {i + 1} không hợp lệ.")
        food_id = check_int(line.get("food_id"), f"{key}.food_id", minimum=1, label=f"Mặt hàng dòng {i + 1}")
        if food_id in seen:
            raise field_error(f"{key}.food_id", "Trùng mặt hàng.", f"Dòng {i + 1}: mặt hàng bị lặp.")
        seen.add(food_id)
        qty = check_decimal(line.get("qty_ordered"), f"{key}.qty_ordered", 14, 3, label=f"Số lượng dòng {i + 1}")
        price = line.get("unit_price_est")
        price = None if price in (None, "") else check_decimal(price, f"{key}.unit_price_est", 14, 2, label=f"Đơn giá dòng {i + 1}")
        lines.append((food_id, qty, price))
    with transaction.atomic():
        order = ps.create(supplier_id, expected, lines, request.user, note)
        audit.record(request, "po_create", "purchase_order", order.id, f"Tạo đơn {order.code}")
    return JsonResponse(ps.order_payload(_orders().get(id=order.id)), status=201)


@inventory_permission_required
@json_api
def purchase_order_from_demand(request):
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"revision_id", "supplier_id", "expected_date"})
    revision_id = req_id(data, "revision_id", label="Đề xuất")
    supplier_id = req_id(data, "supplier_id", label="Nhà cung cấp")
    expected = req_date(data, "expected_date", label="Ngày giao dự kiến")
    with transaction.atomic():
        order = ps.create_from_demand(revision_id, supplier_id, expected, request.user)
        audit.record(request, "po_create", "purchase_order", order.id, f"Tạo đơn {order.code} từ đề xuất #{revision_id}")
    return JsonResponse(ps.order_payload(_orders().get(id=order.id)), status=201)


@inventory_permission_required
@json_api
def purchase_order_detail(request, po_id):
    if request.method != "GET":
        return method_not_allowed()
    return JsonResponse(ps.order_payload(_orders().get(id=po_id)))


ACTIONS = {
    "approve": (ps.approve, "po_approve", "Duyệt đơn", False),
    "send": (ps.mark_sent, "po_send", "Đánh dấu đã gửi đơn", False),
    "cancel": (ps.cancel, "po_cancel", "Hủy đơn", True),
    "close": (ps.close_remaining, "po_close", "Đóng phần còn lại của đơn", True),
}


@inventory_permission_required
@json_api
def purchase_order_action(request, po_id, action):
    if request.method != "POST" or action not in ACTIONS:
        return method_not_allowed()
    func, audit_action, label, needs_reason = ACTIONS[action]
    data = read_object(request)
    only_fields(data, {"version", "reason"})
    version = req_int(data, "version", minimum=1, label="Phiên bản")
    args = [po_id, version]
    if needs_reason:
        args.append(req_str(data, "reason", 255, label="Lý do"))
    with transaction.atomic():
        order = func(*args)
        audit.record(request, audit_action, "purchase_order", order.id,
                     f"{label} {order.code}" + (f": {args[2]}" if needs_reason else ""))
    return JsonResponse(ps.order_payload(_orders().get(id=order.id)))


@inventory_permission_required
@json_api
def purchase_order_receipts(request, po_id):
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"date", "note", "lines"})
    receipt_date = req_date(data, "date", label="Ngày nhận")
    note = req_str(data, "note", 2000, required=False, allow_blank=True) or ""
    lines, seen = [], set()
    for i, line in enumerate(req_list(data, "lines", label="Dòng nhận")):
        key = f"lines[{i}]"
        if not isinstance(line, dict) or set(line) - {"po_line_id", "quantity", "unit_price"}:
            raise field_error(key, "Chỉ nhận po_line_id, quantity, unit_price.", f"Dòng {i + 1} không hợp lệ.")
        po_line_id = check_int(line.get("po_line_id"), f"{key}.po_line_id", minimum=1, label=f"Dòng đơn {i + 1}")
        if po_line_id in seen:
            raise field_error(f"{key}.po_line_id", "Trùng dòng đơn.", f"Dòng {i + 1}: dòng đơn bị lặp.")
        seen.add(po_line_id)
        lines.append((po_line_id,
                      check_decimal(line.get("quantity"), f"{key}.quantity", 14, 3, label=f"Số lượng dòng {i + 1}"),
                      check_decimal(line.get("unit_price"), f"{key}.unit_price", 14, 2, label=f"Đơn giá dòng {i + 1}")))
    with transaction.atomic():
        receipt = ps.create_receipt(po_id, receipt_date, lines, request.user, note)
        audit.record(request, "po_receipt_create", "receipt", receipt.id, f"Tạo phiếu nhận nháp theo đơn #{po_id}")
    from .views import _receipt_payload

    return JsonResponse(_receipt_payload(receipt), status=201)
