from django.urls import path

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
    path("hello/", hello, name="hello"),

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