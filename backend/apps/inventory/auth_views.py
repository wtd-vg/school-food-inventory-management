"""Đăng nhập session, CSRF và phân quyền (SF13, BE-10).

Vai trò (R9): "manager" = Quản lý (mọi nghiệp vụ), "principal" = Hiệu trưởng (xem tất cả, quản lý tài
khoản, xem nhật ký; không ghi nghiệp vụ). Superuser = Quản lý + quyền của Hiệu trưởng. Tài khoản không
thuộc nhóm nào thì không dùng được hệ thống (vai trò viewer đã bỏ ngày 01/10/2026).
"""

from functools import wraps

from django.contrib.auth import authenticate, login, logout
from django.http import HttpRequest, JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from . import audit, throttle
from .http_input import client_ip, error, json_api, read_object, req_str
from .models import ROLE_MANAGER, ROLE_PRINCIPAL, LoginThrottle

READ_METHODS = ("GET", "HEAD", "OPTIONS")
SESSION_AUTH_AT = "auth_at"


def get_user_role(user):
    if not user or not user.is_authenticated or not user.is_active:
        return None
    if user.is_superuser:
        return ROLE_MANAGER
    names = set(user.groups.values_list("name", flat=True))
    if ROLE_MANAGER in names:
        return ROLE_MANAGER
    if ROLE_PRINCIPAL in names:
        return ROLE_PRINCIPAL
    return None


def can_manage_users(user):
    return bool(user and user.is_authenticated and user.is_active
                and (user.is_superuser or get_user_role(user) == ROLE_PRINCIPAL))


def user_payload(user):
    role = get_user_role(user)
    manage = can_manage_users(user)
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.get_full_name(),
        "role": role,
        "can_write": role == ROLE_MANAGER,
        "can_manage_users": manage,
        "can_view_audit": manage,
    }


def _deny_unauthenticated(request):
    if not request.user.is_authenticated:
        return error("Yêu cầu đăng nhập để truy cập tài nguyên này.", 401)
    if get_user_role(request.user) is None:
        return error("Tài khoản chưa được phân quyền. Liên hệ Hiệu trưởng.", 403)
    return None


def inventory_permission_required(view_func):
    """API nghiệp vụ: chưa đăng nhập 401; đọc cho Quản lý + Hiệu trưởng; ghi chỉ Quản lý (403)."""

    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        denied = _deny_unauthenticated(request)
        if denied:
            return denied
        if request.method not in READ_METHODS and get_user_role(request.user) != ROLE_MANAGER:
            return error("Bạn không có quyền thực hiện thao tác này. Quyền yêu cầu: Quản lý.", 403)
        return view_func(request, *args, **kwargs)

    return wrapped


def manager_required(view_func):
    """Mọi method đều cần Quản lý (ví dụ xem email đầy đủ của phụ huynh)."""

    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        denied = _deny_unauthenticated(request)
        if denied:
            return denied
        if get_user_role(request.user) != ROLE_MANAGER:
            return error("Bạn không có quyền thực hiện thao tác này. Quyền yêu cầu: Quản lý.", 403)
        return view_func(request, *args, **kwargs)

    return wrapped


def principal_required(view_func):
    """Quản lý tài khoản, nhật ký: chỉ Hiệu trưởng (hoặc superuser)."""

    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        denied = _deny_unauthenticated(request)
        if denied:
            return denied
        if not can_manage_users(request.user):
            return error("Chỉ Hiệu trưởng được thực hiện thao tác này.", 403)
        return view_func(request, *args, **kwargs)

    return wrapped


@require_GET
def get_csrf(request: HttpRequest):
    """GET /api/auth/csrf/: đặt cookie csrftoken cho SPA."""
    return JsonResponse({"csrf_token": get_token(request)})


def _locked_response(seconds):
    minutes = max(1, (seconds + 59) // 60)
    response = error(f"Đăng nhập tạm khóa do nhập sai nhiều lần. Thử lại sau {minutes} phút.", 429)
    response["Retry-After"] = str(seconds)
    return response


@require_POST
@json_api
def login_view(request):
    """POST /api/auth/login/ {username, password}.

    Thông báo sai không cho biết tài khoản có tồn tại hay không. Không ghi log mật khẩu.
    """
    data = read_object(request)
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Trường này là bắt buộc."
    if not isinstance(password, str) or not password:
        errors["password"] = "Trường này là bắt buộc."
    if errors:
        return error("Tên đăng nhập và mật khẩu là bắt buộc.", 400, errors)
    username = username.strip()[:150]
    ip = client_ip(request)

    locked = max(throttle.locked_seconds(LoginThrottle.Scope.USER, username),
                 throttle.locked_seconds(LoginThrottle.Scope.IP, ip))
    if locked:
        audit.record(request, "login_locked", "user", summary="Đăng nhập khi đang bị khóa", actor_username=username)
        return _locked_response(locked)

    user = authenticate(request, username=username, password=password)
    if user is None:
        locked = max(throttle.register_failure(LoginThrottle.Scope.USER, username),
                     throttle.register_failure(LoginThrottle.Scope.IP, ip))
        audit.record(request, "login_failed", "user", summary="Sai tên đăng nhập hoặc mật khẩu", actor_username=username)
        if locked:
            audit.record(request, "login_locked", "user", summary="Khóa đăng nhập 15 phút", actor_username=username)
            return _locked_response(locked)
        return error("Tên đăng nhập hoặc mật khẩu không chính xác.", 401)

    if get_user_role(user) is None:
        audit.record(request, "login_denied", "user", user.pk, "Tài khoản chưa được phân quyền", actor=user)
        return error("Tài khoản chưa được phân quyền. Liên hệ Hiệu trưởng.", 403)

    throttle.reset(LoginThrottle.Scope.USER, username)
    login(request, user)
    request.session[SESSION_AUTH_AT] = timezone.now().timestamp()
    audit.record(request, "login", "user", user.pk, "Đăng nhập", actor=user)
    return JsonResponse({
        "message": "Đăng nhập thành công.",
        "user": user_payload(user),
        "csrf_token": get_token(request),
    })


@require_GET
def me_view(request):
    """GET /api/auth/me/: người đang đăng nhập; chưa đăng nhập 401; chưa phân quyền 403."""
    denied = _deny_unauthenticated(request)
    if denied:
        return denied
    return JsonResponse(user_payload(request.user))


@require_POST
def logout_view(request):
    """POST /api/auth/logout/: hủy session."""
    if request.user.is_authenticated:
        audit.record(request, "logout", "user", request.user.pk, "Đăng xuất")
    logout(request)
    return JsonResponse({"message": "Đăng xuất thành công."})
