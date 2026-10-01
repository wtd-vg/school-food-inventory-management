"""API kho: danh mục, mặt hàng, nhà cung cấp, nhập, xuất, kiểm kê, báo cáo.

Đầu vào đọc qua http_input (BE-09), tiền làm tròn qua services.money/line_value (BE-05), mọi thao tác
ghi có nhật ký audit.record trong cùng transaction (BE-15). Lỗi: {"message", "errors"}.
"""

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone

from . import audit
from .auth_views import inventory_permission_required
from .http_input import (
    Conflict,
    InputError,
    check_decimal,
    check_int,
    error,
    field_error,
    json_api,
    method_not_allowed,
    only_fields,
    opt_bool,
    query_date,
    query_int,
    read_object,
    req_date,
    req_id,
    req_list,
    req_str,
)
from .models import (
    Category,
    FoodItem,
    Issue,
    IssueLine,
    Receipt,
    StockTake,
    StockTakeItem,
    StockTransaction,
    Supplier,
)
from .services import (
    create_receipt_draft,
    create_stocktake,
    document_total,
    line_value,
    money,
    post_issue,
    post_receipt,
    post_stocktake,
    update_stocktake_item,
)

QTY = (14, 3)
PRICE = (14, 2)


def hello(request):
    """Healthcheck công khai: không lộ thông tin hệ thống."""
    return JsonResponse({"ok": True})


# =========================================================================
# DANH MỤC
# =========================================================================
def _category(c):
    return {"id": c.id, "code": c.code, "name": c.name, "is_active": c.is_active}


@inventory_permission_required
@json_api
def categories(request):
    if request.method == "GET":
        return JsonResponse({"results": [_category(c) for c in Category.objects.order_by("id")]})
    if request.method != "POST":
        return method_not_allowed()

    data = read_object(request)
    only_fields(data, {"code", "name", "is_active"})
    code = req_str(data, "code", 32, upper=True, label="Mã nhóm")
    name = req_str(data, "name", 120, label="Tên nhóm")
    is_active = opt_bool(data, "is_active")
    try:
        with transaction.atomic():
            c = Category.objects.create(code=code, name=name, is_active=True if is_active is None else is_active)
            audit.record(request, "category_create", "category", c.id, f"Tạo nhóm {c.code}", after=_category(c))
    except IntegrityError:
        raise Conflict(f"Mã nhóm {code} đã tồn tại.", {"code": "Đã tồn tại."})
    return JsonResponse(_category(c), status=201)


@inventory_permission_required
@json_api
def category_detail(request, category_id):
    if request.method != "PATCH":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"code", "name", "is_active"})
    with transaction.atomic():
        c = Category.objects.select_for_update().get(id=category_id)
        before = _category(c)
        if "code" in data:
            c.code = req_str(data, "code", 32, upper=True, label="Mã nhóm")
        if "name" in data:
            c.name = req_str(data, "name", 120, label="Tên nhóm")
        is_active = opt_bool(data, "is_active")
        if is_active is not None:
            if is_active is False and c.is_active and c.food_items.filter(is_active=True).exists():
                raise Conflict("Không thể ngừng dùng nhóm đang có mặt hàng hoạt động.")
            c.is_active = is_active
        try:
            with transaction.atomic():
                c.save()
        except IntegrityError:
            raise Conflict(f"Mã nhóm {c.code} đã tồn tại.", {"code": "Đã tồn tại."})
        audit.record(request, "category_update", "category", c.id, f"Sửa nhóm {c.code}", before=before, after=_category(c))
    return JsonResponse(_category(c))


# =========================================================================
# MẶT HÀNG
# =========================================================================
STOCK_FIELDS = {"quantity", "avg_cost", "stock_version"}


def _food(f):
    return {
        "id": f.id,
        "code": f.code,
        "name": f.name,
        "category_id": f.category_id,
        "unit": f.unit,
        "is_active": f.is_active,
        "quantity": str(f.quantity),
        "avg_cost": str(f.avg_cost),
        "stock_version": f.stock_version,
    }


