"""BE-11: quản lý tài khoản (chỉ Hiệu trưởng/superuser).

GET/POST /api/users/                       {username, full_name, role, password}
PATCH    /api/users/<id>/                  {full_name?, role?, is_active?}
POST     /api/users/<id>/reset-password/   {password}
Luật: không sửa superuser qua API; không tự khóa/đổi vai trò chính mình; luôn còn ≥ 1 Hiệu trưởng
đang hoạt động. Khóa tài khoản hoặc đặt lại mật khẩu → các phiên cũ mất hiệu lực. Không trả mật khẩu.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.contrib.sessions.models import Session
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone

from . import audit
from .auth_views import get_user_role, principal_required
from .http_input import Conflict, InputError, field_error, json_api, method_not_allowed, only_fields, opt_bool, read_object, req_str
from .models import ROLE_MANAGER, ROLE_PRINCIPAL

ROLES = (ROLE_MANAGER, ROLE_PRINCIPAL)
User = get_user_model()


def _user(u):
    return {
        "id": u.id,
        "username": u.username,
        "full_name": u.get_full_name(),
        "role": get_user_role(u) if u.is_active else _group_role(u),
        "is_active": u.is_active,
        "is_superuser": u.is_superuser,
        "last_login": u.last_login.isoformat() if u.last_login else None,
        "date_joined": u.date_joined.isoformat(),
    }


def _group_role(u):
    names = set(u.groups.values_list("name", flat=True))
    return ROLE_MANAGER if ROLE_MANAGER in names else ROLE_PRINCIPAL if ROLE_PRINCIPAL in names else None


def _role(data):
    role = req_str(data, "role", 20, label="Vai trò")
    if role not in ROLES:
        raise field_error("role", "Chỉ nhận manager hoặc principal.", "Vai trò phải là Quản lý (manager) hoặc Hiệu trưởng (principal).")
    return role


def _password(data, user):
    password = data.get("password")
    if not isinstance(password, str) or not password:
        raise field_error("password", "Trường này là bắt buộc.", "Thiếu mật khẩu.")
    if len(password) > 128:
        raise field_error("password", "Tối đa 128 ký tự.", "Mật khẩu quá dài.")
    try:
        validate_password(password, user)
    except ValidationError as exc:
        raise InputError("Mật khẩu chưa đủ mạnh: " + " ".join(exc.messages), {"password": " ".join(exc.messages)})
    return password


def _set_role(user, role):
    user.groups.remove(*Group.objects.filter(name__in=ROLES))
    user.groups.add(Group.objects.get_or_create(name=role)[0])


def _ensure_principal_remains(excluding_user_id):
    """Gọi trong atomic: khóa các Hiệu trưởng đang hoạt động để hai thao tác song song không cùng bỏ người cuối."""
    principals = list(
        User.objects.select_for_update(of=("self",)).filter(is_active=True, groups__name=ROLE_PRINCIPAL).values_list("id", flat=True)
    )
    if not [pk for pk in principals if pk != excluding_user_id] and not User.objects.filter(is_superuser=True, is_active=True).exists():
        raise Conflict("Phải luôn còn ít nhất một Hiệu trưởng đang hoạt động.")


def kill_sessions(user):
    """Xóa mọi phiên đăng nhập của user (ít tài khoản nên duyệt toàn bộ phiên còn hạn)."""
    target = str(user.pk)
    for session in Session.objects.filter(expire_date__gt=timezone.now()):
        if session.get_decoded().get("_auth_user_id") == target:
            session.delete()


@principal_required
@json_api
def users(request):
    if request.method == "GET":
        rows = User.objects.prefetch_related("groups").order_by("username")
        return JsonResponse({"results": [_user(u) for u in rows]})
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"username", "full_name", "role", "password"})
    username = req_str(data, "username", 150, label="Tên đăng nhập")
    full_name = req_str(data, "full_name", 150, label="Họ tên")
    role = _role(data)
    candidate = User(username=username, first_name=full_name)
    password = _password(data, candidate)
    try:
        with transaction.atomic():
            user = User.objects.create_user(username=username, password=password, first_name=full_name)
            _set_role(user, role)
            audit.record(request, "user_create", "user", user.id, f"Tạo tài khoản {username} ({role})",
                         after={"username": username, "full_name": full_name, "role": role})
    except IntegrityError:
        raise Conflict(f"Tên đăng nhập {username} đã tồn tại.", {"username": "Đã tồn tại."})
    return JsonResponse(_user(user), status=201)


def _target(user_id):
    user = User.objects.select_for_update().get(id=user_id)
    if user.is_superuser:
        raise PermissionDenied("Không sửa tài khoản quản trị hệ thống (superuser) qua màn này.")
    return user


@principal_required
@json_api
def user_detail(request, user_id):
    if request.method == "GET":
        return JsonResponse(_user(User.objects.get(id=user_id)))
    if request.method != "PATCH":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"full_name", "role", "is_active"})
    with transaction.atomic():
        user = _target(user_id)
        before = {"full_name": user.get_full_name(), "role": _group_role(user), "is_active": user.is_active}
        role = _role(data) if "role" in data else None
        is_active = opt_bool(data, "is_active")
        is_self = user.pk == request.user.pk
        if is_self and ((role and role != before["role"]) or is_active is False):
            raise Conflict("Không tự khóa hoặc tự đổi vai trò của chính mình.")
        losing_principal = before["role"] == ROLE_PRINCIPAL and before["is_active"] and (
            (role and role != ROLE_PRINCIPAL) or is_active is False)
        if losing_principal:
            _ensure_principal_remains(user.pk)
        if "full_name" in data:
            user.first_name = req_str(data, "full_name", 150, label="Họ tên")
            user.last_name = ""
        if is_active is not None:
            user.is_active = is_active
        user.save()
        if role:
            _set_role(user, role)
        after = {"full_name": user.get_full_name(), "role": _group_role(user), "is_active": user.is_active}
        if before["is_active"] and not user.is_active:
            kill_sessions(user)
            action = "user_lock"
        elif not before["is_active"] and user.is_active:
            action = "user_unlock"
        else:
            action = "user_update"
        audit.record(request, action, "user", user.id, f"Sửa tài khoản {user.username}", before=before, after=after)
    return JsonResponse(_user(user))


@principal_required
@json_api
def user_reset_password(request, user_id):
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"password"})
    with transaction.atomic():
        user = _target(user_id)
        user.set_password(_password(data, user))
        user.save(update_fields=["password"])
        kill_sessions(user)
        audit.record(request, "user_reset_password", "user", user.id, f"Đặt lại mật khẩu {user.username}")
    return JsonResponse({"message": f"Đã đặt lại mật khẩu cho {user.username}. Các phiên đăng nhập cũ đã bị đăng xuất."})
