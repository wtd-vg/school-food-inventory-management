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
    stocktakes,
    stocktake_items,
    stocktake_post,
    receipts,
    receipt_detail,
    receipt_post,
    issues,
    issue_detail,
    issue_post,
)

urlpatterns = [
    # API kim tra kt n`i skeleton
    path("hello/", hello, name="hello"),

    # SF13: XAc thc vA phAn quy?n session
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

    # SF32: Kiểm kê
    path("stocktakes/", stocktakes, name="stocktakes"),
    path("stocktake-items/<int:item_id>/", stocktake_items, name="stocktake_items"),
    path("stocktakes/<int:stocktake_id>/post/", stocktake_post, name="stocktake_post"),

    # SF22: Phiếu nhập kho
    path("receipts/", receipts, name="receipts"),
    path("receipts/<int:receipt_id>/", receipt_detail, name="receipt_detail"),
    path("receipts/<int:receipt_id>/post/", receipt_post, name="receipt_post"),

    # SF28: Phiếu xuất kho
    path("issues/", issues, name="issues"),
    path("issues/<int:issue_id>/", issue_detail, name="issue_detail"),
    path("issues/<int:issue_id>/post/", issue_post, name="issue_post"),
]

from apps.inventory.views import reports_stock, reports_transactions
urlpatterns.extend([
    path('reports/stock/', reports_stock, name='reports_stock'),
    path('reports/transactions/', reports_transactions, name='reports_transactions'),
])