def _reject_stock_fields(data):
    blocked = sorted(STOCK_FIELDS & set(data))
    if blocked:
        raise InputError("Không được sửa trực tiếp tồn kho, giá vốn, version.", {k: "Chỉ đổi qua phiếu nhập/xuất/kiểm kê." for k in blocked})


def _category_for(data):
    category_id = req_id(data, "category_id", label="Nhóm")
    try:
        return Category.objects.get(id=category_id)
    except Category.DoesNotExist:
        raise field_error("category_id", "Không tồn tại.", "Nhóm hàng không tồn tại.")


@inventory_permission_required
@json_api
def foods(request):
    if request.method == "GET":
        return JsonResponse({"results": [_food(f) for f in FoodItem.objects.order_by("id")]})
    if request.method != "POST":
        return method_not_allowed()

    data = read_object(request)
    _reject_stock_fields(data)
    only_fields(data, {"code", "name", "category_id", "unit", "is_active"})
    code = req_str(data, "code", 32, upper=True, label="Mã hàng")
    name = req_str(data, "name", 120, label="Tên hàng")
    unit = req_str(data, "unit", 32, lower=True, label="Đơn vị")
    category = _category_for(data)
    is_active = opt_bool(data, "is_active")
    try:
        with transaction.atomic():
            f = FoodItem.objects.create(code=code, name=name, category=category, unit=unit,
                                        is_active=True if is_active is None else is_active)
            audit.record(request, "food_create", "food", f.id, f"Tạo mặt hàng {f.code}", after=_food(f))
    except IntegrityError:
        raise Conflict(f"Mã hàng {code} đã tồn tại.", {"code": "Đã tồn tại."})
    return JsonResponse(_food(f), status=201)


@inventory_permission_required
@json_api
def food_detail(request, food_id):
    if request.method != "PATCH":
        return method_not_allowed()
    data = read_object(request)
    _reject_stock_fields(data)
    only_fields(data, {"code", "name", "category_id", "unit", "is_active"})
    with transaction.atomic():
        f = FoodItem.objects.select_for_update().get(id=food_id)
        before = _food(f)
        if "category_id" in data:
            f.category = _category_for(data)
        if "code" in data:
            f.code = req_str(data, "code", 32, upper=True, label="Mã hàng")
        if "name" in data:
            f.name = req_str(data, "name", 120, label="Tên hàng")
        if "unit" in data:
            unit = req_str(data, "unit", 32, lower=True, label="Đơn vị")
            if unit != f.unit and (f.quantity != 0 or f.recipe_components.exists()):
                raise Conflict("Không đổi đơn vị khi mặt hàng còn tồn hoặc đang dùng trong công thức.")
            f.unit = unit
        is_active = opt_bool(data, "is_active")
        if is_active is not None:
            f.is_active = is_active
        try:
            with transaction.atomic():
                f.save()
        except IntegrityError:
            raise Conflict(f"Mã hàng {f.code} đã tồn tại.", {"code": "Đã tồn tại."})
        audit.record(request, "food_update", "food", f.id, f"Sửa mặt hàng {f.code}", before=before, after=_food(f))
    return JsonResponse(_food(f))


# =========================================================================
# NHÀ CUNG CẤP
# =========================================================================
def _supplier(s):
    return {"id": s.id, "code": s.code, "name": s.name, "phone": s.phone, "is_active": s.is_active}


