"""Cấu hình Django tối thiểu cho môi trường học tập/local."""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

# Thư mục backend/, nơi có manage.py.
BASE_DIR = Path(__file__).resolve().parent.parent

# DEBUG, SECRET_KEY, ALLOWED_HOSTS được đặt ở mục "SF38/SF40: Production" cuối file.

# Django cần các app mặc định này cho admin, user và session.
# inventory là app duy nhất do team tự tạo ở giai đoạn skeleton.
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "apps.inventory",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # BE-10: phiên tối đa 12 giờ kể từ lúc đăng nhập (đặt sau AuthenticationMiddleware).
    "apps.inventory.session_security.AbsoluteSessionTimeoutMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "schoolfood.urls"

# Django admin cần cấu hình template mặc định này.
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "schoolfood.wsgi.application"

# Django kết nối tới service `db` trong compose.yaml.
# Khi chạy ngoài Docker có thể đổi các biến DB_* trên máy local.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "schoolfood"),
        "USER": os.getenv("DB_USER", "schoolfood"),
        "PASSWORD": os.getenv("DB_PASSWORD", "schoolfood"),
        "HOST": os.getenv("DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("DB_PORT", "5432"),
    }
}

import urllib.parse
import sys

# SF38: Parse DATABASE_URL for staging/cloud
database_url = os.getenv("DATABASE_URL")
if database_url:
    parsed_db = urllib.parse.urlparse(database_url)
    DATABASES["default"]["NAME"] = parsed_db.path.lstrip("/")
    DATABASES["default"]["USER"] = parsed_db.username
    DATABASES["default"]["PASSWORD"] = parsed_db.password
    DATABASES["default"]["HOST"] = parsed_db.hostname
    DATABASES["default"]["PORT"] = parsed_db.port
    # DB cloud (Neon, Supabase...) cần ?sslmode=require trong URL.
    sslmode = urllib.parse.parse_qs(parsed_db.query).get("sslmode")
    if sslmode:
        DATABASES["default"]["OPTIONS"] = {"sslmode": sslmode[0]}

# SF38: Test chỉ được chạy trên PostgreSQL ở máy local/container, không bao giờ trên DB cloud.
if "test" in sys.argv:
    DATABASES["default"]["TEST"] = {"NAME": "test_schoolfood_local"}
    if DATABASES["default"]["HOST"] not in {"localhost", "127.0.0.1", "::1", "db"}:
        raise ImproperlyConfigured(
            "Từ chối chạy test trên DB host không phải local. "
            "Bỏ DATABASE_URL và đặt DB_HOST=127.0.0.1 (xem CLAUDE.md §4)."
        )

# BE-10 (R12): mật khẩu ≥ 10 ký tự, không phổ biến, không giống tên đăng nhập, không toàn số.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "vi"
TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# collectstatic gom file admin vào đây; nginx phục vụ ở production.
STATIC_ROOT = BASE_DIR / "staticfiles"
# SF73: ảnh suất ăn lưu trên ổ server (volume media ở compose.prod.yaml). Không có URL công khai:
# ảnh chỉ tải qua API cần đăng nhập, nên không cấu hình nginx phục vụ thư mục này.
MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", str(BASE_DIR / "media")))
MEDIA_URL = "/media/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Cấu hình CSRF và Session cho M2 (SF13)
CSRF_COOKIE_HTTPONLY = False
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
# BE-10 (R12): hết hạn sau 30 phút không thao tác (cookie gia hạn mỗi request), tối đa 12 giờ.
SESSION_COOKIE_AGE = int(os.getenv("SESSION_IDLE_SECONDS", "1800"))
SESSION_SAVE_EVERY_REQUEST = True
SESSION_ABSOLUTE_MAX_AGE = int(os.getenv("SESSION_ABSOLUTE_SECONDS", str(12 * 3600)))
CSRF_COOKIE_SAMESITE = "Lax"

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

# SF38/SF40: Production. DEBUG=True (mặc định) giữ nguyên hành vi dev;
# DEBUG=False bắt buộc có SECRET_KEY, ALLOWED_HOSTS rõ ràng (ISSUE-010).
def _env_bool(name, default):
    return os.getenv(name, str(default)).strip().lower() == "true"


def _env_list(name):
    return [item.strip() for item in os.getenv(name, "").split(",") if item.strip()]


DEBUG = _env_bool("DEBUG", True)

