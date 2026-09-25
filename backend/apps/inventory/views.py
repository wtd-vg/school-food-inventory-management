import json

from django.db import connection, IntegrityError
from django.http import JsonResponse
from .models import Category, FoodItem, Supplier
from .auth_views import inventory_permission_required


def hello(request):
    """Kiểm tra Django và PostgreSQL."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        database_result = cursor.fetchone()[0]

    return JsonResponse(
        {
            "message": "React đã gọi được Django.",
            "database": (
                "PostgreSQL đã kết nối."
                if database_result == 1
                else "Có lỗi."
            ),
        }
    )


@inventory_permission_required
def categories(request):
    # GET /api/categories/
    if request.method == "GET":
        list_category = Category.objects.all().order_by("id")

        results = []
        for cat in list_category:
            results.append({
                "id": cat.id,
                "code": cat.code,
                "name": cat.name,
                "is_active": cat.is_active,
            })

        return JsonResponse({"results": results})

    # POST /api/categories/
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        raw_code = data.get("code")
        raw_name = data.get("name")

        if not isinstance(raw_code, str) or not isinstance(raw_name, str):
            return JsonResponse({"error": "code and name must be strings"}, status=400)

        code = raw_code.strip().upper()
        name = raw_name.strip()

        if not code or not name:
            return JsonResponse(
                {"error": "code and name are required and cannot be empty"},
                status=400,
            )

        try:
            category = Category.objects.create(
                code=code,
                name=name,
                is_active=data.get("is_active", True),
            )
        except IntegrityError:
            return JsonResponse({"error": "code already exists"}, status=400)

        return JsonResponse(
            {
                "id": category.id,
                "code": category.code,
                "name": category.name,
                "is_active": category.is_active,
            },
            status=201,
        )

    return JsonResponse({"error": "Method not allowed"}, status=405)


@inventory_permission_required
def category_detail(request, category_id):
    try:
        category = Category.objects.get(id=category_id)
    except Category.DoesNotExist:
        return JsonResponse({"error": "Category not found"}, status=404)

    # PATCH /api/categories/<id>/
    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        allowed_fields = {"code", "name", "is_active"}
        invalid_fields = set(data.keys()) - allowed_fields

        if invalid_fields:
            return JsonResponse(
                {"error": "Invalid fields", "fields": list(invalid_fields)},
                status=400,
            )

        # Không cho vô hiệu hóa Category nếu còn FoodItem tham chiếu tới
        if data.get("is_active") is False:
            if category.food_items.exists():
                return JsonResponse(
                    {
                        "error": (
                            "Cannot deactivate category "
                            "because it is referenced by FoodItem"
                        )
                    },
                    status=400,
                )

        if "code" in data:
            if not isinstance(data["code"], str) or not data["code"].strip():
                return JsonResponse({"error": "code cannot be empty"}, status=400)
            category.code = data["code"].strip().upper()

        if "name" in data:
            if not isinstance(data["name"], str) or not data["name"].strip():
                return JsonResponse({"error": "name cannot be empty"}, status=400)
            category.name = data["name"].strip()

        if "is_active" in data:
            category.is_active = bool(data["is_active"])

        try:
            category.save()
        except IntegrityError:
            return JsonResponse({"error": "code already exists"}, status=400)

        return JsonResponse({
            "id": category.id,
            "code": category.code,
            "name": category.name,
            "is_active": category.is_active,
        })

    if request.method == "DELETE":
        return JsonResponse({"error": "DELETE is not allowed"}, status=405)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@inventory_permission_required
def foods(request):
    # GET /api/foods/
    if request.method == "GET":
        food_items = FoodItem.objects.all().order_by("id")

        results = []
        for food in food_items:
            results.append({
                "id": food.id,
                "code": food.code,
                "name": food.name,
                "category_id": food.category_id,
                "unit": food.unit,
                "is_active": food.is_active,
                "quantity": str(food.quantity),
                "avg_cost": str(food.avg_cost),
                "stock_version": food.stock_version,
            })

        return JsonResponse({"results": results})

    # POST /api/foods/
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        # 1. Chặn client can thiệp trực tiếp các trường kho
        if "quantity" in data or "avg_cost" in data or "stock_version" in data:
            return JsonResponse(
                {"error": "quantity, avg_cost and stock_version cannot be set by client"},
                status=400,
            )

        # Tương thích linh hoạt: chấp nhận cả category_id hoặc category
        if "category_id" not in data and "category" in data:
            data["category_id"] = data["category"]

        # 2. Kiểm tra trường bắt buộc trước để tránh KeyError
        required_fields = ["code", "name", "category_id", "unit"]
        missing_fields = [f for f in required_fields if f not in data]

        if missing_fields:
            return JsonResponse(
                {"error": "Missing required fields", "fields": missing_fields},
                status=400,
            )

        # 3. Kiểm tra kiểu dữ liệu an toàn
        if not isinstance(data["code"], str):
            return JsonResponse({"error": "code must be a string"}, status=400)
        if not isinstance(data["name"], str):
            return JsonResponse({"error": "name must be a string"}, status=400)
        if not isinstance(data["unit"], str):
            return JsonResponse({"error": "unit must be a string"}, status=400)
        if not isinstance(data["category_id"], int):
            return JsonResponse({"error": "category_id must be an integer"}, status=400)

        # 4. Chuẩn hóa chuỗi và kiểm tra không rỗng sau khi strip
        code = data["code"].strip().upper()
        name = data["name"].strip()
        unit = data["unit"].strip().lower()

        if not code or not name or not unit:
            return JsonResponse(
                {"error": "code, name and unit cannot be empty"},
                status=400,
            )

        try:
            category = Category.objects.get(id=data["category_id"])
        except Category.DoesNotExist:
            return JsonResponse({"error": "Category not found"}, status=400)

        try:
            food = FoodItem.objects.create(
                code=code,
                name=name,
                category=category,
                unit=unit,
                is_active=data.get("is_active", True),
            )
        except IntegrityError:
            return JsonResponse({"error": "code already exists"}, status=400)

        return JsonResponse(
            {
                "id": food.id,
                "code": food.code,
                "name": food.name,
                "category_id": food.category_id,
                "unit": food.unit,
                "is_active": food.is_active,
                "quantity": str(food.quantity),
                "avg_cost": str(food.avg_cost),
                "stock_version": food.stock_version,
            },
            status=201,
        )

    if request.method == "DELETE":
        return JsonResponse({"error": "DELETE is not allowed"}, status=405)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@inventory_permission_required
def food_detail(request, food_id):
    try:
        food = FoodItem.objects.get(id=food_id)
    except FoodItem.DoesNotExist:
        return JsonResponse({"error": "FoodItem not found"}, status=404)

    # PATCH /api/foods/<id>/
    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        # Chặn client tự sửa các trường kho
        if "quantity" in data or "avg_cost" in data or "stock_version" in data:
            return JsonResponse(
                {"error": "Stock fields cannot be modified directly"},
                status=400,
            )

        if "category_id" not in data and "category" in data:
            data["category_id"] = data["category"]
            del data["category"]

        allowed_fields = {"code", "name", "category_id", "unit", "is_active"}
        invalid_fields = set(data.keys()) - allowed_fields

        if invalid_fields:
            return JsonResponse(
                {"error": "Invalid fields", "fields": list(invalid_fields)},
                status=400,
            )

        if "category_id" in data:
            if not isinstance(data["category_id"], int):
                return JsonResponse({"error": "category_id must be an integer"}, status=400)
            try:
                category = Category.objects.get(id=data["category_id"])
            except Category.DoesNotExist:
                return JsonResponse({"error": "Category not found"}, status=400)
            food.category = category

        if "code" in data:
            if not isinstance(data["code"], str) or not data["code"].strip():
                return JsonResponse({"error": "code cannot be empty"}, status=400)
            food.code = data["code"].strip().upper()

        if "name" in data:
            if not isinstance(data["name"], str) or not data["name"].strip():
                return JsonResponse({"error": "name cannot be empty"}, status=400)
            food.name = data["name"].strip()

        if "unit" in data:
            if not isinstance(data["unit"], str) or not data["unit"].strip():
                return JsonResponse({"error": "unit cannot be empty"}, status=400)
            food.unit = data["unit"].strip().lower()

        if "is_active" in data:
            food.is_active = bool(data["is_active"])

        try:
            food.save()
        except IntegrityError:
            return JsonResponse({"error": "code already exists"}, status=400)

        return JsonResponse({
            "id": food.id,
            "code": food.code,
            "name": food.name,
            "category_id": food.category_id,
            "unit": food.unit,
            "is_active": food.is_active,
            "quantity": str(food.quantity),
            "avg_cost": str(food.avg_cost),
            "stock_version": food.stock_version,
        })

    if request.method == "DELETE":
        return JsonResponse({"error": "DELETE is not allowed"}, status=405)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@inventory_permission_required
def suppliers(request):
    # GET /api/suppliers/
    if request.method == "GET":
        supplier_list = Supplier.objects.all().order_by("id")

        results = []
        for supplier in supplier_list:
            results.append({
                "id": supplier.id,
                "code": supplier.code,
                "name": supplier.name,
                "phone": supplier.phone,
                "is_active": supplier.is_active,
            })

        return JsonResponse({"results": results})

    # POST /api/suppliers/
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        if "quantity" in data or "avg_cost" in data or "stock_version" in data:
            return JsonResponse(
                {"error": "Stock fields cannot be modified directly"},
                status=400,
            )

        allowed_fields = {"code", "name", "phone", "is_active"}
        invalid_fields = set(data.keys()) - allowed_fields

        if invalid_fields:
            return JsonResponse(
                {"error": "Invalid fields", "fields": list(invalid_fields)},
                status=400,
            )

        raw_code = data.get("code")
        raw_name = data.get("name")
        phone = str(data.get("phone", "")).strip()

        if not isinstance(raw_code, str) or not isinstance(raw_name, str):
            return JsonResponse({"error": "code and name must be strings"}, status=400)

        code = raw_code.strip().upper()
        name = raw_name.strip()

        if not code or not name:
            return JsonResponse(
                {"error": "code and name are required and cannot be empty"},
                status=400,
            )

        try:
            supplier = Supplier.objects.create(
                code=code,
                name=name,
                phone=phone,
                is_active=data.get("is_active", True),
            )
        except IntegrityError:
            return JsonResponse({"error": "code already exists"}, status=400)

        return JsonResponse(
            {
                "id": supplier.id,
                "code": supplier.code,
                "name": supplier.name,
                "phone": supplier.phone,
                "is_active": supplier.is_active,
            },
            status=201,
        )

    if request.method == "DELETE":
        return JsonResponse({"error": "DELETE is not allowed"}, status=405)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@inventory_permission_required
def supplier_detail(request, supplier_id):
    try:
        supplier = Supplier.objects.get(id=supplier_id)
    except Supplier.DoesNotExist:
        return JsonResponse({"error": "Supplier not found"}, status=404)

    # PATCH /api/suppliers/<id>/
    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        allowed_fields = {"code", "name", "phone", "is_active"}
        invalid_fields = set(data.keys()) - allowed_fields

        if invalid_fields:
            return JsonResponse(
                {"error": "Invalid fields", "fields": list(invalid_fields)},
                status=400,
            )

        if "code" in data:
            if not isinstance(data["code"], str) or not data["code"].strip():
                return JsonResponse({"error": "code cannot be empty"}, status=400)
            supplier.code = data["code"].strip().upper()

        if "name" in data:
            if not isinstance(data["name"], str) or not data["name"].strip():
                return JsonResponse({"error": "name cannot be empty"}, status=400)
            supplier.name = data["name"].strip()

        if "phone" in data:
            supplier.phone = str(data["phone"]).strip()

        if "is_active" in data:
            supplier.is_active = bool(data["is_active"])

        try:
            supplier.save()
        except IntegrityError:
            return JsonResponse({"error": "code already exists"}, status=400)

        return JsonResponse({
            "id": supplier.id,
            "code": supplier.code,
            "name": supplier.name,
            "phone": supplier.phone,
            "is_active": supplier.is_active,
        })

    if request.method == "DELETE":
        return JsonResponse({"error": "DELETE is not allowed"}, status=405)

    return JsonResponse({"error": "Method not allowed"}, status=405)