@inventory_permission_required
@json_api
def suppliers(request):
    if request.method == "GET":
        return JsonResponse({"results": [_supplier(s) for s in Supplier.objects.order_by("id")]})
    if request.method != "POST":
        return method_not_allowed()

    data = read_object(request)
    only_fields(data, {"code", "name", "phone", "is_active"})
    code = req_str(data, "code", 32, upper=True, label="Mã nhà cung cấp")
    name = req_str(data, "name", 120, label="Tên nhà cung cấp")
    phone = req_str(data, "phone", 32, required=False, allow_blank=True, label="Số điện thoại") or ""
    is_active = opt_bool(data, "is_active")
    try:
        with transaction.atomic():
            s = Supplier.objects.create(code=code, name=name, phone=phone, is_active=True if is_active is None else is_active)
            audit.record(request, "supplier_create", "supplier", s.id, f"Tạo nhà cung cấp {s.code}", after=_supplier(s))
    except IntegrityError:
        raise Conflict(f"Mã nhà cung cấp {code} đã tồn tại.", {"code": "Đã tồn tại."})
    return JsonResponse(_supplier(s), status=201)


@inventory_permission_required
@json_api
def supplier_detail(request, supplier_id):
    if request.method != "PATCH":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"code", "name", "phone", "is_active"})
    with transaction.atomic():
        s = Supplier.objects.select_for_update().get(id=supplier_id)
        before = _supplier(s)
        if "code" in data:
            s.code = req_str(data, "code", 32, upper=True, label="Mã nhà cung cấp")
        if "name" in data:
            s.name = req_str(data, "name", 120, label="Tên nhà cung cấp")
        if "phone" in data:
            s.phone = req_str(data, "phone", 32, allow_blank=True, label="Số điện thoại")
        is_active = opt_bool(data, "is_active")
        if is_active is not None:
            s.is_active = is_active
        try:
            with transaction.atomic():
                s.save()
        except IntegrityError:
            raise Conflict(f"Mã nhà cung cấp {s.code} đã tồn tại.", {"code": "Đã tồn tại."})
        audit.record(request, "supplier_update", "supplier", s.id, f"Sửa nhà cung cấp {s.code}", before=before, after=_supplier(s))
    return JsonResponse(_supplier(s))


# =========================================================================
# KIỂM KÊ (SF31/SF32)
# =========================================================================
def _stocktake_payload(st):
    items = list(st.items.select_related("food").order_by("id"))
    return {
        "id": st.id,
        "date": str(st.date) if st.date else None,
        "status": st.status,
        "note": st.note,
        "posted_at": st.posted_at.isoformat() if st.posted_at else None,
        "items": [
            {
                "id": item.id,
                "food_id": item.food_id,
                "food_name": item.food.name,
                "unit": item.food.unit,
                "snapshot_qty": str(item.snapshot_qty),
                "snapshot_cost": str(item.snapshot_cost),
                "snapshot_version": item.snapshot_version,
                "counted_qty": None if item.counted_qty is None else str(item.counted_qty),
                "variance": str(item.variance),
            }
            for item in items
        ],
    }


@inventory_permission_required
@json_api
def stocktakes(request):
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"food_ids", "note"})
    food_ids = req_list(data, "food_ids", label="Danh sách mặt hàng")
    for i, food_id in enumerate(food_ids):
        check_int(food_id, f"food_ids[{i}]", minimum=1, label="Mã mặt hàng")
    note = req_str(data, "note", 2000, required=False, allow_blank=True) or ""
    with transaction.atomic():
        st = create_stocktake(food_ids, request.user, note=note)
        audit.record(request, "stocktake_create", "stocktake", st.id, f"Mở kiểm kê {len(food_ids)} mặt hàng")
    return JsonResponse(_stocktake_payload(st), status=201)


@inventory_permission_required
@json_api
def stocktake_items(request, item_id):
    if request.method != "PATCH":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"counted_qty"})
    if "counted_qty" not in data:
        raise field_error("counted_qty", "Trường này là bắt buộc.", "Thiếu số đếm.")
    counted = check_decimal(data["counted_qty"], "counted_qty", *QTY, allow_zero=True, label="Số đếm")
    with transaction.atomic():
        item = update_stocktake_item(item_id, str(counted))
        audit.record(request, "stocktake_count", "stocktake", item.stock_take_id,
                     f"Nhập số đếm mặt hàng #{item.food_id}", changes={"counted_qty": [None, str(item.counted_qty)]})
    return JsonResponse({"id": item.id, "counted_qty": str(item.counted_qty), "variance": str(item.variance)})


