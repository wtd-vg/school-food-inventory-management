"""SF55/56/58: tính nhu cầu nguyên liệu theo ngày ăn và duyệt giữ hàng (contract G2 §2–§3).

required(food) = Σ món Σ component servings × quantity, cộng các món cùng food rồi mới làm tròn 0.001
ROUND_HALF_UP (food đơn vị piece làm tròn lên số nguyên). Khi duyệt: need = required + reserve,
from_stock = min(need, allocatable), from_pending = min(phần còn lại, đơn đang chờ về kịp), to_buy = phần còn lại.
"""

from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone

from .http_input import Conflict, InputError
from .menu_services import MENU, day_status, menu_for_date
from .models import (
    DemandLine,
    DemandRevision,
    FoodItem,
    LunchDay,
    PurchaseOrder,
    PurchaseOrderLine,
    StockAllocation,
)
from .services import reserved_stock

MILLI = Decimal("0.001")
ZERO = Decimal("0")
Alloc = StockAllocation


def round_required(value, unit):
    if unit.lower() == "piece":
        return value.quantize(Decimal("1"), rounding=ROUND_CEILING).quantize(MILLI)
    return value.quantize(MILLI, rounding=ROUND_HALF_UP)


def allocatable(food, day_id):
    return max(ZERO, food.quantity - reserved_stock(food.id, exclude_day_id=day_id))


def pending_lines(food_id, day):
    """Dòng đơn đang chờ về kịp ngày ăn, kèm lượng còn giữ được cho ngày này (theo expected_date rồi id)."""
    lines = (PurchaseOrderLine.objects.filter(
        food_id=food_id, order__status__in=[PurchaseOrder.Status.APPROVED, PurchaseOrder.Status.SENT],
        order__expected_date__lte=day.date)
        .select_related("order").order_by("order__expected_date", "order_id", "id"))
    result = []
    for line in lines:
        held_elsewhere = (Alloc.objects.filter(po_line=line, status=Alloc.Status.RESERVED)
                          .exclude(lunch_day=day).aggregate(t=Sum("qty"))["t"] or ZERO)
        free = line.qty_ordered - line.qty_received - held_elsewhere
        if free > 0:
            result.append((line, free))
    return result


def _servings(day):
    if day.planned_confirmed_at is None:
        raise Conflict("Chưa chốt số suất dự kiến của ngày này, chưa tính được nhu cầu.")
    total = day.planned_total
    if not total:
        raise Conflict("Tổng suất dự kiến bằng 0, không có nhu cầu nguyên liệu.")
    return total


def _menu(day_date):
    if day_status(day_date) != MENU:
        raise Conflict("Ngày nghỉ: không có bữa trưa.")
    menu = menu_for_date(day_date, take_snapshot=False)
    if not menu["dishes"]:
        raise Conflict("Ngày này chưa có thực đơn.")
    return menu


def required_by_food(servings, menu):
    totals = {}
    for dish in menu["dishes"]:
        for comp in dish["components"]:
            totals[comp["food_id"]] = totals.get(comp["food_id"], ZERO) + servings * Decimal(comp["quantity"])
    foods = FoodItem.objects.in_bulk(list(totals))
    return {fid: round_required(raw, foods[fid].unit) for fid, raw in totals.items()}


