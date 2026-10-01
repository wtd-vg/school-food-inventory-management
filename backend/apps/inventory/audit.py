"""BE-15: ghi nhật ký thao tác (AuditLog chỉ thêm, trigger ở 0014).

Gọi tường minh `record(...)` trong view/service, BÊN TRONG transaction của thao tác: thao tác rollback
thì dòng nhật ký cũng rollback. Không dùng signal. Không ghi mật khẩu, token, email phụ huynh rõ.
"""

from decimal import Decimal

from .http_input import client_ip
from .models import AuditLog

SENSITIVE_KEYS = ("password", "token", "secret", "email", "phone")
MASK = "***"


def _is_sensitive(key):
    k = str(key).lower()
    return k.endswith("_encrypted") or any(s in k for s in SENSITIVE_KEYS)


def _plain(value):
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    return value


def diff(before, after):
    """{field: [trước, sau]} chỉ với field thay đổi; field nhạy cảm che bằng ***."""
    before = before or {}
    after = after or {}
    changes = {}
    for key in sorted(set(before) | set(after)):
        old, new = _plain(before.get(key)), _plain(after.get(key))
        if old == new:
            continue
        changes[key] = [MASK, MASK] if _is_sensitive(key) else [old, new]
    return changes


def record(request, action, entity_type="", entity_id="", summary="", before=None, after=None,
           changes=None, actor=None, actor_username=None):
    user = actor
    if user is None and request is not None and getattr(request, "user", None) is not None:
        user = request.user if request.user.is_authenticated else None
    payload = changes if changes is not None else diff(before, after)
    payload = {k: (MASK if _is_sensitive(k) else _plain(v)) for k, v in payload.items()} if changes is not None else payload
    return AuditLog.objects.create(
        actor=user,
        actor_username=(actor_username if actor_username is not None else (user.get_username() if user else ""))[:150],
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id or "")[:40],
        summary=str(summary)[:255],
        changes=payload,
        ip=client_ip(request) if request is not None else None,
        user_agent=(request.META.get("HTTP_USER_AGENT", "") if request is not None else "")[:200],
    )


def snapshot(obj, fields):
    return {f: getattr(obj, f) for f in fields}