@inventory_permission_required
@json_api
def stocktake_post(request, stocktake_id):
    if request.method != "POST":
        return method_not_allowed()
    with transaction.atomic():
        st = post_stocktake(stocktake_id, request.user)
        audit.record(request, "stocktake_post", "stocktake", st.id, "Chốt kiểm kê")
    return JsonResponse(_stocktake_payload(st))


# =========================================================================
# BÁO CÁO (đọc sổ kho duy nhất StockTransaction)
# =========================================================================
def _transaction_reference(tx):
    if tx.receipt_line_id:
        return f"Receipt #{tx.receipt_line.receipt_id}"
    if tx.issue_line_id:
        return f"Issue {tx.issue_line.issue.code}"
    if tx.stocktake_item_id:
        return f"StockTake #{tx.stocktake_item.stock_take_id}"
    return ""


@inventory_permission_required
@json_api
def reports_stock(request):
    if request.method != "GET":
        return method_not_allowed()
    rows = FoodItem.objects.select_related("category").annotate(transaction_count=Count("stock_transactions")).order_by("id")
    return JsonResponse({"results": [
        {
            "id": f.id,
            "code": f.code,
            "name": f.name,
            "category_name": f.category.name if f.category else "",
            "unit": f.unit,
            "quantity": str(f.quantity),
            "avg_cost": str(f.avg_cost),
            "stock_value": str(money(f.quantity * f.avg_cost)),
            "transaction_count": f.transaction_count,
        }
        for f in rows
    ]})


@inventory_permission_required
@json_api
def reports_transactions(request):
    """Sổ giao dịch IN/OUT/ADJUST, lọc theo mặt hàng và ngày chứng từ."""
    if request.method != "GET":
        return method_not_allowed()
    txs = StockTransaction.objects.select_related("receipt_line", "issue_line__issue", "stocktake_item")
    food_id = query_int(request, "food")
    if food_id:
        txs = txs.filter(food_id=food_id)
    date_from, date_to = query_date(request, "from"), query_date(request, "to")
    if date_from:
        txs = txs.filter(date__gte=date_from)
    if date_to:
        txs = txs.filter(date__lte=date_to)
    return JsonResponse({"results": [
        {
            "id": tx.id,
            "food_id": tx.food_id,
            "transaction_type": tx.type,
            "quantity_change": str(tx.quantity_delta),
            "cost": str(tx.unit_cost),
            "value_delta": str(tx.value_delta),
            "date": str(tx.date),
            "source": "receipt" if tx.receipt_line_id else "issue" if tx.issue_line_id else "stocktake",
            "reference": _transaction_reference(tx),
            "created_at": tx.created_at.isoformat() if tx.created_at else f"{tx.date}T00:00:00",
        }
        for tx in txs.order_by("date", "id")
    ]})


# =========================================================================
# PHIẾU NHẬP (SF22)
# =========================================================================
def _receipt_payload(r, with_names=True):
    lines = list(r.lines.all())
    payload = {
        "id": r.id,
        "supplier_id": r.supplier_id,
        "date": str(r.date),
        "note": r.note,
        "status": r.status.upper(),
        "posted_at": r.posted_at.isoformat() if r.posted_at else None,
        "total_value": str(document_total(lines, "unit_price")),
        "lines": [
            {
                "id": line.id,
                "food_id": line.food_id,
                "quantity": str(line.quantity),
                "unit_price": str(line.unit_price),
                "line_total": str(line_value(line.quantity, line.unit_price)),
                **({"food_name": line.food.name} if with_names else {}),
            }
            for line in lines
        ],
    }
    if with_names:
        payload["supplier_name"] = r.supplier.name if r.supplier else ""
    return payload


