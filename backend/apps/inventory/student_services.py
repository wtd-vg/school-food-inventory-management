"""BE-14 (R11): học sinh và email phụ huynh.

- Email chỉ lưu khi phụ huynh đồng ý; lưu bản mã hóa + HMAC + gợi ý đã che (crypto_fields).
- Mỗi bé tối đa 2 email. Bé nghỉ học → xóa hẳn học sinh và email.
- Import CSV: lưu toàn bộ hoặc không lưu gì; dry_run trả kết quả từng dòng.
"""

import csv
import io

from django.db import transaction
from django.utils import timezone

from .crypto_fields import contact_hash, email_hint, encrypt, normalize_email
from .http_input import InputError, check_int, field_error
from .models import MAX_CONTACTS_PER_STUDENT, ParentContact, SchoolClass, Student

CSV_MAX_BYTES = 1024 * 1024
CSV_MAX_ROWS = 3000
CSV_REQUIRED = ("ho_ten", "ma_lop", "email_1", "da_dong_y")
CONSENT_YES = {"co", "có", "x", "yes", "1"}
CONSENT_NO = {"khong", "không", "", "no", "0"}


def student_payload(s):
    return {
        "id": s.id,
        "full_name": s.full_name,
        "class_id": s.school_class_id,
        "class_code": s.school_class.code,
        "is_active": s.is_active,
        "contacts": [
            {
                "id": c.id,
                "email_hint": c.email_hint,
                "consent_at": c.consent_at.isoformat(),
                "unsubscribed_at": c.unsubscribed_at.isoformat() if c.unsubscribed_at else None,
            }
            for c in s.contacts.all()
        ],
    }


def parse_full_name(value, key="full_name"):
    if not isinstance(value, str) or not value.strip():
        raise field_error(key, "Không được để trống.", "Họ tên học sinh không được để trống.")
    name = " ".join(value.split())
    if len(name) > 120:
        raise field_error(key, "Tối đa 120 ký tự.", "Họ tên học sinh tối đa 120 ký tự.")
    return name


def parse_class(value, key="class_id"):
    class_id = check_int(value, key, minimum=1, label="Lớp")
    klass = SchoolClass.objects.filter(id=class_id, is_active=True).first()
    if klass is None:
        raise field_error(key, "Lớp không tồn tại hoặc đã ngừng.", "Lớp không tồn tại hoặc đã ngừng hoạt động.")
    return klass


