from django.core.exceptions import ValidationError, PermissionDenied
from .models import StockTake, StockTakeItem, Receipt, ReceiptLine, Issue, IssueLine
from .services import (
    create_stocktake, update_stocktake_item, post_stocktake,
    create_receipt_draft, post_receipt, post_issue
)
import json
from decimal import Decimal, InvalidOperation

from django.db import connection, IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from .models import Category, FoodItem, Supplier, InventoryLedger
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

        # 2. An toàn rồi mới lưu xuống DB
        #category = Category.objects.create(
           # code=code,
           # name=name,
           # is_active=data.get("is_active", True)
       # )
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


@inventory_permission_required
def stocktakes(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)
            
        food_ids = data.get("food_ids", [])
        if not isinstance(food_ids, list) or not food_ids:
            return JsonResponse({"error": "food_ids list is required"}, status=400)
            
        try:
            st = create_stocktake(food_ids)
            return JsonResponse({"id": st.id, "status": st.status}, status=201)
        except ValidationError as e:
            return JsonResponse({"error": str(e)}, status=400)

    return JsonResponse({"error": "Method not allowed"}, status=405)

@inventory_permission_required
def stocktake_items(request, item_id):
    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)
            
        counted_qty = data.get("counted_qty")
        if counted_qty is None:
            return JsonResponse({"error": "counted_qty is required"}, status=400)
            
        try:
            item = update_stocktake_item(item_id, counted_qty)
            return JsonResponse({
                "id": item.id,
                "counted_qty": float(item.counted_qty),
                "variance": float(item.variance)
            }, status=200)
        except ValidationError as e:
            return JsonResponse({"error": str(e)}, status=400)
        except StockTakeItem.DoesNotExist:
            return JsonResponse({"error": "Item not found"}, status=404)

    return JsonResponse({"error": "Method not allowed"}, status=405)

@inventory_permission_required
def stocktake_post(request, stocktake_id):
    if request.method == "POST":
        try:
            st = post_stocktake(stocktake_id)
            return JsonResponse({"id": st.id, "status": st.status}, status=200)
        except ValueError as e:
            return JsonResponse({"error": str(e)}, status=409)
        except ValidationError as e:
            return JsonResponse({"error": str(e)}, status=400)
        except StockTake.DoesNotExist:
            return JsonResponse({"error": "StockTake not found"}, status=404)

    return JsonResponse({"error": "Method not allowed"}, status=405)


from django.db.models import Count
from decimal import Decimal
from django.utils.dateparse import parse_date
from django.utils.timezone import make_aware
import datetime

@inventory_permission_required
def reports_stock(request):
    if request.method == "GET":
        foods = FoodItem.objects.select_related('category').annotate(
            transaction_count=Count('ledger_entries')
        ).order_by('id')
        
        results = []
        for f in foods:
            stock_value = round(f.quantity * f.avg_cost, 2)
            results.append({
                "id": f.id,
                "code": f.code,
                "name": f.name,
                "category_name": f.category.name if f.category else "",
                "unit": f.unit,
                "quantity": str(f.quantity),
                "avg_cost": str(f.avg_cost),
                "stock_value": str(stock_value),
                "transaction_count": f.transaction_count
            })
        return JsonResponse({"results": results})
    return JsonResponse({"error": "Method not allowed"}, status=405)

@inventory_permission_required
def reports_transactions(request):
    if request.method == "GET":
        ledgers = InventoryLedger.objects.all()
        
        food_id = request.GET.get('food')
        if food_id:
            ledgers = ledgers.filter(food_id=food_id)
            
        date_from = request.GET.get('from')
        if date_from:
            parsed_from = parse_date(date_from)
            if parsed_from:
                ledgers = ledgers.filter(created_at__gte=make_aware(datetime.datetime.combine(parsed_from, datetime.time.min)))
                
        date_to = request.GET.get('to')
        if date_to:
            parsed_to = parse_date(date_to)
            if parsed_to:
                ledgers = ledgers.filter(created_at__lte=make_aware(datetime.datetime.combine(parsed_to, datetime.time.max)))
                
        ledgers = ledgers.order_by('id')
        
        results = []
        for l in ledgers:
            results.append({
                "id": l.id,
                "food_id": l.food_id,
                "transaction_type": l.transaction_type,
                "quantity_change": str(l.quantity_change),
                "cost": str(l.cost),
                "reference": l.reference,
                "created_at": l.created_at.isoformat()
            })
        return JsonResponse({"results": results})
    return JsonResponse({"error": "Method not allowed"}, status=405)


