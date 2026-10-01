"""BE-15: GET /api/audit-logs/ (chỉ Hiệu trưởng/superuser), lọc và phân trang 50 dòng.

?actor=<username> ?action=<mã> ?entity_type=<loại> ?entity_id=<id> ?from=YYYY-MM-DD ?to=YYYY-MM-DD ?page=1
Ngày lọc theo giờ Việt Nam.
"""

from datetime import datetime, time, timedelta

from django.core.paginator import EmptyPage, Paginator
from django.http import JsonResponse
from django.utils import timezone

from .auth_views import principal_required
from .http_input import json_api, method_not_allowed, query_date, query_int
from .models import AuditLog

PAGE_SIZE = 50


def _row(log):
    return {
        "id": log.id,
        "created_at": log.created_at.isoformat(),
        "actor_id": log.actor_id,
        "actor_username": log.actor_username,
        "action": log.action,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "summary": log.summary,
        "changes": log.changes,
        "ip": log.ip,
        "user_agent": log.user_agent,
    }


def _start_of(day):
    return timezone.make_aware(datetime.combine(day, time.min))


@principal_required
@json_api
def audit_logs(request):
    if request.method != "GET":
        return method_not_allowed()
    logs = AuditLog.objects.all()
    for param, field in (("actor", "actor_username"), ("action", "action"),
                         ("entity_type", "entity_type"), ("entity_id", "entity_id")):
        value = request.GET.get(param, "").strip()
        if value:
            logs = logs.filter(**{field: value})
    date_from, date_to = query_date(request, "from"), query_date(request, "to")
    if date_from:
        logs = logs.filter(created_at__gte=_start_of(date_from))
    if date_to:
        logs = logs.filter(created_at__lt=_start_of(date_to + timedelta(days=1)))
    paginator = Paginator(logs.order_by("-created_at", "-id"), PAGE_SIZE)
    page_no = query_int(request, "page") or 1
    try:
        page = paginator.page(page_no)
    except EmptyPage:
        page = paginator.page(paginator.num_pages)
    return JsonResponse({
        "results": [_row(l) for l in page.object_list],
        "page": page.number,
        "total_pages": paginator.num_pages,
        "total": paginator.count,
        "actions": sorted(AuditLog.objects.values_list("action", flat=True).distinct()),
    })
