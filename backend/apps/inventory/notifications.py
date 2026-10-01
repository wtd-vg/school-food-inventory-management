"""BE-08 (R11): gửi email thực đơn hôm nay cho phụ huynh.

send_daily_menu(d):
1. Khóa advisory (session) để hai tiến trình không gửi cùng lúc.
2. Ngày nghỉ hoặc chưa có thực đơn → dòng tổng (email_hash "*") trạng thái skipped.
3. Chụp thực đơn ngày (snapshot_day); người nhận = email của học sinh đang học, đã đồng ý, chưa hủy;
   gom theo email: mỗi email một thư/ngày liệt kê các bé của phụ huynh đó.
4. Mỗi email có một NotificationLog (unique ngày + email): đã sent/dry_run thì bỏ qua → chạy lại an toàn.
5. EMAIL_MODE=dry_run chỉ ghi log. smtp: một kết nối cho cả đợt, mỗi người một thư riêng; lỗi đăng nhập
   SMTP dừng cả đợt; chạm EMAIL_DAILY_LIMIT thì dừng. Không gửi bên trong transaction DB.
Thông báo lỗi lưu trong log không chứa địa chỉ email.
Email đuôi .invalid (RFC 2606, dùng cho dữ liệu mẫu seed_sample) không bao giờ được gửi qua SMTP: ghi skipped
để không bị trả thư làm hỏng uy tín tài khoản Gmail gửi.
"""

import logging
import smtplib
from collections import OrderedDict

from django.conf import settings
from django.core.mail import get_connection
from django.db import connection as db_connection, transaction

from .crypto_fields import decrypt
from .mailer import build_menu_email
from .menu_services import MENU, day_status, menu_for_date, snapshot_day
from .models import NotificationLog, ParentContact

log = logging.getLogger(__name__)
SUMMARY = "*"
LOCK_KEY = 4_200_108  # pg_advisory_lock: BE-08 gửi email thực đơn
Status = NotificationLog.Status
SAMPLE_EMAIL_SUFFIX = ".invalid"  # RFC 2606: tên miền không bao giờ nhận thư thật.


def is_sample_email(email):
    return email.lower().endswith(SAMPLE_EMAIL_SUFFIX)


def recipients():
    """OrderedDict email_hash → {"email", "children": [...]}, chỉ học sinh đang học, đã đồng ý, chưa hủy.

    Gom theo email; mỗi BÉ (theo id) đếm một lần — hai bé trùng họ tên ở hai lớp vẫn là hai bé, khi đó tên kèm
    mã lớp để phụ huynh phân biệt.
    """
    groups = OrderedDict()
    contacts = (ParentContact.objects.filter(student__is_active=True, unsubscribed_at__isnull=True)
                .select_related("student__school_class")
                .order_by("email_hash", "student__full_name", "student__school_class__code", "student_id"))
    for c in contacts:
        group = groups.get(c.email_hash)
        if group is None:
            group = groups[c.email_hash] = {"email": decrypt(c.email_encrypted), "children": [], "_students": {}}
        group["_students"].setdefault(c.student_id, c.student)
    for group in groups.values():
        students = list(group.pop("_students").values())
        names = [s.full_name for s in students]
        group["children"] = [
            f"{s.full_name} ({s.school_class.code})" if names.count(s.full_name) > 1 else s.full_name for s in students
        ]
    return groups


def _summary(d, status, count=0, error=""):
    NotificationLog.objects.update_or_create(
        date=d, email_hash=SUMMARY,
        defaults={"status": status, "student_count": count, "error": error[:300]},
    )


def request_resend(d):
    """Nút Gửi lại: xếp dòng tổng về pending; scheduler chạy lại trong vòng 1 phút (chỉ gửi phần còn thiếu)."""
    _summary(d, Status.PENDING, error="Đã xếp lịch gửi lại.")


def _safe_error(exc, email):
    text = f"{type(exc).__name__}: {exc}".replace(email, "<email>")
    return text[:300]


def send_daily_menu(d):
    with db_connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_lock(%s)", [LOCK_KEY])
    try:
        return _send(d)
    finally:
        with db_connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_unlock(%s)", [LOCK_KEY])