# =========================================================================
# SF22: API TẠO NHÁP, XEM VÀ CHỐT NHẬP KHO
# =========================================================================
@inventory_permission_required
def receipts(request):
    # GET /api/receipts/
    if request.method == "GET":
        receipt_list = Receipt.objects.select_related("supplier", "created_by").prefetch_related("lines__food").order_by("-id")
        results = []
        for r in receipt_list:
            total_value = sum((line.quantity * line.unit_price for line in r.lines.all()), Decimal("0.00"))
            results.append({
                "id": r.id,
                "supplier_id": r.supplier_id,
                "supplier_name": r.supplier.name if r.supplier else "",
                "date": str(r.date),
                "note": r.note,
                "status": r.status.upper(),
                "posted_at": r.posted_at.isoformat() if r.posted_at else None,
                "total_value": str(round(total_value, 2)),
                "lines": [
                    {
                        "id": line.id,
                        "food_id": line.food_id,
                        "food_name": line.food.name if line.food else "",
                        "quantity": str(line.quantity),
                        "unit_price": str(line.unit_price),
                        "line_total": str(round(line.quantity * line.unit_price, 2)),
                    }
                    for line in r.lines.all()
                ],
            })
        return JsonResponse({"results": results})

    # POST /api/receipts/
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        if not isinstance(data, dict):
            return JsonResponse({"error": "Request body must be a JSON object"}, status=400)

        supplier_id = data.get("supplier_id")
        if supplier_id is None and "supplier" in data:
            supplier_id = data["supplier"]

        if isinstance(supplier_id, bool) or not isinstance(supplier_id, int) or supplier_id <= 0:
            return JsonResponse({"error": "supplier_id must be a positive integer"}, status=400)

        date_val = data.get("date")
        if not date_val or not isinstance(date_val, str):
            return JsonResponse({"error": "date is required and must be YYYY-MM-DD"}, status=400)

        note = data.get("note", "")
        if not isinstance(note, str):
            return JsonResponse({"error": "note must be a string"}, status=400)

        raw_lines = data.get("lines")
        if not isinstance(raw_lines, list) or not raw_lines:
            return JsonResponse({"error": "lines must be a non-empty list"}, status=400)

        norm_lines = []
        for line in raw_lines:
            if not isinstance(line, dict):
                return JsonResponse({"error": "Each line must be an object"}, status=400)
            food_id = line.get("food_id") if "food_id" in line else line.get("food")
            if isinstance(food_id, bool) or not isinstance(food_id, int) or food_id <= 0:
                return JsonResponse({"error": "food_id must be a positive integer"}, status=400)
            qty = line.get("quantity")
            price = line.get("unit_price")
            if qty is None or price is None:
                return JsonResponse({"error": "quantity and unit_price are required"}, status=400)
            norm_lines.append({
                "food_id": food_id,
                "quantity": str(qty),
                "unit_price": str(price),
            })

        try:
            receipt = create_receipt_draft(
                supplier_id=supplier_id,
                date=date_val,
                lines=norm_lines,
                user=request.user,
                note=note,
            )
        except ValidationError as e:
            msg = e.message_dict if hasattr(e, "message_dict") else (e.messages if hasattr(e, "messages") else str(e))
            return JsonResponse({"error": msg}, status=400)
        except PermissionDenied as e:
            return JsonResponse({"error": str(e)}, status=403)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)

        total_val = sum((l.quantity * l.unit_price for l in receipt.lines.all()), Decimal("0.00"))
        return JsonResponse({
            "id": receipt.id,
            "supplier_id": receipt.supplier_id,
            "date": str(receipt.date),
            "note": receipt.note,
            "status": receipt.status.upper(),
            "total_value": str(round(total_val, 2)),
            "lines": [
                {
                    "id": l.id,
                    "food_id": l.food_id,
                    "quantity": str(l.quantity),
                    "unit_price": str(l.unit_price),
                }
                for l in receipt.lines.all()
            ],
        }, status=201)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@inventory_permission_required
