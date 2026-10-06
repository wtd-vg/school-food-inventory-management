"""API món và công thức (SF50, BE-06). Định lượng cho một suất, 6 số lẻ; quy đổi ở recipe_services.

API ngày ăn/số suất đã chuyển sang meal_views.py (BE-12).
"""

from django.db import IntegrityError, transaction
from django.http import JsonResponse

from . import audit
from .auth_views import inventory_permission_required
from .http_input import Conflict, json_api, method_not_allowed, only_fields, opt_bool, read_object, req_str
from .models import Dish
from .recipe_services import component_payload, ensure_dish_can_deactivate, parse_components, replace_components


def _dish(d):
    comps = [component_payload(c) for c in d.components.all()]
    return {"id": d.id, "code": d.code, "name": d.name, "is_active": d.is_active,
            "has_recipe": bool(comps), "components": comps}


def _dishes():
    return Dish.objects.prefetch_related("components__food").order_by("name", "id")


@inventory_permission_required
@json_api
def dish_list(request):
    if request.method == "GET":
        return JsonResponse({"results": [_dish(d) for d in _dishes()]})
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"code", "name", "is_active", "components"})
    code = req_str(data, "code", 32, upper=True, label="Mã món")
    name = req_str(data, "name", 120, label="Tên món")
    is_active = opt_bool(data, "is_active")
    components = parse_components(data.get("components"))
    try:
        with transaction.atomic():
            dish = Dish.objects.create(code=code, name=name, is_active=True if is_active is None else is_active)
            replace_components(dish, components)
            audit.record(request, "dish_create", "dish", dish.id, f"Tạo món {dish.code} ({len(components)} nguyên liệu)")
    except IntegrityError:
        raise Conflict(f"Mã món {code} đã tồn tại.", {"code": "Đã tồn tại."})
    return JsonResponse(_dish(_dishes().get(id=dish.id)), status=201)


@inventory_permission_required
@json_api
def dish_detail(request, dish_id):
    if request.method == "GET":
        return JsonResponse(_dish(_dishes().get(id=dish_id)))
    if request.method != "PATCH":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"name", "is_active", "components"})
    components = parse_components(data["components"]) if "components" in data else None
    with transaction.atomic():
        dish = Dish.objects.select_for_update().get(id=dish_id)
        before = {"name": dish.name, "is_active": dish.is_active,
                  "components": [component_payload(c) for c in dish.components.select_related("food")]}
        if "name" in data:
            dish.name = req_str(data, "name", 120, label="Tên món")
        is_active = opt_bool(data, "is_active")
        if is_active is not None:
            if is_active is False and dish.is_active:
                ensure_dish_can_deactivate(dish)
            dish.is_active = is_active
        dish.save()
        if components is not None:
            replace_components(dish, components)
        after = {"name": dish.name, "is_active": dish.is_active,
                 "components": [component_payload(c) for c in dish.components.select_related("food")]}
        audit.record(request, "dish_update", "dish", dish.id, f"Sửa món {dish.code}", before=before, after=after)
    return JsonResponse(_dish(_dishes().get(id=dish.id)))