def _alias(obj, old, new):
    """Client cũ gửi `supplier`/`food`; nhận như `supplier_id`/`food_id` (không được gửi cả hai)."""
    if isinstance(obj, dict) and old in obj:
        if new in obj:
            raise field_error(old, f"Dùng {new}, không gửi cả {old}.", f"Chỉ gửi {new}.")
        obj[new] = obj.pop(old)


def _read_lines(data, with_price):
    raw = req_list(data, "lines", label="Dòng hàng")
    for line in raw:
        _alias(line, "food", "food_id")
    lines, seen = [], set()
    allowed = {"food_id", "quantity", "unit_price"} if with_price else {"food_id", "quantity"}
    for i, line in enumerate(raw):
        key = f"lines[{i}]"
        if not isinstance(line, dict):
            raise field_error(key, "Phải là object.", f"Dòng {i + 1} không hợp lệ.")
        extra = sorted(set(line) - allowed)
        if extra:
            raise field_error(key, "Trường không được phép: " + ", ".join(extra), f"Dòng {i + 1} có trường không được phép.")
        food_id = check_int(line.get("food_id"), f"{key}.food_id", minimum=1, label=f"Mặt hàng dòng {i + 1}")
        if food_id in seen:
            raise field_error(f"{key}.food_id", "Trùng mặt hàng.", f"Dòng {i + 1}: mỗi mặt hàng chỉ một dòng.")
        seen.add(food_id)
        if "quantity" not in line:
            raise field_error(f"{key}.quantity", "Trường này là bắt buộc.", f"Dòng {i + 1}: thiếu số lượng.")
        item = {"food_id": food_id,
                "quantity": check_decimal(line["quantity"], f"{key}.quantity", *QTY, label=f"Số lượng dòng {i + 1}")}
        if with_price:
            if "unit_price" not in line:
                raise field_error(f"{key}.unit_price", "Trường này là bắt buộc.", f"Dòng {i + 1}: thiếu đơn giá.")
            item["unit_price"] = check_decimal(line["unit_price"], f"{key}.unit_price", *PRICE, label=f"Đơn giá dòng {i + 1}")
        lines.append(item)
    return lines


@inventory_permission_required
@json_api
def receipts(request):
    if request.method == "GET":
        rows = Receipt.objects.select_related("supplier").prefetch_related("lines__food").order_by("-id")
        return JsonResponse({"results": [_receipt_payload(r) for r in rows]})
    if request.method != "POST":
        return method_not_allowed()

    data = read_object(request)
    _alias(data, "supplier", "supplier_id")
    only_fields(data, {"supplier_id", "date", "note", "lines"})
    supplier_id = req_id(data, "supplier_id", label="Nhà cung cấp")
    receipt_date = req_date(data, "date", label="Ngày nhập")
    note = req_str(data, "note", 2000, required=False, allow_blank=True) or ""
    lines = _read_lines(data, with_price=True)
    for line in lines:
        line["quantity"], line["unit_price"] = str(line["quantity"]), str(line["unit_price"])
    with transaction.atomic():
        r = create_receipt_draft(supplier_id=supplier_id, date=receipt_date, lines=lines, user=request.user, note=note)
        audit.record(request, "receipt_create", "receipt", r.id, f"Tạo phiếu nhập nháp {len(lines)} dòng")
    return JsonResponse(_receipt_payload(r, with_names=False), status=201)


@inventory_permission_required
@json_api
def receipt_detail(request, receipt_id):
    if request.method != "GET":
        return method_not_allowed()
    r = Receipt.objects.select_related("supplier").prefetch_related("lines__food").get(id=receipt_id)
    return JsonResponse(_receipt_payload(r))


