import json
from decimal import Decimal, InvalidOperation
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction
from .models import Dish, RecipeComponent, FoodItem
from .auth_views import inventory_permission_required

def _positive_decimal(value):
    try:
        val = Decimal(str(value))
        if val <= 0 or val.is_nan() or val.is_infinite():
            raise ValueError("Must be positive and finite")
        return val
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid number format")

def convert_quantity(food_unit, input_qty_str, input_unit):
    input_unit = str(input_unit).strip().lower()
    food_unit = str(food_unit).strip().lower()
    
    qty = _positive_decimal(input_qty_str)
    
    # Base units expected in FoodItem: 'kg', 'lit', 'piece'
    if food_unit == "kg":
        if input_unit == "kg":
            return qty
        elif input_unit == "g":
            return qty / Decimal("1000")
        else:
            raise ValueError(f"Cannot convert {input_unit} to {food_unit}")
            
    elif food_unit == "lit":
        if input_unit == "lit":
            return qty
        elif input_unit == "ml":
            return qty / Decimal("1000")
        else:
            raise ValueError(f"Cannot convert {input_unit} to {food_unit}")
            
    elif food_unit == "piece":
        if input_unit == "piece":
            return qty
        else:
            raise ValueError(f"Cannot convert {input_unit} to {food_unit}")
            
    else:
        # Fallback if food_unit is something else, just require exact match
        if input_unit == food_unit:
            return qty
        else:
            raise ValueError(f"Unknown unit mapping from {input_unit} to {food_unit}")

@require_http_methods(["GET", "POST"])
@inventory_permission_required
def dish_list(request):
    if request.method == "GET":
        dishes = Dish.objects.all().prefetch_related("components__food").order_by("id")
        results = []
        for d in dishes:
            components = []
            for comp in d.components.all():
                components.append({
                    "food_id": comp.food_id,
                    "quantity": str(comp.quantity),
                    "food_unit": comp.food.unit
                })
            results.append({
                "id": d.id, "code": d.code, "name": d.name, "is_active": d.is_active,
                "components": components
            })
        return JsonResponse({"results": results})
        
    elif request.method == "POST":
        if request.user.groups.filter(name="viewer").exists():
            return JsonResponse({"message": "Permission denied"}, status=403)
            
        try:
            data = json.loads(request.body)
            code = str(data.get("code", "")).strip().upper()
            name = str(data.get("name", "")).strip()
            
            if not code or not name:
                return JsonResponse({"message": "Code and name are required"}, status=400)
                
            if Dish.objects.filter(code=code).exists():
                return JsonResponse({"message": "Dish code already exists"}, status=409)
            
            components_data = data.get("components", [])
            if not isinstance(components_data, list):
                return JsonResponse({"message": "Components must be a list"}, status=400)
            if not components_data:
                return JsonResponse({"message": "Empty recipe"}, status=400)
                
            with transaction.atomic():
                dish = Dish.objects.create(code=code, name=name)
                
                food_ids_seen = set()
                for comp_data in components_data:
                    food_id = comp_data.get("food_id")
                    if food_id in food_ids_seen:
                        raise ValueError("Duplicate food in components")
                    food_ids_seen.add(food_id)
                    
                    try:
                        food = FoodItem.objects.get(id=food_id)
                    except FoodItem.DoesNotExist:
                        raise ValueError(f"FoodItem {food_id} not found")
                        
                    qty_converted = convert_quantity(
                        food.unit, 
                        comp_data.get("quantity"), 
                        comp_data.get("unit")
                    )
                    
                    RecipeComponent.objects.create(
                        dish=dish,
                        food=food,
                        quantity=qty_converted
                    )
            
            return JsonResponse({"id": dish.id, "code": dish.code, "name": dish.name}, status=201)
            
        except json.JSONDecodeError:
            return JsonResponse({"message": "Invalid JSON"}, status=400)
        except ValueError as e:
            return JsonResponse({"message": str(e)}, status=400)

