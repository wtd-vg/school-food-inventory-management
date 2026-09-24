"""Cấu hình Django tối thiểu cho môi trường học tập/local."""

import os
from pathlib import Path

# Thư mục backend/, nơi có manage.py.
BASE_DIR = Path(__file__).resolve().parent.parent

# Giá trị này chỉ dùng local. Khi deploy thật, team sẽ học cách đưa secret ra biến môi trường.
SECRET_KEY = "local-development-only"
DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "backend"]

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

# Skeleton chưa làm form đăng ký nên chưa cần password validator.
AUTH_PASSWORD_VALIDATORS: list[dict[str, str]] = []

LANGUAGE_CODE = "vi"
TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Cấu hình CSRF và Session cho M2 (SF13)
CSRF_COOKIE_HTTPONLY = False
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
