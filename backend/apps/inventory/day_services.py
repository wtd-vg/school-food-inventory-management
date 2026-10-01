"""SF67/68/70: xuất cho bếp theo ngày ăn, chi phí ngày, đóng/mở lại ngày, báo cáo ngày (contract G2 §3).

- Phiếu xuất theo ngày = phần còn thiếu theo bản nhu cầu đã duyệt (required + reserve − đã xuất), chốt bằng
  services.post_issue (dùng phần đã giữ của chính ngày đó).
- Chi phí ngày = −Σ value_delta OUT của phiếu xuất đã chốt gắn ngày đó; chi phí/suất chia cho tổng suất THỰC TẾ.
  Giá vốn đã ghi sổ không đổi khi nhập hàng giá mới về sau.
- Đóng ngày: đã chốt số thực tế, mọi phiếu xuất của ngày đã chốt; có chênh lệch (đã xuất − cần) thì phải ghi chú.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .http_input import Conflict, InputError
from .models import (
    DemandRevision,
    FoodItem,
    Issue,
    IssueLine,
    LunchDay,
    LunchDayClose,
    StockTransaction,
)

ZERO = Decimal("0")
CENT = Decimal("0.01")


def _day(day_date):
    day = LunchDay.objects.filter(date=day_date).first()
    if day is None:
        raise Conflict("Ngày chưa được mở.")
    return day


def _active_close(day):
    return LunchDayClose.objects.filter(lunch_day=day, reopened_at__isnull=True).first()


def issued_by_food(day):
    rows = (IssueLine.objects.filter(issue__lunch_day=day, issue__status=Issue.Status.POSTED)
            .values("food_id").annotate(t=Sum("quantity")))
    return {r["food_id"]: r["t"] for r in rows}


def _approved(day):
    revision = DemandRevision.objects.filter(lunch_day=day, status=DemandRevision.Status.APPROVED).first()
    if revision is None:
        raise Conflict("Ngày này chưa có đề xuất nhu cầu đã duyệt.")
    return revision


@transaction.atomic
def create_day_issue(day_date, user):
    day = LunchDay.objects.select_for_update(of=("self",)).filter(date=day_date).first()
    if day is None:
        raise Conflict("Ngày chưa được mở.")
    if _active_close(day):
        raise Conflict("Ngày ăn đã đóng.")
    if Issue.objects.filter(lunch_day=day, status=Issue.Status.DRAFT).exists():
        raise Conflict("Đã có phiếu xuất nháp cho ngày này; chốt hoặc xử lý phiếu đó trước.")
    revision = _approved(day)
    issued = issued_by_food(day)
    lines = []
    for line in revision.lines.order_by("food_id"):
        left = line.required_qty + line.reserve_qty - issued.get(line.food_id, ZERO)
        if left > 0:
            lines.append((line.food_id, left))
    if not lines:
        raise Conflict("Đã xuất đủ nguyên liệu theo nhu cầu của ngày này.")
    code = f"XB{day.date:%Y%m%d}-{Issue.objects.filter(lunch_day=day).count() + 1}"
    issue = Issue.objects.create(code=code, date=day.date, note=f"Xuất cho bếp ngày {day.date:%d/%m/%Y}",
                                 created_by=user, lunch_day=day)
    IssueLine.objects.bulk_create([IssueLine(issue=issue, food_id=fid, quantity=qty) for fid, qty in lines])
    return issue


def day_cost(day_date):
    day = _day(day_date)
    cost = -(StockTransaction.objects.filter(issue_line__issue__lunch_day=day, type=StockTransaction.Type.OUT)
             .aggregate(t=Sum("value_delta"))["t"] or ZERO)
    actual = day.actual_total
    if not actual:
        per, reason = None, "Chưa chốt số suất thực tế." if day.actual_confirmed_at is None or actual is None else "Số suất thực tế bằng 0."
    else:
        per, reason = (cost / actual).quantize(CENT, rounding=ROUND_HALF_UP), ""
    issued = issued_by_food(day)
    revision = DemandRevision.objects.filter(lunch_day=day, status=DemandRevision.Status.APPROVED).first()
    required = {l.food_id: l.required_qty for l in revision.lines.all()} if revision else {}
    foods = FoodItem.objects.in_bulk(set(issued) | set(required))
    close = _active_close(day)
    return {
        "date": day.date.isoformat(),
        "planned_total": day.planned_total,
        "actual_total": actual,
        "cost": str(cost.quantize(CENT)),
        "cost_per_serving": None if per is None else str(per),
        "cost_per_serving_reason": reason,
        "closed": close is not None,
        "close": None if close is None else {"closed_at": close.closed_at.isoformat(), "note": close.note,
                                              "closed_by": close.closed_by.get_username()},
        "foods": [
            {"food_id": fid, "food_name": foods[fid].name, "unit": foods[fid].unit,
             "required": str(required.get(fid, ZERO)), "issued": str(issued.get(fid, ZERO)),
             "variance": str(issued.get(fid, ZERO) - required.get(fid, ZERO))}
            for fid in sorted(foods, key=lambda i: foods[i].name)
        ],
    }


@transaction.atomic
def close_day(day_date, note, user):
    day = LunchDay.objects.select_for_update(of=("self",)).filter(date=day_date).first()
    if day is None:
        raise Conflict("Ngày chưa được mở.")
    if _active_close(day):
        raise Conflict("Ngày đã đóng.")
    if day.actual_confirmed_at is None:
        raise Conflict("Phải chốt số suất thực tế trước khi đóng ngày.")
    if Issue.objects.filter(lunch_day=day, status=Issue.Status.DRAFT).exists():
        raise Conflict("Còn phiếu xuất nháp của ngày này; chốt hoặc xử lý trước khi đóng ngày.")
    summary = day_cost(day_date)
    variances = [f for f in summary["foods"] if Decimal(f["variance"]) != 0]
    if variances and not note.strip():
        raise InputError("Có chênh lệch giữa lượng cần và đã xuất; ghi chú giải thích trước khi đóng ngày.",
                         {"note": "Bắt buộc khi có chênh lệch."})
    return LunchDayClose.objects.create(lunch_day=day, closed_by=user, note=note.strip(), summary=summary)


@transaction.atomic
def reopen_close(day_date, reason, user):
    day = LunchDay.objects.select_for_update(of=("self",)).filter(date=day_date).first()
    close = _active_close(day) if day else None
    if close is None:
        raise Conflict("Ngày chưa đóng.")
    close.reopened_by, close.reopened_at, close.reopen_reason = user, timezone.now(), reason
    close.save(update_fields=["reopened_by", "reopened_at", "reopen_reason"])
    return close


def daily_report(date_from, date_to):
    if date_to < date_from:
        raise InputError("Khoảng ngày không hợp lệ.")
    if (date_to - date_from).days > 366:
        raise InputError("Báo cáo tối đa một năm.")
    days = LunchDay.objects.filter(date__range=(date_from, date_to)).order_by("date")
    rows = []
    for day in days:
        c = day_cost(day.date)
        rows.append({k: c[k] for k in ("date", "planned_total", "actual_total", "cost", "cost_per_serving", "closed")})
    total = sum((Decimal(r["cost"]) for r in rows), ZERO)
    servings = sum((r["actual_total"] or 0) for r in rows)
    return {
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
        "days": rows,
        "total_cost": str(total.quantize(CENT)),
        "total_servings": servings,
        "avg_cost_per_serving": str((total / servings).quantize(CENT, rounding=ROUND_HALF_UP)) if servings else None,
    }