@inventory_permission_required
@json_api
def receipt_post(request, receipt_id):
    if request.method != "POST":
        return method_not_allowed()
    with transaction.atomic():
        posted = post_receipt(receipt_id, request.user)
        audit.record(request, "receipt_post", "receipt", posted.id, "Chốt phiếu nhập")
    return JsonResponse({
        "id": posted.id,
        "status": posted.status.upper(),
        "posted_at": posted.posted_at.isoformat() if posted.posted_at else None,
        "message": "Chốt phiếu nhập thành công.",
    })


# =========================================================================
# PHIẾU XUẤT (SF28)
# =========================================================================
def _issue_payload(iss, with_totals=True):
    lines = list(iss.lines.all())
    return {
        "id": iss.id,
        "code": iss.code,
        "date": str(iss.date),
        "note": iss.note,
        "status": iss.status.upper(),
        "posted_at": iss.posted_at.isoformat() if iss.posted_at else None,
        "total_value": str(document_total(lines, "unit_cost")),
        "lines": [
            {
                "id": line.id,
                "food_id": line.food_id,
                "food_name": line.food.name,
                "quantity": str(line.quantity),
                "unit_cost": str(line.unit_cost),
                "line_total": str(line_value(line.quantity, line.unit_cost)),
            }
            for line in lines
        ],
    }


@inventory_permission_required
@json_api
def issues(request):
    if request.method == "GET":
        rows = Issue.objects.prefetch_related("lines__food").order_by("-id")
        return JsonResponse({"results": [_issue_payload(i) for i in rows]})
    if request.method != "POST":
        return method_not_allowed()

    data = read_object(request)
    only_fields(data, {"code", "date", "note", "lines"})
    issue_date = req_date(data, "date", label="Ngày xuất")
    code = req_str(data, "code", 32, required=False, upper=True, label="Mã phiếu")
    note = req_str(data, "note", 2000, required=False, allow_blank=True) or ""
    lines = _read_lines(data, with_price=False)
    foods = {f.id: f for f in FoodItem.objects.filter(id__in=[l["food_id"] for l in lines])}
    missing = [l["food_id"] for l in lines if l["food_id"] not in foods]
    if missing:
        raise InputError(f"Mặt hàng không tồn tại: {missing}.", {"lines": "Có mặt hàng không tồn tại."})
    if not code:
        code = f"XK{timezone.now().strftime('%Y%m%d%H%M%S%f')[:17]}"

    try:
        with transaction.atomic():
            iss = Issue.objects.create(code=code, date=issue_date, note=note, created_by=request.user)
            IssueLine.objects.bulk_create([
                IssueLine(issue=iss, food=foods[l["food_id"]], quantity=l["quantity"]) for l in lines
            ])
            audit.record(request, "issue_create", "issue", iss.id, f"Tạo phiếu xuất nháp {iss.code}")
    except IntegrityError:
        raise Conflict(f"Mã phiếu xuất {code} đã tồn tại.", {"code": "Đã tồn tại."})
    iss = Issue.objects.prefetch_related("lines__food").get(id=iss.id)
    return JsonResponse(_issue_payload(iss), status=201)


@inventory_permission_required
@json_api
def issue_detail(request, issue_id):
    if request.method != "GET":
        return method_not_allowed()
    return JsonResponse(_issue_payload(Issue.objects.prefetch_related("lines__food").get(id=issue_id)))


@inventory_permission_required
@json_api
def issue_post(request, issue_id):
    if request.method != "POST":
        return method_not_allowed()
    with transaction.atomic():
        posted = post_issue(issue_id, request.user)
        audit.record(request, "issue_post", "issue", posted.id, f"Chốt phiếu xuất {posted.code}")
    lines = list(posted.lines.all())
    return JsonResponse({
        "id": posted.id,
        "code": posted.code,
        "status": posted.status.upper(),
        "posted_at": posted.posted_at.isoformat() if posted.posted_at else None,
        "total_value": str(document_total(lines, "unit_cost")),
        "message": "Chốt phiếu xuất thành công.",
    })
