"""API lớp học (SF44, BE-12/ISSUE-002): mã, tên, khối, sĩ số hiện hành, trạng thái.

Đổi sĩ số chỉ ảnh hưởng ngày mở sau đó; ngày đã mở giữ enrolled_snapshot.
"""

from django.db import IntegrityError, transaction
from django.http import JsonResponse

from . import audit
from .auth_views import inventory_permission_required
from .http_input import Conflict, json_api, method_not_allowed, only_fields, opt_bool, read_object, req_int, req_str
from .models import MAX_CLASS_SIZE, SchoolClass

FIELDS = {"code", "name", "grade", "enrolled", "is_active"}


def _class(c):
    return {"id": c.id, "code": c.code, "name": c.name, "grade": c.grade, "enrolled": c.enrolled, "is_active": c.is_active}


def _grade(data):
    return req_int(data, "grade", minimum=1, maximum=12, required=False, nullable=True, label="Khối")


def _enrolled(data):
    return req_int(data, "enrolled", minimum=0, maximum=MAX_CLASS_SIZE, required=False, label="Sĩ số")


@inventory_permission_required
@json_api
def class_list(request):
    if request.method == "GET":
        return JsonResponse({"results": [_class(c) for c in SchoolClass.objects.order_by("code")]})
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, FIELDS)
    code = req_str(data, "code", 32, upper=True, label="Mã lớp")
    name = req_str(data, "name", 120, label="Tên lớp")
    grade = _grade(data)
    enrolled = _enrolled(data)
    is_active = opt_bool(data, "is_active")
    try:
        with transaction.atomic():
            c = SchoolClass.objects.create(
                code=code, name=name, grade=grade, enrolled=0 if enrolled is None else enrolled,
                is_active=True if is_active is None else is_active,
            )
            audit.record(request, "class_create", "class", c.id, f"Tạo lớp {c.code}", after=_class(c))
    except IntegrityError:
        raise Conflict(f"Mã lớp {code} đã tồn tại.", {"code": "Đã tồn tại."})
    return JsonResponse(_class(c), status=201)


@inventory_permission_required
@json_api
def class_detail(request, class_id):
    if request.method == "GET":
        return JsonResponse(_class(SchoolClass.objects.get(id=class_id)))
    if request.method != "PATCH":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, FIELDS)
    with transaction.atomic():
        c = SchoolClass.objects.select_for_update().get(id=class_id)
        before = _class(c)
        if "code" in data:
            c.code = req_str(data, "code", 32, upper=True, label="Mã lớp")
        if "name" in data:
            c.name = req_str(data, "name", 120, label="Tên lớp")
        if "grade" in data:
            c.grade = _grade(data)
        if "enrolled" in data:
            c.enrolled = _enrolled(data)
        is_active = opt_bool(data, "is_active")
        if is_active is not None:
            c.is_active = is_active
        try:
            with transaction.atomic():
                c.save()
        except IntegrityError:
            raise Conflict(f"Mã lớp {c.code} đã tồn tại.", {"code": "Đã tồn tại."})
        audit.record(request, "class_update", "class", c.id, f"Sửa lớp {c.code}", before=before, after=_class(c))
    return JsonResponse(_class(c))