def receipt_detail(request, receipt_id):
    try:
        r = Receipt.objects.select_related("supplier", "created_by").prefetch_related("lines__food").get(id=receipt_id)
    except Receipt.DoesNotExist:
        return JsonResponse({"error": "Receipt not found"}, status=404)

    if request.method == "GET":
        total_value = sum((line.quantity * line.unit_price for line in r.lines.all()), Decimal("0.00"))
        return JsonResponse({
            "id": r.id,
            "supplier_id": r.supplier_id,
            "supplier_name": r.supplier.name if r.supplier else "",
            "date": str(r.date),
            "note": r.note,
            "status": r.status.upper(),
            "posted_at": r.posted_at.isoformat() if r.posted_at else None,
            "total_value": str(round(total_value, 2)),
            "lines": [
                {
                    "id": line.id,
                    "food_id": line.food_id,
                    "food_name": line.food.name if line.food else "",
                    "quantity": str(line.quantity),
                    "unit_price": str(line.unit_price),
                    "line_total": str(round(line.quantity * line.unit_price, 2)),
                }
                for line in r.lines.all()
            ],
        })

    return JsonResponse({"error": "Method not allowed"}, status=405)


@inventory_permission_required
def receipt_post(request, receipt_id):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        receipt = Receipt.objects.get(id=receipt_id)
    except Receipt.DoesNotExist:
        return JsonResponse({"error": "Receipt not found"}, status=404)

    if receipt.status != Receipt.Status.DRAFT:
        return JsonResponse({"error": "Phiếu nhập đã được chốt trước đó hoặc không ở trạng thái nháp."}, status=409)

    try:
        posted = post_receipt(receipt_id)
        return JsonResponse({
            "id": posted.id,
            "status": posted.status.upper(),
            "posted_at": posted.posted_at.isoformat() if posted.posted_at else None,
            "message": "Chốt phiếu nhập thành công."
        }, status=200)
    except ValidationError as e:
        msg = str(e.message_dict if hasattr(e, "message_dict") else (e.messages if hasattr(e, "messages") else str(e)))
        if "chốt" in msg or "xử lý" in msg or "draft" in msg.lower():
            return JsonResponse({"error": msg}, status=409)
        return JsonResponse({"error": msg}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


# =========================================================================
# SF28: API PHIẾU XUẤT KHO
# =========================================================================
@inventory_permission_required
def issues(request):
    # GET /api/issues/
    if request.method == "GET":
        issue_list = Issue.objects.select_related("created_by").prefetch_related("lines__food").order_by("-id")
        results = []
        for iss in issue_list:
            total_value = sum((line.quantity * line.unit_cost for line in iss.lines.all()), Decimal("0.00"))
            results.append({
                "id": iss.id,
                "code": iss.code,
                "date": str(iss.date),
                "note": iss.note,
                "status": iss.status.upper(),
                "posted_at": iss.posted_at.isoformat() if iss.posted_at else None,
                "total_value": str(round(total_value, 2)),
                "lines": [
                    {
                        "id": line.id,
                        "food_id": line.food_id,
                        "food_name": line.food.name if line.food else "",
                        "quantity": str(line.quantity),
                        "unit_cost": str(line.unit_cost),
                        "line_total": str(round(line.quantity * line.unit_cost, 2)),
                    }
                    for line in iss.lines.all()
                ],
            })
        return JsonResponse({"results": results})

    # POST /api/issues/
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        if not isinstance(data, dict):
            return JsonResponse({"error": "Request body must be a JSON object"}, status=400)

        date_val = data.get("date")
        if not date_val or not isinstance(date_val, str):
            return JsonResponse({"error": "date is required and must be YYYY-MM-DD"}, status=400)

        code = data.get("code")
        if code and isinstance(code, str):
            code = code.strip().upper()
            if Issue.objects.filter(code=code).exists():
                return JsonResponse({"error": f"Mã phiếu xuất '{code}' đã tồn tại."}, status=409)
        else:
            code = f"XK{timezone.now().strftime('%Y%m%d%H%M%S%f')[:17]}"

        note = data.get("note", "")
        if not isinstance(note, str):
            return JsonResponse({"error": "note must be a string"}, status=400)

        raw_lines = data.get("lines")
        if not isinstance(raw_lines, list) or not raw_lines:
            return JsonResponse({"error": "lines must be a non-empty list"}, status=400)

        validated_lines = []
        seen_foods = set()
        for idx, line in enumerate(raw_lines, start=1):
            if not isinstance(line, dict):
                return JsonResponse({"error": f"Dòng {idx} phải là một object"}, status=400)
            food_id = line.get("food_id") if "food_id" in line else line.get("food")
            if isinstance(food_id, bool) or not isinstance(food_id, int) or food_id <= 0:
                return JsonResponse({"error": f"food_id tại dòng {idx} không hợp lệ"}, status=400)

            try:
                food = FoodItem.objects.get(id=food_id)
            except FoodItem.DoesNotExist:
                return JsonResponse({"error": f"Thực phẩm ID {food_id} không tồn tại."}, status=400)

            if food_id in seen_foods:
                return JsonResponse({"error": f"Thực phẩm '{food.name}' bị trùng lặp trong phiếu."}, status=400)
            seen_foods.add(food_id)

            qty_raw = line.get("quantity")
            if qty_raw is None or isinstance(qty_raw, bool):
                return JsonResponse({"error": f"Số lượng tại dòng {idx} là bắt buộc."}, status=400)
            try:
                qty_dec = Decimal(str(qty_raw))
                if not qty_dec.is_finite() or qty_dec <= Decimal("0"):
                    return JsonResponse({"error": f"Số lượng xuất tại dòng {idx} phải lớn hơn 0."}, status=400)
            except (InvalidOperation, TypeError):
                return JsonResponse({"error": f"Số lượng tại dòng {idx} không hợp lệ."}, status=400)

            validated_lines.append({
                "food": food,
                "quantity": qty_dec,
            })

        with transaction.atomic():
            issue = Issue.objects.create(
                code=code,
                date=date_val,
                note=note.strip(),
                created_by=request.user,
                status=Issue.Status.DRAFT,
            )
            created_lines = []
            for item in validated_lines:
                line_obj = IssueLine.objects.create(
                    issue=issue,
                    food=item["food"],
                    quantity=item["quantity"],
                    unit_cost=Decimal("0.00"),
                )
                created_lines.append(line_obj)

        return JsonResponse({
            "id": issue.id,
            "code": issue.code,
            "date": str(issue.date),
            "note": issue.note,
            "status": issue.status.upper(),
            "total_value": "0.00",
            "lines": [
                {
                    "id": l.id,
                    "food_id": l.food_id,
                    "food_name": l.food.name,
                    "quantity": str(l.quantity),
                    "unit_cost": str(l.unit_cost),
                }
                for l in created_lines
            ]
        }, status=201)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@inventory_permission_required
def issue_detail(request, issue_id):
    try:
        iss = Issue.objects.select_related("created_by").prefetch_related("lines__food").get(id=issue_id)
    except Issue.DoesNotExist:
        return JsonResponse({"error": "Issue not found"}, status=404)

    if request.method == "GET":
        total_value = sum((line.quantity * line.unit_cost for line in iss.lines.all()), Decimal("0.00"))
        return JsonResponse({
            "id": iss.id,
            "code": iss.code,
            "date": str(iss.date),
            "note": iss.note,
            "status": iss.status.upper(),
            "posted_at": iss.posted_at.isoformat() if iss.posted_at else None,
            "total_value": str(round(total_value, 2)),
            "lines": [
                {
                    "id": line.id,
                    "food_id": line.food_id,
                    "food_name": line.food.name if line.food else "",
                    "quantity": str(line.quantity),
                    "unit_cost": str(line.unit_cost),
                    "line_total": str(round(line.quantity * line.unit_cost, 2)),
                }
                for line in iss.lines.all()
            ],
        })

    return JsonResponse({"error": "Method not allowed"}, status=405)


@inventory_permission_required
def issue_post(request, issue_id):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        issue = Issue.objects.get(id=issue_id)
    except Issue.DoesNotExist:
        return JsonResponse({"error": "Phiếu xuất không tồn tại."}, status=404)

    if issue.status != Issue.Status.DRAFT:
        return JsonResponse({"error": "Phiếu xuất đã được chốt trước đó hoặc không ở trạng thái nháp."}, status=409)

    try:
        posted = post_issue(issue_id)
        total_val = sum((l.quantity * l.unit_cost for l in posted.lines.all()), Decimal("0.00"))
        return JsonResponse({
            "id": posted.id,
            "code": posted.code,
            "status": posted.status.upper(),
            "posted_at": posted.posted_at.isoformat() if posted.posted_at else None,
            "total_value": str(round(total_val, 2)),
            "message": "Chốt phiếu xuất thành công."
        }, status=200)
    except ValidationError as e:
        msg = str(e.message_dict if hasattr(e, "message_dict") else (e.messages if hasattr(e, "messages") else str(e)))
        if "Không đủ tồn kho" in msg or "chốt" in msg or "xử lý" in msg:
            return JsonResponse({"error": msg, "message": msg}, status=409)
        return JsonResponse({"error": msg}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)
