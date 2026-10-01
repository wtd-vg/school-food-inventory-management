"""API số suất theo ngày (SF46, BE-12/ISSUE-011). Nghiệp vụ ở lunch.py.

- GET chỉ đọc: ngày chưa mở trả status "not_open", không tạo dữ liệu.
- POST open: mở ngày, chụp sĩ số các lớp đang hoạt động.
- PUT counts: khóa lạc quan theo version; mỗi dòng kiểm tra lớp thuộc ngày và 0 ≤ suất ≤ sĩ số chụp
  (NULL = chưa nhập, khác 0). Loại số đã chốt thì không sửa (409). Chỉ tăng version khi có thay đổi.
"""

from django.db import transaction
from django.db.models import F
from django.http import JsonResponse

from . import audit
from .auth_views import inventory_permission_required
from .http_input import (
    Conflict,
    InputError,
    check_int,
    field_error,
    json_api,
    method_not_allowed,
    only_fields,
    parse_iso_date,
    read_object,
    req_int,
    req_list,
    req_str,
)
from .lunch import ACTUAL, PLANNED, _lock_day, confirm_counts, open_lunch_day, reopen_counts
from .models import MAX_STAFF_MEALS, ClassMealCount, LunchDay

KINDS = (PLANNED, ACTUAL)


def _status(day):
    if day.actual_confirmed_at:
        return "actual_confirmed"
    if day.planned_confirmed_at:
        return "planned_confirmed"
    return "open"


def _payload(day):
    rows = list(day.class_counts.select_related("school_class").order_by("school_class__code"))
    return {
        "id": day.id,
        "date": str(day.date),
        "status": _status(day),
        "version": day.version,
        "staff_planned": day.staff_planned,
        "staff_actual": day.staff_actual,
        "planned_total": day.planned_total,
        "actual_total": day.actual_total,
        "planned_confirmed_at": day.planned_confirmed_at.isoformat() if day.planned_confirmed_at else None,
        "actual_confirmed_at": day.actual_confirmed_at.isoformat() if day.actual_confirmed_at else None,
        "lines": [
            {
                "class_id": r.school_class_id,
                "class_code": r.school_class.code,
                "class_name": r.school_class.name,
                "enrolled_snapshot": r.enrolled_snapshot,
                "planned": r.planned,
                "actual": r.actual,
            }
            for r in rows
        ],
    }


def _date(date_str):
    return parse_iso_date(date_str, "date", "Ngày")


def _kind(data):
    kind = req_str(data, "kind", 10, label="Loại số suất")
    if kind not in KINDS:
        raise field_error("kind", "Chỉ nhận planned hoặc actual.", "Loại số suất phải là planned hoặc actual.")
    return kind


