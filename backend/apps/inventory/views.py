import json

from django.db import connection, IntegrityError
from django.http import JsonResponse
from .models import Category, FoodItem, Supplier


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


def categories(request):
    # =========================
    # GET /api/categories/
    # =========================
    if request.method == "GET":
        list_category = Category.objects.all()

        results = []

        for cat in list_category:
            results.append({
                "id": cat.id,
                "code": cat.code,
                "name": cat.name,
                "is_active": cat.is_active
            })

        return JsonResponse({
            "results": results
        })

    # =========================
    # POST /api/categories/
    # =========================
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse(
                {"error": "Invalid JSON"},
                status=400
            )

        code = data.get("code")
        name = data.get("name")

        # Kiểm tra thiếu dữ liệu
        if not code or not name:
            return JsonResponse(
                {
                    "error": "code and name are required"
                },
                status=400
            )

        try:
            category = Category.objects.create(
                code=code,
                name=name,
                is_active=data.get("is_active", True)
            )
        except IntegrityError:
            return JsonResponse(
                {
                    "error": "code already exists"
                },
                status=400
            )

        return JsonResponse(
            {
                "id": category.id,
                "code": category.code,
                "name": category.name,
                "is_active": category.is_active
            },
            status=201
        )

    # =========================
    # Method không được phép
    # =========================
    return JsonResponse(
        {"error": "Method not allowed"},
        status=405
    )


def category_detail(request, category_id):
    # Tìm Category
    try:
        category = Category.objects.get(id=category_id)
    except Category.DoesNotExist:
        return JsonResponse(
            {"error": "Category not found"},
            status=404
        )

    # =========================
    # PATCH /api/categories/<id>/
    # =========================
    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse(
                {"error": "Invalid JSON"},
                status=400
            )

        # Không cho sửa quantity vì Category không có quantity
        allowed_fields = {
            "code",
            "name",
            "is_active"
        }

        # Kiểm tra field lạ
        invalid_fields = set(data.keys()) - allowed_fields

        if invalid_fields:
            return JsonResponse(
                {
                    "error": "Invalid fields",
                    "fields": list(invalid_fields)
                },
                status=400
            )

        # Không cho vô hiệu hóa Category
        # nếu FoodItem vẫn đang tham chiếu tới nó
        if data.get("is_active") is False:
            if category.food_items.exists():
                return JsonResponse(
                    {
                        "error": (
                            "Cannot deactivate category "
                            "because it is referenced by FoodItem"
                        )
                    },
                    status=400
                )

        if "code" in data:
            category.code = data["code"]

        if "name" in data:
            category.name = data["name"]

        if "is_active" in data:
            category.is_active = data["is_active"]

        try:
            category.save()
        except IntegrityError:
            return JsonResponse(
                {
                    "error": "code already exists"
                },
                status=400
            )

        return JsonResponse({
            "id": category.id,
            "code": category.code,
            "name": category.name,
            "is_active": category.is_active
        })

    # =========================
    # DELETE bị cấm
    # =========================
    if request.method == "DELETE":
        return JsonResponse(
            {
                "error": "DELETE is not allowed"
            },
            status=405
        )

    return JsonResponse(
        {"error": "Method not allowed"},
        status=405
    )
def foods(request):
    # GET /api/foods/
    if request.method == "GET":
        food_items = FoodItem.objects.all()

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

        return JsonResponse({
            "results": results
        })

    # POST /api/foods/
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse(
                {"error": "Invalid JSON"},
                status=400
            )

        # Kiểm tra dữ liệu bắt buộc
        required_fields = [
            "code",
            "name",
            "category_id",
            "unit"
        ]

        missing_fields = [
            field for field in required_fields
            if field not in data
        ]
        if "code" in data and not isinstance(data["code"], str):
            return JsonResponse(
                {"error": "code must be a string"},
                    status=400
    )

        if "name" in data and not isinstance(data["name"], str):
            return JsonResponse(
                {"error": "name must be a string"},
                    status=400
    )

        if "unit" in data and not isinstance(data["unit"], str):
            return JsonResponse(
                {"error": "unit must be a string"},
                    status=400
    )
        if not isinstance(data["category_id"], int):
            return JsonResponse(
                {"error": "category_id must be an integer"},
                    status=400
    )

        if missing_fields:
            return JsonResponse(
                {
                    "error": "Missing required fields",
                    "fields": missing_fields
                },
                status=400
            )

        # Kiểm tra Category
        try:
            category = Category.objects.get(
                id=data["category_id"]
            )
        except Category.DoesNotExist:
            return JsonResponse(
                {"error": "Category not found"},
                status=400
            )

        # Không cho client tự nhập quantity
        if "quantity" in data or "avg_cost" in data:
            return JsonResponse(
                {
                    "error": "quantity and avg_cost cannot be set by client"
                },
                status=400
            )

        # Tạo FoodItem
        try:
            food = FoodItem.objects.create(
                code=data["code"],
                name=data["name"],
                category=category,
                unit=data["unit"],
                is_active=data.get("is_active", True)
            )
        except IntegrityError:
            return JsonResponse(
                {"error": "code already exists"},
                status=400
            )

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
            status=201
        )

    # DELETE không được phép
    if request.method == "DELETE":
        return JsonResponse(
            {"error": "DELETE is not allowed"},
            status=405
        )

    return JsonResponse(
        {"error": "Method not allowed"},
        status=405
    )