if DEBUG:
    SECRET_KEY = os.getenv("SECRET_KEY", "local-development-only")
    ALLOWED_HOSTS = _env_list("ALLOWED_HOSTS") or ["*"]
else:
    SECRET_KEY = os.getenv("SECRET_KEY", "")
    if len(SECRET_KEY) < 50:
        raise ImproperlyConfigured("DEBUG=False cần biến môi trường SECRET_KEY dài ít nhất 50 ký tự.")
    ALLOWED_HOSTS = _env_list("ALLOWED_HOSTS")
    if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
        raise ImproperlyConfigured("DEBUG=False cần ALLOWED_HOSTS là danh sách domain cụ thể, không dùng '*'.")

CSRF_TRUSTED_ORIGINS += _env_list("CSRF_TRUSTED_ORIGINS")

# BE-04: khóa mã hóa email phụ huynh. Production bắt buộc đặt riêng (docs/SECURITY.md); local/test dùng
# khóa suy ra từ SECRET_KEY và in cảnh báo.
FIELD_ENCRYPTION_KEYS = os.getenv("FIELD_ENCRYPTION_KEYS", "")
CONTACT_HASH_KEY = os.getenv("CONTACT_HASH_KEY", "")
if not FIELD_ENCRYPTION_KEYS or not CONTACT_HASH_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DEBUG=False cần FIELD_ENCRYPTION_KEYS và CONTACT_HASH_KEY (xem docs/SECURITY.md).")
    import base64
    import hashlib
    import warnings

    warnings.warn("Dùng khóa mã hóa dev suy từ SECRET_KEY; KHÔNG dùng cho dữ liệu thật.", RuntimeWarning)
    FIELD_ENCRYPTION_KEYS = FIELD_ENCRYPTION_KEYS or base64.urlsafe_b64encode(
        hashlib.sha256(("field:" + SECRET_KEY).encode()).digest()).decode()
    CONTACT_HASH_KEY = CONTACT_HASH_KEY or hashlib.sha256(("contact:" + SECRET_KEY).encode()).hexdigest()

# BE-08 (R11): email thực đơn cho phụ huynh qua SMTP (Gmail App Password, đổi sang SES chỉ cần đổi env).
# EMAIL_MODE=dry_run (mặc định) chỉ ghi nhật ký, không gửi thư thật.
EMAIL_MODE = os.getenv("EMAIL_MODE", "dry_run").strip().lower()
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = _env_bool("EMAIL_USE_TLS", True)
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_TIMEOUT = int(os.getenv("EMAIL_TIMEOUT", "10"))
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "SchoolFood <noreply@localhost>")
EMAIL_DAILY_LIMIT = int(os.getenv("EMAIL_DAILY_LIMIT", "450"))
MENU_SEND_TIME = os.getenv("MENU_SEND_TIME", "06:30")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:5173").rstrip("/")
SCHOOL_NAME = os.getenv("SCHOOL_NAME", "Nhà trường")
if EMAIL_MODE not in {"dry_run", "smtp"}:
    raise ImproperlyConfigured("EMAIL_MODE chỉ nhận dry_run hoặc smtp.")

# BE-10: chỉ tin header X-Real-IP khi đứng sau nginx/Cloudflare (production); local dùng REMOTE_ADDR.
TRUST_PROXY_IP = _env_bool("TRUST_PROXY_IP", False)

if not DEBUG:
    # nginx chuyển tiếp X-Forwarded-Proto=https do Cloudflare gửi qua tunnel.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", True)
    CSRF_COOKIE_SECURE = _env_bool("COOKIE_SECURE", True)
    SESSION_COOKIE_SECURE = _env_bool("COOKIE_SECURE", True)
    # Bắt đầu thấp; tăng dần khi HTTPS đã ổn định. Không bật preload mặc định vì khó rút lại.
    SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "3600"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
    SECURE_HSTS_PRELOAD = _env_bool("SECURE_HSTS_PRELOAD", False)
    CONN_MAX_AGE = int(os.getenv("CONN_MAX_AGE", "60"))
    # Không có DEBUG thì traceback lỗi 500 phải ra log container (docker compose logs backend).
    LOGGING = {
        "version": 1,
        "disable_existing_loggers": False,
        "handlers": {"console": {"class": "logging.StreamHandler"}},
        "root": {"handlers": ["console"], "level": "WARNING"},
        "loggers": {
            "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
        },
    }
