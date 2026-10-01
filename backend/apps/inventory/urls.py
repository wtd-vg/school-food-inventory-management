"""Route API (chủ file: TV4). Mỗi khối ghi mã task; quyền khai ở view và kiểm ở test_security.py."""

from django.urls import path

from apps.inventory import (
    audit_views,
    auth_views,
    class_views,
    day_views,
    demand_views,
    meal_views,
    menu_views,
    notification_views,
    photo_views,
    purchase_views,
    recipe_views,
    student_views,
    user_views,
    views,
)

urlpatterns = [
    path("hello/", views.hello, name="hello"),

    # SF13 + BE-10: xác thực, phiên, vai trò
    path("auth/csrf/", auth_views.get_csrf, name="auth_csrf"),
    path("auth/login/", auth_views.login_view, name="auth_login"),
    path("auth/me/", auth_views.me_view, name="auth_me"),
    path("auth/logout/", auth_views.logout_view, name="auth_logout"),

    # BE-11: tài khoản; BE-15: nhật ký
    path("users/", user_views.users, name="users"),
    path("users/<int:user_id>/", user_views.user_detail, name="user_detail"),
    path("users/<int:user_id>/reset-password/", user_views.user_reset_password, name="user_reset_password"),
    path("audit-logs/", audit_views.audit_logs, name="audit_logs"),

    # Danh mục, mặt hàng, nhà cung cấp
    path("categories/", views.categories, name="categories"),
    path("categories/<int:category_id>/", views.category_detail, name="category_detail"),
    path("foods/", views.foods, name="foods"),
    path("foods/<int:food_id>/", views.food_detail, name="food_detail"),
    path("suppliers/", views.suppliers, name="suppliers"),
    path("suppliers/<int:supplier_id>/", views.supplier_detail, name="supplier_detail"),

    # SF32: kiểm kê
    path("stocktakes/", views.stocktakes, name="stocktakes"),
    path("stocktake-items/<int:item_id>/", views.stocktake_items, name="stocktake_items"),
    path("stocktakes/<int:stocktake_id>/post/", views.stocktake_post, name="stocktake_post"),

    # SF22: phiếu nhập
    path("receipts/", views.receipts, name="receipts"),
    path("receipts/<int:receipt_id>/", views.receipt_detail, name="receipt_detail"),
    path("receipts/<int:receipt_id>/post/", views.receipt_post, name="receipt_post"),

    # SF28: phiếu xuất
    path("issues/", views.issues, name="issues"),
    path("issues/<int:issue_id>/", views.issue_detail, name="issue_detail"),
    path("issues/<int:issue_id>/post/", views.issue_post, name="issue_post"),

    # Báo cáo kho
    path("reports/stock/", views.reports_stock, name="reports_stock"),
    path("reports/transactions/", views.reports_transactions, name="reports_transactions"),

    # SF44 + BE-12: lớp học
    path("classes/", class_views.class_list, name="classes"),
    path("classes/<int:class_id>/", class_views.class_detail, name="class_detail"),

    # SF46 + BE-12: số suất theo ngày
    path("lunch-days/<str:date_str>/counts/", meal_views.lunch_day_counts, name="lunch_day_counts"),
    path("lunch-days/<str:date_str>/open/", meal_views.lunch_day_open, name="lunch_day_open"),
    path("lunch-days/<str:date_str>/lock/", meal_views.lunch_day_lock, name="lunch_day_lock"),
    path("lunch-days/<str:date_str>/reopen/", meal_views.lunch_day_reopen, name="lunch_day_reopen"),

    # SF50 + BE-06: món và công thức
    path("dishes/", recipe_views.dish_list, name="dishes"),
    path("dishes/<int:dish_id>/", recipe_views.dish_detail, name="dish_detail"),

    # SF52 + BE-13: thực đơn cố định, ngày nghỉ
    path("menu/week/", menu_views.menu_week, name="menu_week"),
    path("menu/today/", menu_views.menu_today, name="menu_today"),
    path("menu/versions/", menu_views.menu_versions, name="menu_versions"),
    path("menu/versions/<int:version_id>/", menu_views.menu_version_detail, name="menu_version_detail"),
    path("holidays/", menu_views.holidays, name="holidays"),
    path("holidays/<int:holiday_id>/", menu_views.holiday_detail, name="holiday_detail"),

    # BE-14: học sinh, email phụ huynh (mã hóa)
    path("students/", student_views.students, name="students"),
    path("students/import/", student_views.students_import, name="students_import"),
    path("students/<int:student_id>/", student_views.student_detail, name="student_detail"),
    path("parent-contacts/<int:contact_id>/reveal/", student_views.contact_reveal, name="contact_reveal"),

    # BE-08: email thực đơn 6h30, hủy nhận
    path("notifications/", notification_views.notifications, name="notifications"),
    path("notifications/send/", notification_views.notifications_send, name="notifications_send"),
    path("notifications/test/", notification_views.notifications_test, name="notifications_test"),
    path("unsubscribe/<str:token>/", notification_views.unsubscribe, name="unsubscribe"),

    # Đợt 2 — SF58 nhu cầu & đề xuất
    path("lunch-days/<str:date_str>/demand/", demand_views.lunch_day_demand, name="lunch_day_demand"),
    path("lunch-days/<str:date_str>/demand/calculate/", demand_views.lunch_day_demand_calculate, name="lunch_day_demand_calculate"),
    path("demand-revisions/<int:revision_id>/approve/", demand_views.demand_approve, name="demand_approve"),

    # Đợt 2 — SF64 đơn đặt, nhận theo đơn
    path("purchase-orders/", purchase_views.purchase_orders, name="purchase_orders"),
    path("purchase-orders/from-demand/", purchase_views.purchase_order_from_demand, name="purchase_order_from_demand"),
    path("purchase-orders/<int:po_id>/", purchase_views.purchase_order_detail, name="purchase_order_detail"),
    path("purchase-orders/<int:po_id>/receipts/", purchase_views.purchase_order_receipts, name="purchase_order_receipts"),
    path("purchase-orders/<int:po_id>/<str:action>/", purchase_views.purchase_order_action, name="purchase_order_action"),

    # Đợt 2 — SF68/70 xuất theo ngày, chi phí, đóng ngày, báo cáo ngày
    path("lunch-days/<str:date_str>/issue/", day_views.lunch_day_issue, name="lunch_day_issue"),
    path("lunch-days/<str:date_str>/cost/", day_views.lunch_day_cost, name="lunch_day_cost"),
    path("lunch-days/<str:date_str>/close/", day_views.lunch_day_close, name="lunch_day_close"),
    path("lunch-days/<str:date_str>/reopen-close/", day_views.lunch_day_reopen_close, name="lunch_day_reopen_close"),
    path("reports/daily/", day_views.reports_daily, name="reports_daily"),

    # SF73 ảnh suất ăn thực tế
    path("lunch-days/<str:date_str>/photos/", photo_views.lunch_day_photos, name="lunch_day_photos"),
    path("meal-photos/<int:photo_id>/", photo_views.meal_photo_detail, name="meal_photo_detail"),
    path("meal-photos/<int:photo_id>/image/", photo_views.meal_photo_image, name="meal_photo_image"),
]
