"""API xuất theo ngày, chi phí, đóng ngày, báo cáo ngày (SF68/70, contract G2 §4). Nghiệp vụ ở day_services.py."""

from django.db import transaction
from django.http import JsonResponse

from . import audit, day_services as days
from .auth_views import inventory_permission_required
from .http_input import InputError, json_api, method_not_allowed, only_fields, parse_iso_date, query_date, read_object, req_str


def _date(date_str):
    return parse_iso_date(date_str, "date", "Ngày")


@inventory_permission_required
@json_api
def lunch_day_issue(request, date_str):
    if request.method != "POST":
        return method_not_allowed()
    day_date = _date(date_str)
    with transaction.atomic():
        issue = days.create_day_issue(day_date, request.user)
        audit.record(request, "day_issue_create", "issue", issue.id, f"Tạo phiếu xuất bếp {issue.code}")
    from .models import Issue
    from .views import _issue_payload

    return JsonResponse(_issue_payload(Issue.objects.prefetch_related("lines__food").get(id=issue.id)), status=201)


@inventory_permission_required
@json_api
def lunch_day_cost(request, date_str):
    if request.method != "GET":
        return method_not_allowed()
    return JsonResponse(days.day_cost(_date(date_str)))


@inventory_permission_required
@json_api
def lunch_day_close(request, date_str):
    if request.method != "POST":
        return method_not_allowed()
    day_date = _date(date_str)
    data = read_object(request) if request.body else {}
    only_fields(data, {"note"})
    note = req_str(data, "note", 2000, required=False, allow_blank=True) or ""
    with transaction.atomic():
        days.close_day(day_date, note, request.user)
        audit.record(request, "day_close", "lunch_day", day_date.isoformat(), f"Đóng ngày {day_date:%d/%m/%Y}")
    return JsonResponse(days.day_cost(day_date))


@inventory_permission_required
@json_api
def lunch_day_reopen_close(request, date_str):
    if request.method != "POST":
        return method_not_allowed()
    day_date = _date(date_str)
    data = read_object(request)
    only_fields(data, {"reason"})
    reason = req_str(data, "reason", 255, label="Lý do mở lại")
    with transaction.atomic():
        days.reopen_close(day_date, reason, request.user)
        audit.record(request, "day_reopen_close", "lunch_day", day_date.isoformat(),
                     f"Mở lại ngày {day_date:%d/%m/%Y}: {reason}")
    return JsonResponse(days.day_cost(day_date))


@inventory_permission_required
@json_api
def reports_daily(request):
    if request.method != "GET":
        return method_not_allowed()
    date_from, date_to = query_date(request, "from"), query_date(request, "to")
    if not date_from or not date_to:
        raise InputError("Cần tham số from và to (YYYY-MM-DD).")
    return JsonResponse(days.daily_report(date_from, date_to))
