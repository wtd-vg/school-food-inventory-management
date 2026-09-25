from django.urls import path

from apps.inventory.auth_views import (
    get_csrf,
    login_view,
    logout_view,
    me_view,
)
from apps.inventory.views import (
    hello,
    categories,
    category_detail,
    foods,
    food_detail,
    suppliers,
    supplier_detail,
)

urlpatterns = [
    # API kiểm tra kết nối skeleton
    path("hello/", hello, name="hello"),

    # SF13: Xác thực và phân quyền session
    path("auth/csrf/", get_csrf, name="auth_csrf"),
    path("auth/login/", login_view, name="auth_login"),
    path("auth/me/", me_view, name="auth_me"),
    path("auth/logout/", logout_view, name="auth_logout"),

    # GET + POST
    path("categories/", categories, name="categories"),

    # PATCH + DELETE
    path(
        "categories/<int:category_id>/",
        category_detail,
        name="category_detail",
    ),
    path("foods/", foods, name="foods"),

    path(
        "foods/<int:food_id>/",
        food_detail,
        name="food_detail",
    ),
    path("suppliers/", suppliers, name="suppliers"),

    path(
        "suppliers/<int:supplier_id>/",
        supplier_detail,
        name="supplier_detail",
    ),
]