@transaction.atomic
def calculate(day_date, user, reserves=None):
    """Tạo bản tính nháp mới; các bản nháp cũ của ngày thành lỗi thời. reserves: {food_id: (qty, reason)}."""
    reserves = reserves or {}
    day = LunchDay.objects.select_for_update(of=("self",)).filter(date=day_date).first()
    if day is None:
        raise Conflict("Ngày chưa được mở, chưa có số suất.")
    servings = _servings(day)
    menu = _menu(day_date)
    required = required_by_food(servings, menu)
    unknown = sorted(set(reserves) - set(required))
    if unknown:
        raise InputError("Dự phòng cho nguyên liệu không có trong thực đơn ngày này.", {"reserves": f"food_id {unknown}"})

    DemandRevision.objects.filter(lunch_day=day, status=DemandRevision.Status.DRAFT).update(
        status=DemandRevision.Status.STALE, stale_reason="Có bản tính mới")
    number = (DemandRevision.objects.filter(lunch_day=day).aggregate(m=Max("revision"))["m"] or 0) + 1
    revision = DemandRevision.objects.create(
        lunch_day=day, revision=number, servings=servings, lunch_day_version=day.version,
        menu_version_id=menu["menu_version_id"],
        menu_items=[{"dish_id": d["dish_id"], "dish_name": d["dish_name"]} for d in menu["dishes"]],
        created_by=user,
    )
    DemandLine.objects.bulk_create([
        DemandLine(revision=revision, food_id=fid, required_qty=qty,
                   reserve_qty=reserves.get(fid, (ZERO, ""))[0], reserve_reason=reserves.get(fid, (ZERO, ""))[1])
        for fid, qty in sorted(required.items())
    ])
    return revision


def approve(revision_id, user):
    """Duyệt và giữ hàng. Số suất đã đổi sau khi tính → lưu bản tính là lỗi thời rồi mới báo 409
    (không gọi bên trong transaction ngoài, để trạng thái lỗi thời được commit)."""
    with transaction.atomic():
        revision = DemandRevision.objects.select_for_update(of=("self",)).get(id=revision_id)
        if revision.status != DemandRevision.Status.DRAFT:
            raise Conflict("Chỉ duyệt được bản tính đang nháp (bản này đã duyệt hoặc lỗi thời).")
        day = LunchDay.objects.select_for_update(of=("self",)).get(id=revision.lunch_day_id)
        if day.version == revision.lunch_day_version:
            return _approve_locked(revision, day, user)
        revision.status, revision.stale_reason = DemandRevision.Status.STALE, "Số suất đã đổi sau khi tính"
        revision.save(update_fields=["status", "stale_reason"])
    raise Conflict("Số suất đã thay đổi sau khi tính nhu cầu. Hãy tính lại rồi duyệt.")


def _approve_locked(revision, day, user):

    lines = list(revision.lines.order_by("food_id"))
    foods = {f.id: f for f in FoodItem.objects.filter(id__in=[l.food_id for l in lines]).order_by("id").select_for_update()}
    old = list(Alloc.objects.filter(lunch_day=day, status=Alloc.Status.RESERVED).order_by("id").select_for_update())
    for alloc in old:
        alloc.status = Alloc.Status.RELEASED
        alloc.save(update_fields=["status", "updated_at"])
    DemandRevision.objects.filter(lunch_day=day, status=DemandRevision.Status.APPROVED).update(
        status=DemandRevision.Status.STALE, stale_reason="Đã duyệt bản mới")

    po_line_ids = []
    plan = []
    for line in lines:
        need = line.required_qty + line.reserve_qty
        from_stock = min(need, allocatable(foods[line.food_id], day.id))
        remaining = need - from_stock
        takes = []
        for po_line, free in pending_lines(line.food_id, day):
            if remaining <= 0:
                break
            take = min(remaining, free)
            takes.append((po_line, take))
            po_line_ids.append(po_line.id)
            remaining -= take
        plan.append((line, from_stock, takes, remaining))
    # Khóa dòng đơn theo id tăng (cuối thứ tự khóa) trước khi ghi giữ hàng từ đơn.
    list(PurchaseOrderLine.objects.filter(id__in=sorted(set(po_line_ids))).order_by("id").select_for_update())

    for line, from_stock, takes, to_buy in plan:
        line.from_stock_qty = from_stock
        line.from_pending_qty = sum((t for _, t in takes), ZERO)
        line.to_buy_qty = to_buy
        line.save(update_fields=["from_stock_qty", "from_pending_qty", "to_buy_qty"])
        if from_stock > 0:
            Alloc.objects.create(lunch_day=day, demand_line=line, food_id=line.food_id,
                                 source=Alloc.Source.STOCK, qty=from_stock)
        for po_line, take in takes:
            Alloc.objects.create(lunch_day=day, demand_line=line, food_id=line.food_id,
                                 source=Alloc.Source.PO_LINE, po_line=po_line, qty=take)
    revision.status = DemandRevision.Status.APPROVED
    revision.approved_by, revision.approved_at = user, timezone.now()
    revision.save(update_fields=["status", "approved_by", "approved_at"])
    return revision