def _send(d):
    stats = {"sent": 0, "dry_run": 0, "failed": 0, "skipped": 0, "already": 0}
    if day_status(d) != MENU:
        _summary(d, Status.SKIPPED, error="Ngày nghỉ: không gửi.")
        stats["skipped"] = 1
        return stats
    if snapshot_day(d) is None:
        _summary(d, Status.SKIPPED, error="Chưa có thực đơn cho ngày này.")
        stats["skipped"] = 1
        return stats
    day = menu_for_date(d)
    groups = recipients()
    dry_run = settings.EMAIL_MODE != "smtp"
    sent_today = NotificationLog.objects.filter(date=d, status=Status.SENT).exclude(email_hash=SUMMARY).count()
    smtp = None if dry_run else get_connection()
    aborted = ""
    try:
        for email_hash, group in groups.items():
            with transaction.atomic():
                entry, _ = NotificationLog.objects.select_for_update().get_or_create(
                    date=d, email_hash=email_hash,
                    defaults={"status": Status.PENDING, "student_count": len(group["children"])},
                )
            if entry.status in (Status.SENT, Status.DRY_RUN):
                stats["already"] += 1
                continue
            entry.student_count = len(group["children"])
            if aborted:
                entry.status, entry.error = Status.FAILED, aborted
            elif dry_run:
                entry.status, entry.error = Status.DRY_RUN, ""
            elif is_sample_email(group["email"]):
                entry.status, entry.error = Status.SKIPPED, "Email dữ liệu mẫu (.invalid): không gửi."
            elif sent_today >= settings.EMAIL_DAILY_LIMIT:
                entry.status, entry.error = Status.FAILED, f"Vượt hạn mức {settings.EMAIL_DAILY_LIMIT} thư/ngày."
            else:
                entry.attempts += 1
                try:
                    build_menu_email(group["email"], email_hash, day, group["children"], connection=smtp).send()
                    entry.status, entry.error = Status.SENT, ""
                    sent_today += 1
                except smtplib.SMTPAuthenticationError as exc:
                    aborted = "Sai tài khoản/App Password SMTP: dừng cả đợt."
                    entry.status, entry.error = Status.FAILED, aborted
                    log.error("SMTP authentication failed: %s", type(exc).__name__)
                except (smtplib.SMTPException, OSError) as exc:
                    entry.status, entry.error = Status.FAILED, _safe_error(exc, group["email"])
            entry.save(update_fields=["status", "error", "attempts", "student_count", "updated_at"])
            stats[{"sent": "sent", "dry_run": "dry_run", "skipped": "skipped"}.get(entry.status, "failed")] += 1
    finally:
        if smtp is not None:
            smtp.close()
    if dry_run:
        final, note = Status.DRY_RUN, ""
    elif aborted or stats["failed"]:
        final, note = Status.FAILED, aborted or f"{stats['failed']} thư lỗi, bấm Gửi lại để thử lại."
    elif stats["skipped"] and not (stats["sent"] or stats["already"]):
        final, note = Status.SKIPPED, "Chỉ có email dữ liệu mẫu (.invalid): không gửi thư nào."
    else:
        final, note = Status.SENT, ""
    _summary(d, final, count=len(groups), error=note)
    return stats


def day_logs(d):
    """Nhật ký gửi của một ngày cho màn hình: gợi ý email đã che, không có email đầy đủ."""
    hints = dict(ParentContact.objects.values_list("email_hash", "email_hint"))
    rows = NotificationLog.objects.filter(date=d).order_by("id")
    summary = next((r for r in rows if r.email_hash == SUMMARY), None)
    return {
        "date": d.isoformat(),
        "mode": settings.EMAIL_MODE,
        "summary": None if summary is None else {
            "status": summary.status, "recipients": summary.student_count, "note": summary.error,
            "updated_at": summary.updated_at.isoformat(),
        },
        "results": [
            {
                "id": r.id,
                "email_hint": hints.get(r.email_hash, "(đã xóa)"),
                "student_count": r.student_count,
                "status": r.status,
                "error": r.error,
                "attempts": r.attempts,
                "updated_at": r.updated_at.isoformat(),
            }
            for r in rows if r.email_hash != SUMMARY
        ],
    }


def send_test_email(to_email, d):
    """Gửi thử thực đơn của ngày d tới email của người đang đăng nhập (không ghi NotificationLog)."""
    day = menu_for_date(d, take_snapshot=False)
    message = build_menu_email(to_email, "0" * 64, day, ["(thư thử)"])
    message.subject = "[Thử] " + message.subject
    return message.send()
