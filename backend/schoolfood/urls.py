"""Nơi nối URL người dùng gọi với hàm Python xử lý request."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.inventory.urls")),
]
