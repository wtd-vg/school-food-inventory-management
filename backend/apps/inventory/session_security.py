"""BE-10: giới hạn tuổi phiên đăng nhập.

- Không thao tác 30 phút: SESSION_COOKIE_AGE=1800 + SESSION_SAVE_EVERY_REQUEST (Django tự hết hạn).
- Tối đa 12 giờ kể từ lúc đăng nhập (login_view ghi `auth_at`): quá hạn thì đăng xuất ngay, request đó
  nhận 401 từ decorator quyền. Phiên tạo bằng đường khác (trang /admin) chưa có `auth_at` thì tính từ
  request đầu tiên đi qua middleware.
"""

from django.conf import settings
from django.contrib.auth import logout
from django.utils import timezone

from .auth_views import SESSION_AUTH_AT


class AbsoluteSessionTimeoutMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            now = timezone.now().timestamp()
            started = request.session.get(SESSION_AUTH_AT)
            max_age = getattr(settings, "SESSION_ABSOLUTE_MAX_AGE", 12 * 3600)
            if not isinstance(started, (int, float)):
                request.session[SESSION_AUTH_AT] = now
            elif now - started > max_age:
                logout(request)
        return self.get_response(request)
