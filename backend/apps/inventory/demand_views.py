"""API nhu cầu và đề xuất (SF58, contract G2 §4). Nghiệp vụ ở demand_services.py."""

from django.db import transaction
from django.http import JsonResponse

from . import audit, demand_services as ds
from .auth_views import inventory_permission_required
from .http_input import (
    check_decimal,
    check_int,
    field_error,
    json_api,
    method_not_allowed,
    only_fields,
    parse_iso_date,
    read_object,
)


def _reserves(data):
    raw = data.get("reserves", [])
    if not isinstance(raw, list):
        raise field_error("reserves", "Phải là danh sách.", "Dự phòng phải là danh sách.")
    result = {}
    for i, item in enumerate(raw):
        key = f"reserves[{i}]"
        if not isinstance(item, dict) or set(item) - {"food_id", "qty", "reason"}:
            raise field_error(key, "Chỉ nhận food_id, qty, reason.", f"Dòng dự phòng {i + 1} không hợp lệ.")
        food_id = check_int(item.get("food_id"), f"{key}.food_id", minimum=1, label="Nguyên liệu")
        qty = check_decimal(item.get("qty"), f"{key}.qty", 14, 3, allow_zero=True, label="Dự phòng")
        reason = item.get("reason", "")
        if not isinstance(reason, str):
            raise field_error(f"{key}.reason", "Phải là chuỗi.", "Lý do dự phòng phải là chuỗi.")
        reason = reason.strip()[:255]
        if qty > 0 and not reason:
            raise field_error(f"{key}.reason", "Bắt buộc khi có dự phòng.", "Dự phòng lớn hơn 0 cần ghi lý do.")
        if food_id in result:
            raise field_error(f"{key}.food_id", "Trùng nguyên liệu.", "Mỗi nguyên liệu chỉ một dòng dự phòng.")
        result[food_id] = (qty, reason)
    return result


@inventory_permission_required
@json_api
def lunch_day_demand(request, date_str):
    if request.method != "GET":
        return method_not_allowed()
    return JsonResponse(ds.day_demand(parse_iso_date(date_str, "date", "Ngày")))


@inventory_permission_required
@json_api
def lunch_day_demand_calculate(request, date_str):
    if request.method != "POST":
        return method_not_allowed()
    day_date = parse_iso_date(date_str, "date", "Ngày")
    data = read_object(request) if request.body else {}
    only_fields(data, {"reserves"})
    with transaction.atomic():
        revision = ds.calculate(day_date, request.user, _reserves(data))
        audit.record(request, "demand_calculate", "demand_revision", revision.id,
                     f"Tính nhu cầu ngày {day_date:%d/%m/%Y} (bản {revision.revision}, {revision.servings} suất)")
    return JsonResponse(ds.revision_payload(revision), status=201)


@inventory_permission_required
@json_api
def demand_approve(request, revision_id):
    if request.method != "POST":
        return method_not_allowed()
    revision = ds.approve(revision_id, request.user)  # tự quản transaction (ghi trạng thái lỗi thời rồi mới 409)
    with transaction.atomic():
        audit.record(request, "demand_approve", "demand_revision", revision.id,
                     f"Duyệt nhu cầu ngày {revision.lunch_day.date:%d/%m/%Y} (bản {revision.revision})")
    return JsonResponse(ds.revision_payload(revision))