def food_detail(request, food_id):
    try:
        food = FoodItem.objects.get(id=food_id)
    except FoodItem.DoesNotExist:
        return JsonResponse(
            {"error": "FoodItem not found"},
            status=404
        )

    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse(
                {"error": "Invalid JSON"},
                status=400
            )

        # Những field Frontend được phép sửa
        allowed_fields = {
            "code",
            "name",
            "category_id",
            "unit",
            "is_active"
        }

        # Tìm field không được phép
        invalid_fields = set(data.keys()) - allowed_fields

        if invalid_fields:
            return JsonResponse(
                {
                    "error": "Invalid fields",
                    "fields": list(invalid_fields)
                },
                status=400
            )

        # Nếu sửa category
        if "category_id" in data:
            try:
                category = Category.objects.get(
                    id=data["category_id"]
                )
            except Category.DoesNotExist:
                return JsonResponse(
                    {"error": "Category not found"},
                    status=400
                )

            food.category = category

        if "code" in data:
            food.code = data["code"]

        if "name" in data:
            food.name = data["name"]

        if "unit" in data:
            food.unit = data["unit"]

        if "is_active" in data:
            food.is_active = data["is_active"]

        try:
            food.save()
        except IntegrityError:
            return JsonResponse(
                {"error": "code already exists"},
                status=400
            )

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

    # Cấm DELETE
    if request.method == "DELETE":
        return JsonResponse(
            {"error": "DELETE is not allowed"},
            status=405
        )

    return JsonResponse(
        {"error": "Method not allowed"},
        status=405
    )
def suppliers(request):
    # =========================
    # GET /api/suppliers/
    # =========================
    if request.method == "GET":
        supplier_list = Supplier.objects.all()

        results = []

        for supplier in supplier_list:
            results.append({
                "id": supplier.id,
                "code": supplier.code,
                "name": supplier.name,
                "is_active": supplier.is_active,
            })

        return JsonResponse({
            "results": results
        })

    # =========================
    # POST /api/suppliers/
    # =========================
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse(
                {"error": "Invalid JSON"},
                status=400
            )
        if "quantity" in data or "avg_cost" in data or "stock_version" in data:
            return JsonResponse(
                {"error": "Stock fields cannot be modified directly"},
                status=400
            )
        allowed_fields = {
            "code",
            "name",
            "category_id",
            "unit",
            "is_active"
        }

        invalid_fields = set(data.keys()) - allowed_fields

        if invalid_fields:
                return JsonResponse(
                {"error": "Invalid fields","fields": list(invalid_fields)},
        status=400
    )
        # Kiểm tra dữ liệu bắt buộc
        if not data.get("code") or not data.get("name"):
            return JsonResponse(
                {
                    "error": "code and name are required"
                },
                status=400
            )

        try:
            supplier = Supplier.objects.create(
                code=data["code"],
                name=data["name"],
                is_active=data.get("is_active", True)
            )
        except IntegrityError:
            return JsonResponse(
                {"error": "code already exists"},
                status=400
            )

        return JsonResponse(
            {
                "id": supplier.id,
                "code": supplier.code,
                "name": supplier.name,
                "is_active": supplier.is_active,
            },
            status=201
        )

    # =========================
    # DELETE bị cấm
    # =========================
    if request.method == "DELETE":
        return JsonResponse(
            {"error": "DELETE is not allowed"},
            status=405
        )

    return JsonResponse(
        {"error": "Method not allowed"},
        status=405
    )
def supplier_detail(request, supplier_id):
    try:
        supplier = Supplier.objects.get(id=supplier_id)
    except Supplier.DoesNotExist:
        return JsonResponse(
            {"error": "Supplier not found"},
            status=404
        )

    # =========================
    # PATCH
    # =========================
    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse(
                {"error": "Invalid JSON"},
                status=400
            )

        allowed_fields = {
            "code",
            "name",
            "is_active"
        }

        invalid_fields = set(data.keys()) - allowed_fields

        if invalid_fields:
            return JsonResponse(
                {
                    "error": "Invalid fields",
                    "fields": list(invalid_fields)
                },
                status=400
            )

        if "code" in data:
            supplier.code = data["code"]

        if "name" in data:
            supplier.name = data["name"]

        if "is_active" in data:
            supplier.is_active = data["is_active"]

        try:
            supplier.save()
        except IntegrityError:
            return JsonResponse(
                {"error": "code already exists"},
                status=400
            )

        return JsonResponse({
            "id": supplier.id,
            "code": supplier.code,
            "name": supplier.name,
            "is_active": supplier.is_active,
        })

    # =========================
    # DELETE bị cấm
    # =========================
    if request.method == "DELETE":
        return JsonResponse(
            {"error": "DELETE is not allowed"},
            status=405
        )

    return JsonResponse(
        {"error": "Method not allowed"},
        status=405
    )