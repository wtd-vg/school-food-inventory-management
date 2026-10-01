"""BE-14: API học sinh và email phụ huynh.

GET    /api/students/?class=<id>           danh sách (email đã che)        Quản lý + Hiệu trưởng
POST   /api/students/                       {full_name, class_id, contacts}  Quản lý
PATCH  /api/students/<id>/                  {full_name?, class_id?, contacts?}
DELETE /api/students/<id>/                  bé nghỉ học: xóa hẳn học sinh + email
POST   /api/students/import/?dry_run=1      multipart file=CSV
POST   /api/parent-contacts/<id>/reveal/    email đầy đủ (chỉ Quản lý, có nhật ký)
Nhật ký không chứa họ tên bé hay email.
"""

from django.db import transaction
from django.http import JsonResponse

from . import audit
from .auth_views import inventory_permission_required, manager_required
from .crypto_fields import decrypt
from .http_input import InputError, json_api, method_not_allowed, only_fields, query_int, read_object
from .models import ParentContact, Student
from .student_services import (
    create_student,
    import_students,
    parse_class,
    parse_contacts,
    parse_full_name,
    read_csv,
    replace_contacts,
    student_payload,
)


def _students():
    return Student.objects.select_related("school_class").prefetch_related("contacts").order_by(
        "school_class__code", "full_name", "id")


@inventory_permission_required
@json_api
def students(request):
    if request.method == "GET":
        rows = _students()
        class_id = query_int(request, "class")
        if class_id:
            rows = rows.filter(school_class_id=class_id)
        return JsonResponse({"results": [student_payload(s) for s in rows]})
    if request.method != "POST":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"full_name", "class_id", "contacts"})
    name = parse_full_name(data.get("full_name"))
    klass = parse_class(data.get("class_id"))
    emails = parse_contacts(data.get("contacts"))
    with transaction.atomic():
        s = create_student(name, klass, emails, request.user, "Nhập trên màn Học sinh")
        audit.record(request, "student_create", "student", s.id, f"Thêm học sinh lớp {klass.code}, {len(emails)} email")
    return JsonResponse(student_payload(_students().get(id=s.id)), status=201)


@inventory_permission_required
@json_api
def student_detail(request, student_id):
    if request.method == "GET":
        return JsonResponse(student_payload(_students().get(id=student_id)))
    if request.method == "DELETE":
        with transaction.atomic():
            s = Student.objects.select_for_update().select_related("school_class").get(id=student_id)
            class_code, contact_count = s.school_class.code, s.contacts.count()
            s.delete()
            audit.record(request, "student_delete", "student", student_id,
                         f"Bé nghỉ học: xóa học sinh lớp {class_code} và {contact_count} email")
        return JsonResponse({"message": "Đã xóa học sinh và email phụ huynh."})
    if request.method != "PATCH":
        return method_not_allowed()
    data = read_object(request)
    only_fields(data, {"full_name", "class_id", "contacts"})
    with transaction.atomic():
        s = Student.objects.select_for_update().get(id=student_id)
        changed = []
        if "full_name" in data:
            s.full_name = parse_full_name(data["full_name"])
            changed.append("họ tên")
        if "class_id" in data:
            s.school_class = parse_class(data["class_id"])
            changed.append("lớp")
        s.save()
        if "contacts" in data:
            replace_contacts(s, parse_contacts(data["contacts"]), request.user, "Sửa trên màn Học sinh")
            changed.append("email")
        audit.record(request, "student_update", "student", s.id, "Sửa học sinh: " + (", ".join(changed) or "không đổi"))
    return JsonResponse(student_payload(_students().get(id=s.id)))


@inventory_permission_required
@json_api
def students_import(request):
    if request.method != "POST":
        return method_not_allowed()
    dry_run = request.GET.get("dry_run") in ("1", "true")
    rows = read_csv(request.FILES.get("file"))
    with transaction.atomic():
        results, summary, saved = import_students(rows, request.user, dry_run)
        if saved:
            audit.record(request, "student_import", "student", "", f"Nhập CSV {summary['ok']} học sinh, {summary['with_email']} có email")
    if not dry_run and not saved:
        return JsonResponse({"message": "File có dòng lỗi, chưa lưu dòng nào.", "rows": results, "summary": summary,
                             "saved": False}, status=400)
    return JsonResponse({"rows": results, "summary": summary, "saved": saved, "dry_run": dry_run})


@manager_required
@json_api
def contact_reveal(request, contact_id):
    if request.method != "POST":
        return method_not_allowed()
    contact = ParentContact.objects.select_related("student__school_class").get(id=contact_id)
    try:
        email = decrypt(contact.email_encrypted)
    except ValueError as exc:
        raise InputError(str(exc))
    audit.record(request, "contact_reveal", "parent_contact", contact.id,
                 f"Xem email phụ huynh của một học sinh lớp {contact.student.school_class.code}")
    return JsonResponse({"id": contact.id, "email": email})
