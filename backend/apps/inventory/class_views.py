import json
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import SchoolClass
from .auth_views import inventory_permission_required

@require_http_methods(["GET", "POST"])
@inventory_permission_required
def class_list(request):
    if request.method == "GET":
        classes = SchoolClass.objects.all().order_by("id")
        results = [
            {"id": c.id, "code": c.code, "name": c.name, "is_active": c.is_active}
            for c in classes
        ]
        return JsonResponse({"results": results})
    
    elif request.method == "POST":
        # Viewer only has GET access (checked by decorator, but we enforce explicitly for POST)
        if request.user.groups.filter(name="viewer").exists():
            return JsonResponse({"message": "Permission denied"}, status=403)
            
        try:
            data = json.loads(request.body)
            code = str(data.get("code", "")).strip().upper()
            name = str(data.get("name", "")).strip()
            
            if not code or not name:
                return JsonResponse({"message": "Code and name are required"}, status=400)
                
            if SchoolClass.objects.filter(code=code).exists():
                return JsonResponse({"message": "Class code already exists"}, status=409)
                
            c = SchoolClass.objects.create(code=code, name=name)
            return JsonResponse({"id": c.id, "code": c.code, "name": c.name, "is_active": c.is_active}, status=201)
            
        except json.JSONDecodeError:
            return JsonResponse({"message": "Invalid JSON"}, status=400)

@require_http_methods(["PATCH"])
@inventory_permission_required
def class_detail(request, class_id):
    if request.user.groups.filter(name="viewer").exists():
        return JsonResponse({"message": "Permission denied"}, status=403)
        
    try:
        c = SchoolClass.objects.get(id=class_id)
        data = json.loads(request.body)
        
        if "name" in data:
            name = str(data["name"]).strip()
            if not name:
                return JsonResponse({"message": "Name cannot be empty"}, status=400)
            c.name = name
            
        if "is_active" in data:
            c.is_active = bool(data["is_active"])
            
        c.save()
        return JsonResponse({"id": c.id, "code": c.code, "name": c.name, "is_active": c.is_active})
        
    except SchoolClass.DoesNotExist:
        return JsonResponse({"message": "Class not found"}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({"message": "Invalid JSON"}, status=400)