@require_http_methods(["PATCH"])
@inventory_permission_required
def dish_detail(request, dish_id):
    if request.user.groups.filter(name="viewer").exists():
        return JsonResponse({"message": "Permission denied"}, status=403)
        
    try:
        dish = Dish.objects.get(id=dish_id)
        data = json.loads(request.body)
        
        with transaction.atomic():
            if "name" in data:
                name = str(data["name"]).strip()
                if not name:
                    return JsonResponse({"message": "Name cannot be empty"}, status=400)
                dish.name = name
                
            if "is_active" in data:
                dish.is_active = bool(data["is_active"])
                
            if "components" in data:
                components_data = data["components"]
                if not isinstance(components_data, list):
                    raise ValueError("Components must be a list")
                if not components_data:
                    raise ValueError("Empty recipe")
                
                dish.components.all().delete()
                
                food_ids_seen = set()
                for comp_data in components_data:
                    food_id = comp_data.get("food_id")
                    if food_id in food_ids_seen:
                        raise ValueError("Duplicate food in components")
                    food_ids_seen.add(food_id)
                    
                    try:
                        food = FoodItem.objects.get(id=food_id)
                    except FoodItem.DoesNotExist:
                        raise ValueError(f"FoodItem {food_id} not found")
                        
                    qty_converted = convert_quantity(
                        food.unit, 
                        comp_data.get("quantity"), 
                        comp_data.get("unit")
                    )
                    
                    RecipeComponent.objects.create(
                        dish=dish,
                        food=food,
                        quantity=qty_converted
                    )
            
            dish.save()
            
        return JsonResponse({"id": dish.id, "code": dish.code, "name": dish.name, "is_active": dish.is_active})
        
    except Dish.DoesNotExist:
        return JsonResponse({"message": "Dish not found"}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({"message": "Invalid JSON"}, status=400)
    except ValueError as e:
        return JsonResponse({"message": str(e)}, status=400)

from datetime import datetime
from django.db.models import F
from django.core.exceptions import ValidationError
from .models import LunchDay, ClassMealCount, SchoolClass
from .lunch import open_lunch_day, confirm_counts, reopen_counts, LunchVersionConflict, PLANNED, ACTUAL

def parse_date(date_str):
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise ValidationError("Ngày không hợp lệ (YYYY-MM-DD)")

@require_http_methods(["GET", "PUT"])
@inventory_permission_required
def lunch_day_counts(request, date_str):
    try:
        date = parse_date(date_str)
    except ValidationError as e:
        return JsonResponse({"error": str(e)}, status=400)

    if request.method == "GET":
        # Mở ngày nếu chưa có
        day = open_lunch_day(date)
        
        data = {
            "id": day.id,
            "date": str(day.date),
            "version": day.version,
            "staff_planned": day.staff_planned,
            "staff_actual": day.staff_actual,
            "planned_confirmed_at": day.planned_confirmed_at.isoformat() if day.planned_confirmed_at else None,
            "actual_confirmed_at": day.actual_confirmed_at.isoformat() if day.actual_confirmed_at else None,
            "lines": []
        }
        for count in day.class_counts.select_related("school_class").order_by("school_class__code"):
            data["lines"].append({
                "class_id": count.school_class.id,
                "class_code": count.school_class.code,
                "enrolled_snapshot": count.enrolled_snapshot,
                "planned": count.planned,
                "actual": count.actual,
            })
        return JsonResponse(data)

    elif request.method == "PUT":
        if request.user.groups.filter(name="viewer").exists():
            return JsonResponse({"error": "Permission denied"}, status=403)

        try:
            body = json.loads(request.body)
            expected_version = body.get("version")
            if expected_version is None:
                return JsonResponse({"error": "Thiếu version"}, status=400)
            
            with transaction.atomic():
                day = LunchDay.objects.select_for_update(of=("self",)).filter(date=date).first()
                if not day:
                    return JsonResponse({"error": "Ngày chưa được mở"}, status=400)
                if day.version != expected_version:
                    return JsonResponse({"error": "Dữ liệu đã thay đổi, vui lòng tải lại", "code": "version_conflict"}, status=409)

                # Update fields if provided and not confirmed
                if "staff_planned" in body:
                    if day.planned_confirmed_at:
                        return JsonResponse({"error": "Đã chốt dự kiến, không thể sửa staff_planned"}, status=400)
                    day.staff_planned = body["staff_planned"]
                if "staff_actual" in body:
                    if day.actual_confirmed_at:
                        return JsonResponse({"error": "Đã chốt thực tế, không thể sửa staff_actual"}, status=400)
                    day.staff_actual = body["staff_actual"]
                
                day.version = F("version") + 1
                day.save(update_fields=["staff_planned", "staff_actual", "version"])

                lines = body.get("lines", [])
                for line in lines:
                    class_id = line.get("class_id")
                    count = ClassMealCount.objects.filter(lunch_day=day, school_class_id=class_id).first()
                    if count:
                        if "planned" in line and not day.planned_confirmed_at:
                            count.planned = line["planned"]
                        if "actual" in line and not day.actual_confirmed_at:
                            count.actual = line["actual"]
                        count.save(update_fields=["planned", "actual"])
                        
            return JsonResponse({"status": "ok"})
        except json.JSONDecodeError:
            return JsonResponse({"error": "JSON không hợp lệ"}, status=400)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)