def parse_contacts(raw):
    """[{email, consent: true}] → [email chuẩn hóa]; chỉ lưu khi đồng ý; tối đa 2; không trùng."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise field_error("contacts", "Phải là danh sách.", "Danh sách email phải là mảng.")
    if len(raw) > MAX_CONTACTS_PER_STUDENT:
        raise field_error("contacts", "Tối đa 2 email.", "Mỗi học sinh tối đa 2 email phụ huynh.")
    emails = []
    for i, item in enumerate(raw):
        key = f"contacts[{i}]"
        if not isinstance(item, dict) or set(item) - {"email", "consent"}:
            raise field_error(key, "Chỉ nhận email và consent.", f"Email thứ {i + 1} không hợp lệ.")
        if item.get("consent") is not True:
            raise field_error(f"{key}.consent", "Cần phụ huynh đồng ý.",
                              "Chỉ lưu email khi phụ huynh đã đồng ý nhận thư (consent = true).")
        try:
            email = normalize_email(item.get("email"))
        except ValueError as exc:
            raise field_error(f"{key}.email", str(exc), str(exc))
        if email in emails:
            raise field_error(f"{key}.email", "Trùng email.", "Hai email của học sinh bị trùng nhau.")
        emails.append(email)
    return emails


def _add_contacts(student, emails, user, note):
    now = timezone.now()
    for email in emails:
        ParentContact.objects.create(
            student=student, email_encrypted=encrypt(email), email_hash=contact_hash(email),
            email_hint=email_hint(email), consent_at=now, consent_note=note[:200], created_by=user,
        )


@transaction.atomic
def create_student(full_name, klass, emails, user, consent_note=""):
    student = Student.objects.create(full_name=full_name, school_class=klass)
    _add_contacts(student, emails, user, consent_note)
    return student


@transaction.atomic
def replace_contacts(student, emails, user, consent_note=""):
    """Giữ email cũ trùng (giữ nguyên ngày đồng ý/hủy nhận), xóa email bỏ đi, thêm email mới."""
    wanted = {contact_hash(e): e for e in emails}
    for contact in student.contacts.all():
        if contact.email_hash not in wanted:
            contact.delete()
        else:
            wanted.pop(contact.email_hash)
    _add_contacts(student, list(wanted.values()), user, consent_note)


def _consent(value):
    v = (value or "").strip().lower()
    if v in CONSENT_YES:
        return True
    if v in CONSENT_NO:
        return False
    raise ValueError("da_dong_y chỉ nhận co hoặc khong.")


def read_csv(upload):
    if upload is None:
        raise field_error("file", "Thiếu file.", "Chọn file CSV để nhập.")
    if upload.size > CSV_MAX_BYTES:
        raise field_error("file", "Tối đa 1 MB.", "File CSV tối đa 1 MB.")
    raw = upload.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise field_error("file", "Phải là UTF-8.", "File CSV phải lưu bằng mã UTF-8.")
    reader = csv.DictReader(io.StringIO(text))
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    missing = [h for h in CSV_REQUIRED if h not in headers]
    if missing:
        raise InputError("File CSV thiếu cột: " + ", ".join(missing) + ". Cột cần có: ho_ten, ma_lop, email_1, email_2, da_dong_y.")
    reader.fieldnames = headers
    rows = list(reader)
    if len(rows) > CSV_MAX_ROWS:
        raise InputError(f"File CSV tối đa {CSV_MAX_ROWS} dòng.")
    return rows


def import_students(rows, user, dry_run):
    classes = {c.code.upper(): c for c in SchoolClass.objects.filter(is_active=True)}
    existing = {(n.lower(), cid) for n, cid in Student.objects.values_list("full_name", "school_class_id")}
    seen, results, valid = set(), [], []
    for index, row in enumerate(rows, start=2):  # dòng 1 là tiêu đề
        errors = {}
        try:
            name = parse_full_name(row.get("ho_ten"), "ho_ten")
        except InputError as exc:
            errors["ho_ten"], name = exc.message, None
        klass = classes.get((row.get("ma_lop") or "").strip().upper())
        if klass is None:
            errors["ma_lop"] = "Mã lớp không tồn tại hoặc đã ngừng."
        try:
            consent = _consent(row.get("da_dong_y"))
        except ValueError as exc:
            errors["da_dong_y"], consent = str(exc), False
        emails = []
        for col in ("email_1", "email_2"):
            value = (row.get(col) or "").strip()
            if not value:
                continue
            try:
                email = normalize_email(value)
            except ValueError as exc:
                errors[col] = str(exc)
                continue
            if email in emails:
                errors[col] = "Trùng với email_1."
            emails.append(email)
        if consent and not emails:
            errors["email_1"] = "Đã đồng ý nhưng chưa có email."
        if name and klass:
            key = (name.lower(), klass.id)
            if key in existing:
                errors["ho_ten"] = "Học sinh này đã có trong lớp."
            elif key in seen:
                errors["ho_ten"] = "Trùng với dòng khác trong file."
            seen.add(key)
        results.append({"line": index, "full_name": name or (row.get("ho_ten") or "").strip(),
                        "class_code": klass.code if klass else (row.get("ma_lop") or "").strip(),
                        "emails": len(emails) if consent else 0,
                        "status": "error" if errors else "ok", "errors": errors})
        if not errors:
            valid.append((name, klass, emails if consent else []))
    summary = {"rows": len(results), "ok": len(valid), "errors": len(results) - len(valid),
               "with_email": sum(1 for _, _, e in valid if e)}
    if dry_run or summary["errors"]:
        return results, summary, False
    with transaction.atomic():
        for name, klass, emails in valid:
            create_student(name, klass, emails, user, "Nhập từ CSV")
    return results, summary, True
