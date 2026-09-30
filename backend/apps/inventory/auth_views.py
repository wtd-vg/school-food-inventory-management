"""Xử lý xác thực người dùng, session, CSRF và phân quyền theo mốc M2 (SF13)."""

from functools import wraps
import json
from typing import Any, Callable

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import Group, User
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET, require_POST


def get_user_role(user: User) -> str:
    """Xác định role của người dùng: 'manager' hoặc 'viewer'."""
    if user.is_superuser or user.groups.filter(name="manager").exists():
        return "manager"
    return "viewer"


@require_GET
def get_csrf(request: HttpRequest) -> JsonResponse:
    """
    GET /api/auth/csrf/
    Trả về CSRF token và thiết lập csrftoken cookie cho trình duyệt/React client.
    """
    token = get_token(request)
    return JsonResponse(
        {
            "csrf_token": token,
            "message": "CSRF cookie đã được thiết lập.",
        },
        status=200,
    )


@require_POST
def login_view(request: HttpRequest) -> JsonResponse:
    """
    POST /api/auth/login/
    Nhận username và password qua JSON body. Xác thực và lưu session.
    Tuyệt đối không ghi log mật khẩu.
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {
                "message": "Dữ liệu JSON không hợp lệ.",
                "errors": {"body": "Invalid JSON"},
            },
            status=400,
        )

    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return JsonResponse(
            {
                "message": "Tên đăng nhập và mật khẩu là bắt buộc.",
                "errors": {
                    "username": "Trường này là bắt buộc." if not username else "",
                    "password": "Trường này là bắt buộc." if not password else "",
                },
            },
            status=400,
        )

    # Dùng hàm authenticate chuẩn của Django (không ghi log password)
    user = authenticate(request, username=username.strip(), password=password)

    if user is None:
        return JsonResponse(
            {
                "message": "Tên đăng nhập hoặc mật khẩu không chính xác.",
            },
            status=401,
        )

    if not user.is_active:
        return JsonResponse(
            {
                "message": "Tài khoản này đã bị khóa.",
            },
            status=403,
        )

    # Đăng nhập và tạo session cookie
    login(request, user)
    # Lấy token mới sau khi login (Django có thể xoay token)
    new_csrf_token = get_token(request)

    role = get_user_role(user)

    return JsonResponse(
        {
            "message": "Đăng nhập thành công.",
            "user": {
                "id": user.id,
                "username": user.username,
                "role": role,
            },
            "csrf_token": new_csrf_token,
        },
        status=200,
    )


@require_GET
def me_view(request: HttpRequest) -> JsonResponse:
    """
    GET /api/auth/me/
    Trả về thông tin người dùng đang đăng nhập: id, username, role.
    Chưa đăng nhập trả 401.
    """
    if not request.user.is_authenticated:
        return JsonResponse(
            {
                "message": "Chưa đăng nhập.",
            },
            status=401,
        )

    role = get_user_role(request.user)

    return JsonResponse(
        {
            "id": request.user.id,
            "username": request.user.username,
            "role": role,
        },
        status=200,
    )


@require_POST
def logout_view(request: HttpRequest) -> JsonResponse:
    """
    POST /api/auth/logout/
    Hủy session hiện tại của người dùng.
    """
    logout(request)
    return JsonResponse(
        {
            "message": "Đăng xuất thành công.",
        },
        status=200,
    )


def inventory_permission_required(view_func: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
    """
    Decorator bảo vệ API nghiệp vụ từ M2:
    - Chưa đăng nhập (anonymous): trả 401.
    - Phương thức đọc (GET, HEAD, OPTIONS): viewer và manager đều được phép.
    - Phương thức ghi (POST, PATCH, PUT, DELETE): chỉ manager được phép, viewer bị chặn 403.
    """
    @wraps(view_func)
    def _wrapped_view(request: HttpRequest, *args: Any, **kwargs: Any) -> HttpResponse:
        if not request.user.is_authenticated:
            return JsonResponse(
                {
                    "message": "Yêu cầu đăng nhập để truy cập tài nguyên này.",
                },
                status=401,
            )

        # Các phương thức thay đổi dữ liệu
        if request.method in ["POST", "PATCH", "PUT", "DELETE"]:
            role = get_user_role(request.user)
            if role != "manager":
                return JsonResponse(
                    {
                        "message": "Bạn không có quyền thực hiện thao tác này. Quyền yêu cầu: manager.",
                    },
                    status=403,
                )

        return view_func(request, *args, **kwargs)

    return _wrapped_view