@inventory_permission_required
@json_api
def lunch_day_counts(request, date_str):
    day_date = _date(date_str)
    if request.method == "GET":
        day = LunchDay.objects.filter(date=day_date).first()
        if day is None:
            return JsonResponse({"date": str(day_date), "status": "not_open", "version": None, "lines": []})
        return JsonResponse(_payload(day))
    if request.method != "PUT":
        return method_not_allowed()

    data = read_object(request)
    only_fields(data, {"version", "staff_planned", "staff_actual", "lines"})
    version = req_int(data, "version", minimum=1, label="Phiên bản")
    day_id = LunchDay.objects.filter(date=day_date).values_list("id", flat=True).first()
    if day_id is None:
        raise Conflict("Ngày chưa được mở. Mở ngày trước khi nhập số suất.")

    with transaction.atomic():
        day = _lock_day(day_id, version)
        changes = {}
        day_fields = {}
        for kind in KINDS:
            key = f"staff_{kind}"
            if key not in data:
                continue
            value = req_int(data, key, minimum=0, maximum=MAX_STAFF_MEALS, nullable=True, label="Suất nhân viên")
            if value != getattr(day, key):
                if getattr(day, f"{kind}_confirmed_at"):
                    raise Conflict(f"Số {'dự kiến' if kind == PLANNED else 'thực tế'} đã chốt, không sửa được.")
                day_fields[key] = value
                changes[key] = [getattr(day, key), value]

        rows = {r.school_class_id: r for r in day.class_counts.select_related("school_class").select_for_update(of=("self",))}
        for i, line in enumerate(req_list(data, "lines", min_len=0, required=False) or []):
            key = f"lines[{i}]"
            if not isinstance(line, dict):
                raise field_error(key, "Phải là object.", f"Dòng {i + 1} không hợp lệ.")
            extra = sorted(set(line) - {"class_id", "planned", "actual"})
            if extra:
                raise field_error(key, "Trường không được phép: " + ", ".join(extra), f"Dòng {i + 1} có trường không được phép.")
            class_id = check_int(line.get("class_id"), f"{key}.class_id", minimum=1, label="Lớp")
            row = rows.get(class_id)
            if row is None:
                raise field_error(f"{key}.class_id", "Lớp không thuộc ngày này.", f"Dòng {i + 1}: lớp không có trong ngày {day.date}.")
            update = {}
            for kind in KINDS:
                if kind not in line:
                    continue
                value = check_int(line[kind], f"{key}.{kind}", minimum=0, maximum=row.enrolled_snapshot, nullable=True,
                                  label=f"Suất lớp {row.school_class.code}")
                if value != getattr(row, kind):
                    if getattr(day, f"{kind}_confirmed_at"):
                        raise Conflict(f"Số {'dự kiến' if kind == PLANNED else 'thực tế'} đã chốt, không sửa được.")
                    update[kind] = value
                    changes[f"{row.school_class.code}.{kind}"] = [getattr(row, kind), value]
            if update:
                ClassMealCount.objects.filter(pk=row.pk).update(**update)

        if changes:
            LunchDay.objects.filter(pk=day.pk).update(**day_fields, version=F("version") + 1)
            audit.record(request, "lunch_counts_update", "lunch_day", day.id, f"Sửa số suất ngày {day.date}", changes=changes)
        day.refresh_from_db()
    return JsonResponse(_payload(day))


@inventory_permission_required
@json_api
def lunch_day_open(request, date_str):
    if request.method != "POST":
        return method_not_allowed()
    day_date = _date(date_str)
    with transaction.atomic():
        existed = LunchDay.objects.filter(date=day_date).exists()
        day = open_lunch_day(day_date)
        if not existed:
            audit.record(request, "lunch_open", "lunch_day", day.id, f"Mở ngày ăn {day.date}")
    return JsonResponse(_payload(day), status=200 if existed else 201)


def _existing_day(day_date):
    day = LunchDay.objects.filter(date=day_date).first()
    if day is None:
        raise InputError("Ngày chưa được mở.")
    return day


@inventory_permission_required
@json_api
def lunch_day_lock(request, date_str):
    if request.method != "POST":
        return method_not_allowed()
    day = _existing_day(_date(date_str))
    data = read_object(request)
    only_fields(data, {"kind", "version"})
    kind = _kind(data)
    version = req_int(data, "version", minimum=1, label="Phiên bản")
    with transaction.atomic():
        day = confirm_counts(day.id, kind, request.user, version)
        audit.record(request, "lunch_lock", "lunch_day", day.id, f"Chốt số {kind} ngày {day.date}")
    return JsonResponse(_payload(day))


@inventory_permission_required
@json_api
def lunch_day_reopen(request, date_str):
    if request.method != "POST":
        return method_not_allowed()
    day = _existing_day(_date(date_str))
    data = read_object(request)
    only_fields(data, {"kind", "version", "reason"})
    kind = _kind(data)
    version = req_int(data, "version", minimum=1, label="Phiên bản")
    reason = req_str(data, "reason", 500, label="Lý do mở lại")
    with transaction.atomic():
        day = reopen_counts(day.id, kind, request.user, reason, version)
        audit.record(request, "lunch_reopen", "lunch_day", day.id, f"Mở lại số {kind} ngày {day.date}: {reason}")
    return JsonResponse(_payload(day))