@require_http_methods(["POST"])
@inventory_permission_required
def lunch_day_lock(request, date_str):
    if request.user.groups.filter(name="viewer").exists():
        return JsonResponse({"error": "Permission denied"}, status=403)
        
    try:
        date = parse_date(date_str)
        body = json.loads(request.body)
        kind = body.get("kind")
        version = body.get("version")
        
        if kind not in (PLANNED, ACTUAL):
            return JsonResponse({"error": "kind phải là 'planned' hoặc 'actual'"}, status=400)
        if version is None:
            return JsonResponse({"error": "Thiếu version"}, status=400)
            
        day = LunchDay.objects.filter(date=date).first()
        if not day:
            return JsonResponse({"error": "Ngày chưa được mở"}, status=400)
            
        confirm_counts(day.id, kind, request.user, version)
        return JsonResponse({"status": "ok"})
    except LunchVersionConflict as e:
        return JsonResponse({"error": str(e), "code": "version_conflict"}, status=409)
    except ValidationError as e:
        return JsonResponse({"error": e.message if hasattr(e, 'message') else list(e)}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


@require_http_methods(["POST"])
@inventory_permission_required
def lunch_day_reopen(request, date_str):
    if request.user.groups.filter(name="viewer").exists():
        return JsonResponse({"error": "Permission denied"}, status=403)
        
    try:
        date = parse_date(date_str)
        body = json.loads(request.body)
        kind = body.get("kind")
        reason = body.get("reason", "")
        version = body.get("version")
        
        if not reason.strip():
            return JsonResponse({"error": "Mở lại bắt buộc phải có lý do"}, status=400)
        if kind not in (PLANNED, ACTUAL):
            return JsonResponse({"error": "kind phải là 'planned' hoặc 'actual'"}, status=400)
        if version is None:
            return JsonResponse({"error": "Thiếu version"}, status=400)
            
        day = LunchDay.objects.filter(date=date).first()
        if not day:
            return JsonResponse({"error": "Ngày chưa được mở"}, status=400)
            
        reopen_counts(day.id, kind, request.user, reason, version)
        return JsonResponse({"status": "ok"})
    except LunchVersionConflict as e:
        return JsonResponse({"error": str(e), "code": "version_conflict"}, status=409)
    except ValidationError as e:
        return JsonResponse({"error": e.message if hasattr(e, 'message') else list(e)}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)