def current_revision(day):
    return (DemandRevision.objects.filter(lunch_day=day, status=DemandRevision.Status.APPROVED).first()
            or DemandRevision.objects.filter(lunch_day=day).order_by("-revision").first())


def is_outdated(revision):
    if revision is None:
        return False
    day = revision.lunch_day
    if day.version != revision.lunch_day_version:
        return True
    menu = menu_for_date(day.date, take_snapshot=False)
    return [d["dish_id"] for d in menu["dishes"]] != [d["dish_id"] for d in revision.menu_items]


def shortages():
    """Food có tồn nhỏ hơn tổng đang giữ từ tồn (thường do kiểm kê thiếu)."""
    rows = (Alloc.objects.filter(status=Alloc.Status.RESERVED, source=Alloc.Source.STOCK)
            .values("food_id").annotate(held=Sum("qty")))
    held = {r["food_id"]: r["held"] for r in rows}
    return [
        {"food_id": f.id, "food_name": f.name, "unit": f.unit, "quantity": str(f.quantity), "reserved": str(held[f.id])}
        for f in FoodItem.objects.filter(id__in=held).order_by("id") if f.quantity < held[f.id]
    ]


def revision_payload(revision):
    day = revision.lunch_day
    lines = list(revision.lines.select_related("food").order_by("food__name"))
    payload_lines = []
    for line in lines:
        pending = sum((free for _, free in pending_lines(line.food_id, day)), ZERO)
        payload_lines.append({
            "id": line.id,
            "food_id": line.food_id,
            "food_name": line.food.name,
            "unit": line.food.unit,
            "required_qty": str(line.required_qty),
            "reserve_qty": str(line.reserve_qty),
            "reserve_reason": line.reserve_reason,
            "from_stock_qty": str(line.from_stock_qty),
            "from_pending_qty": str(line.from_pending_qty),
            "to_buy_qty": str(line.to_buy_qty),
            "allocatable_now": str(allocatable(line.food, day.id)),
            "pending_now": str(pending),
        })
    return {
        "id": revision.id,
        "revision": revision.revision,
        "status": revision.status,
        "servings": revision.servings,
        "menu_items": revision.menu_items,
        "stale_reason": revision.stale_reason,
        "created_by": revision.created_by.get_username(),
        "created_at": revision.created_at.isoformat(),
        "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
        "has_purchase_order": revision.purchase_orders.exclude(status=PurchaseOrder.Status.CANCELLED).exists(),
        "lines": payload_lines,
    }


def day_demand(day_date):
    day = LunchDay.objects.filter(date=day_date).first()
    if day is None:
        return {"date": day_date.isoformat(), "status": "not_open", "revisions": [], "current": None,
                "is_outdated": False, "shortages": shortages()}
    revisions = list(DemandRevision.objects.filter(lunch_day=day).order_by("-revision"))
    current = current_revision(day)
    return {
        "date": day_date.isoformat(),
        "status": "planned_confirmed" if day.planned_confirmed_at else "open",
        "servings": day.planned_total,
        "revisions": [{"id": r.id, "revision": r.revision, "status": r.status, "stale_reason": r.stale_reason,
                       "created_at": r.created_at.isoformat()} for r in revisions],
        "current": revision_payload(current) if current else None,
        "is_outdated": is_outdated(current),
        "shortages": shortages(),
    }

