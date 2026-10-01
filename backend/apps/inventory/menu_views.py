"""API thực đơn cố định (SF52, BE-13). Nghiệp vụ ở menu_services.py.

GET  /api/menu/week/?date=YYYY-MM-DD    7 ngày của tuần chứa date (mặc định hôm nay)
GET  /api/menu/today/
GET  /api/menu/versions/                lịch sử phiên bản (mới nhất trước)
POST /api/menu/versions/                {effective_from, note?, days: {"0": [dish_id…], …, "4": […]}}
DELETE /api/menu/versions/<id>/         chỉ version chưa áp dụng
GET  /api/holidays/?year=YYYY           ngày nghỉ
POST /api/holidays/                     {date, name}
DELETE /api/holidays/<id>/              chỉ ngày tương lai
Đọc: Quản lý + Hiệu trưởng; ghi: Quản lý.
"""

from django.db import transaction
from django.http import JsonResponse

from . import audit, menu_services as ms
from .auth_views import inventory_permission_required
from .http_input import json_api, method_not_allowed, only_fields, query_date, query_int, read_object, req_date, req_str
from .models import MenuVersion, SchoolHoliday


@inventory_permission_required
@json_api
def menu_week(request):
    if request.method != "GET":
        return method_not_allowed()
    return JsonResponse(ms.week(query_date(request, "date") or ms.today()))


@inventory_permission_required
@json_api
def menu_today(request):
    if request.method != "GET":
        return method_not_allowed()
    return JsonResponse(ms.menu_for_date(ms.today()))


@inventory_permission_required
@json_api
def menu_versions(request):
    if request.method == "GET":
        versions = MenuVersion.objects.select_related("created_by").order_by("-effective_from")
        return JsonResponse({"results": [ms.version_payload(v) for v in versions]})
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"effective_from", "note", "days"})
    effective_from = req_date(data, "effective_from", label="Ngày áp dụng")
    note = req_str(data, "note", 500, required=False, allow_blank=True) or ""
    with transaction.atomic():
        version = ms.create_menu_version(effective_from, data.get("days"), request.user, note)
        payload = ms.version_payload(version)
        audit.record(request, "menu_version_create", "menu_version", version.id,
                     f"Thực đơn cố định mới áp dụng từ {version.effective_from:%d/%m/%Y}", changes={"days": payload["days"]})
    return JsonResponse(payload, status=201)


@inventory_permission_required
@json_api
def menu_version_detail(request, version_id):
    if request.method == "GET":
        return JsonResponse(ms.version_payload(MenuVersion.objects.get(id=version_id)))
    if request.method != "DELETE":
        return method_not_allowed()
    with transaction.atomic():
        version = ms.delete_future_version(version_id)
        audit.record(request, "menu_version_delete", "menu_version", version_id,
                     f"Xóa thực đơn chưa áp dụng (từ {version.effective_from:%d/%m/%Y})")
    return JsonResponse({"message": "Đã xóa thực đơn chưa áp dụng."})


@inventory_permission_required
@json_api
def holidays(request):
    if request.method == "GET":
        rows = SchoolHoliday.objects.order_by("date")
        year = query_int(request, "year", minimum=2000)
        if year:
            rows = rows.filter(date__year=year)
        return JsonResponse({"results": [ms.holiday_payload(h) for h in rows]})
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"date", "name"})
    day = req_date(data, "date", label="Ngày nghỉ")
    name = req_str(data, "name", 120, label="Tên ngày nghỉ")
    with transaction.atomic():
        h = ms.add_holiday(day, name, request.user)
        audit.record(request, "holiday_create", "holiday", h.id, f"Thêm ngày nghỉ {h.date:%d/%m/%Y}: {h.name}")
    return JsonResponse(ms.holiday_payload(h), status=201)


@inventory_permission_required
@json_api
def holiday_detail(request, holiday_id):
    if request.method != "DELETE":
        return method_not_allowed()
    with transaction.atomic():
        h = ms.delete_holiday(holiday_id)
        audit.record(request, "holiday_delete", "holiday", holiday_id, f"Xóa ngày nghỉ {h.date:%d/%m/%Y}")
    return JsonResponse({"message": "Đã xóa ngày nghỉ."})
