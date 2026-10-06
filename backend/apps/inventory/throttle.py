"""BE-10: khóa đăng nhập sai theo tên đăng nhập và theo IP (bảng LoginThrottle, migration 0014).

- Cửa sổ 15 phút: quá 15 phút kể từ lần sai đầu tiên thì đếm lại từ 0.
- Đủ ngưỡng (tên đăng nhập 5, IP 20) → khóa 15 phút; hết khóa thì đếm lại.
- Đăng nhập đúng xóa bộ đếm theo tên đăng nhập (bộ đếm IP giữ nguyên để chống dò nhiều tài khoản).
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import LoginThrottle

WINDOW = timedelta(minutes=15)
LOCK = timedelta(minutes=15)
LIMITS = {LoginThrottle.Scope.USER: 5, LoginThrottle.Scope.IP: 20}


def _key(scope, value):
    return LoginThrottle.hash_key(scope, value)


def locked_seconds(scope, value):
    """Số giây còn bị khóa (0 nếu không khóa)."""
    if not value:
        return 0
    row = LoginThrottle.objects.filter(scope=scope, key_hash=_key(scope, value)).first()
    if row is None or row.locked_until is None:
        return 0
    remaining = (row.locked_until - timezone.now()).total_seconds()
    return int(remaining) + 1 if remaining > 0 else 0


@transaction.atomic
def register_failure(scope, value):
    """Ghi một lần sai; trả số giây bị khóa nếu lần này chạm ngưỡng, ngược lại 0."""
    if not value:
        return 0
    now = timezone.now()
    row, _ = LoginThrottle.objects.select_for_update().get_or_create(
        scope=scope, key_hash=_key(scope, value), defaults={"window_start": now},
    )
    if row.locked_until and row.locked_until > now:
        return int((row.locked_until - now).total_seconds()) + 1
    if row.locked_until or now - row.window_start > WINDOW:
        row.failures = 0
        row.window_start = now
        row.locked_until = None
    row.failures += 1
    locked = 0
    if row.failures >= LIMITS[scope]:
        row.locked_until = now + LOCK
        row.failures = 0
        locked = int(LOCK.total_seconds())
    row.save(update_fields=["failures", "window_start", "locked_until"])
    return locked


def reset(scope, value):
    if value:
        LoginThrottle.objects.filter(scope=scope, key_hash=_key(scope, value)).delete()
