"""SF43: vòng đời dữ liệu suất trưa (mở ngày, chốt, mở lại). API/validation form là việc SF44/SF46.

Quy ước dùng chung cho SF46:
- NULL = chưa nhập, 0 = không ăn. Suất lớp là số nguyên 0..enrolled_snapshot.
- Mọi lần sửa LunchDay phải tăng version đúng 1 (DB bắt buộc). Cập nhật số kiểu khóa lạc quan:
      updated = LunchDay.objects.filter(pk=day_id, version=expected).update(..., version=F("version") + 1)
      if not updated: raise LunchVersionConflict  → HTTP 409
  Sửa ClassMealCount thì cũng tăng version của ngày trong cùng transaction.
- Không khóa tự động theo giờ: giờ chốt là cấu hình vận hành, trường chưa chọn (architecture.md §5).
"""

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import ClassMealCount, LunchDay, LunchDayEvent, SchoolClass


class LunchVersionConflict(ValidationError):
    """Dữ liệu đã bị người khác sửa (version khác) hoặc trạng thái không cho phép → 409."""


PLANNED, ACTUAL = "planned", "actual"


def _lock_day(day_id, expected_version):
    day = LunchDay.objects.select_for_update(of=("self",)).get(pk=day_id)
    if expected_version is not None and day.version != expected_version:
        raise LunchVersionConflict(
            f"Ngày {day.date} đã được cập nhật (phiên bản {day.version}, bạn đang sửa bản {expected_version}). Tải lại rồi thử lại."
        )
    return day


def _snapshot(day, kind):
    rows = day.class_counts.select_related("school_class").order_by("school_class__code")
    return {
        "staff": getattr(day, f"staff_{kind}"),
        "classes": {r.school_class.code: {"count": getattr(r, kind), "enrolled": r.enrolled_snapshot} for r in rows},
    }


@transaction.atomic
def open_lunch_day(date):
    """Tạo ngày (nếu chưa có) và dòng suất cho mọi lớp đang hoạt động, chụp sĩ số hiện hành.

    Gọi lại được nhiều lần; khi đã chốt dự kiến thì không thêm lớp mới vào ngày đó.
    """
    day, _ = LunchDay.objects.get_or_create(date=date)
    day = LunchDay.objects.select_for_update(of=("self",)).get(pk=day.pk)
    if day.planned_confirmed_at is None:
        existing = set(day.class_counts.values_list("school_class_id", flat=True))
        new_rows = [
            ClassMealCount(lunch_day=day, school_class=c, enrolled_snapshot=c.enrolled)
            for c in SchoolClass.objects.filter(is_active=True).exclude(id__in=existing).order_by("id")
        ]
        if new_rows:
            ClassMealCount.objects.bulk_create(new_rows)
            LunchDay.objects.filter(pk=day.pk).update(version=F("version") + 1)
            day.refresh_from_db()
    return day


def missing_counts(day, kind):
    """Danh sách lý do chưa chốt được (rỗng = đủ điều kiện)."""
    problems = []
    if kind == PLANNED:
        have = set(day.class_counts.values_list("school_class_id", flat=True))
        for c in SchoolClass.objects.filter(is_active=True).exclude(id__in=have).order_by("code"):
            problems.append(f"Lớp {c.code} chưa có dòng suất ăn.")
    for row in day.class_counts.select_related("school_class").filter(**{f"{kind}__isnull": True}).order_by("school_class__code"):
        problems.append(f"Lớp {row.school_class.code} chưa nhập suất {'dự kiến' if kind == PLANNED else 'thực tế'}.")
    if getattr(day, f"staff_{kind}") is None:
        problems.append("Chưa nhập suất nhân viên.")
    return problems


@transaction.atomic
def confirm_counts(day_id, kind, user, expected_version):
    day = _lock_day(day_id, expected_version)
    if kind not in (PLANNED, ACTUAL):
        raise ValidationError("kind phải là 'planned' hoặc 'actual'.")
    if getattr(day, f"{kind}_confirmed_at") is not None:
        raise LunchVersionConflict("Số suất này đã được chốt.")
    if kind == ACTUAL and day.planned_confirmed_at is None:
        raise ValidationError("Phải chốt số dự kiến trước khi chốt số thực tế.")
    problems = missing_counts(day, kind)
    if problems:
        raise ValidationError(problems)

    new_version = day.version + 1
    LunchDay.objects.filter(pk=day.pk).update(**{
        f"{kind}_confirmed_at": timezone.now(), f"{kind}_confirmed_by": user, "version": new_version,
    })
    LunchDayEvent.objects.create(
        lunch_day=day, action=f"confirm_{kind}", version=new_version,
        snapshot=_snapshot(day, kind), created_by=user,
    )
    day.refresh_from_db()
    return day


@transaction.atomic
def reopen_counts(day_id, kind, user, reason, expected_version):
    """Mở lại cần lý do; tạo phiên bản mới, sự kiện cũ vẫn giữ để truy vết."""
    if not isinstance(reason, str) or not reason.strip():
        raise ValidationError("Mở lại số suất cần ghi lý do.")
    day = _lock_day(day_id, expected_version)
    if kind not in (PLANNED, ACTUAL):
        raise ValidationError("kind phải là 'planned' hoặc 'actual'.")
    if getattr(day, f"{kind}_confirmed_at") is None:
        raise LunchVersionConflict("Số suất này chưa chốt.")
    if kind == PLANNED and day.actual_confirmed_at is not None:
        raise ValidationError("Đang chốt số thực tế; mở lại số thực tế trước.")

    new_version = day.version + 1
    LunchDay.objects.filter(pk=day.pk).update(**{
        f"{kind}_confirmed_at": None, f"{kind}_confirmed_by": None, "version": new_version,
    })
    LunchDayEvent.objects.create(
        lunch_day=day, action=f"reopen_{kind}", version=new_version, reason=reason.strip(),
        snapshot=_snapshot(day, kind), created_by=user,
    )
    day.refresh_from_db()
    return day
