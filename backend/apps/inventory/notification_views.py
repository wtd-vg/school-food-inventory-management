"""BE-08: API email thực đơn.

GET  /api/notifications/?date=YYYY-MM-DD   nhật ký gửi (email đã che)        Quản lý + Hiệu trưởng
POST /api/notifications/send/   {date?}     xếp lịch gửi lại phần còn thiếu    Quản lý
POST /api/notifications/test/   {date?}     gửi thử tới email của người đang đăng nhập
POST /api/unsubscribe/<token>/              công khai: hủy nhận (token ký số, không cần đăng nhập/CSRF)
"""

from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from . import audit
from .auth_views import inventory_permission_required
from .http_input import InputError, error, json_api, method_not_allowed, only_fields, query_date, read_object, req_date
from .mailer import read_unsubscribe_token
from .menu_services import today
from .models import ParentContact
from .notifications import day_logs, request_resend, send_test_email


@inventory_permission_required
@json_api
def notifications(request):
    if request.method != "GET":
        return method_not_allowed()
    return JsonResponse(day_logs(query_date(request, "date") or today()))


def _date_from_body(request):
    data = read_object(request) if request.body else {}
    only_fields(data, {"date"})
    day = req_date(data, "date", required=False, label="Ngày") or today()
    if day > today():
        raise InputError("Chỉ gửi thực đơn của hôm nay hoặc ngày đã qua.")
    return day


@inventory_permission_required
@json_api
def notifications_send(request):
    if request.method != "POST":
        return method_not_allowed()
    day = _date_from_body(request)
    with transaction.atomic():
        request_resend(day)
        audit.record(request, "email_resend", "notification", day.isoformat(), f"Xếp lịch gửi lại email thực đơn {day:%d/%m/%Y}")
    return JsonResponse({"message": "Đã xếp lịch gửi lại, hệ thống sẽ gửi phần còn thiếu trong khoảng 1 phút."}, status=202)


@inventory_permission_required
@json_api
def notifications_test(request):
    if request.method != "POST":
        return method_not_allowed()
    day = _date_from_body(request)
    if not request.user.email:
        raise InputError("Tài khoản của bạn chưa có email để nhận thư thử.")
    send_test_email(request.user.email, day)
    audit.record(request, "email_test", "notification", day.isoformat(), "Gửi thư thử tới email của chính mình")
    return JsonResponse({"message": f"Đã gửi thư thử tới {request.user.email}."})


@csrf_exempt
def unsubscribe(request, token):
    """Không lộ email trong phản hồi. Gọi lại nhiều lần vẫn trả 200."""
    if request.method != "POST":
        return error("Phương thức không được hỗ trợ.", 405)
    try:
        email_hash = read_unsubscribe_token(token)
    except ValueError as exc:
        return error(str(exc), 400)
    from django.utils import timezone

    with transaction.atomic():
        updated = ParentContact.objects.filter(email_hash=email_hash, unsubscribed_at__isnull=True).update(
            unsubscribed_at=timezone.now())
        if updated:
            audit.record(request, "email_unsubscribe", "parent_contact", "", f"Phụ huynh hủy nhận email ({updated} liên hệ)",
                         actor_username="")
    return JsonResponse({"message": "Đã hủy nhận email thực đơn. Bạn sẽ không nhận thư này nữa."})
