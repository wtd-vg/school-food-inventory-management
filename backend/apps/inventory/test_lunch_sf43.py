"""SF43: dữ liệu lớp, ngày ăn, suất trưa (PostgreSQL, COMMIT thật). Case theo AC23–AC25."""

from datetime import date

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import F, ProtectedError
from django.test import TransactionTestCase
from django.utils import timezone

from .lunch import LunchVersionConflict, confirm_counts, open_lunch_day, reopen_counts
from .models import ClassMealCount, LunchDay, LunchDayEvent, SchoolClass


class LunchFixtures:
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="sf43_manager")
        self.a = SchoolClass.objects.create(code="1A1", name="Lớp 1A1", grade=1, enrolled=30)
        self.b = SchoolClass.objects.create(code="1A2", name="Lớp 1A2", grade=1, enrolled=28)
        self.c = SchoolClass.objects.create(code="2A1", name="Lớp 2A1", grade=2, enrolled=20)
        self.day = open_lunch_day(date(2026, 10, 1))

    def row(self, klass):
        return ClassMealCount.objects.get(lunch_day=self.day, school_class=klass)

    def set_counts(self, kind="planned", staff=None, **by_code):
        """Ghi số kiểu SF46: sửa dòng + tăng version của ngày trong một transaction."""
        with transaction.atomic():
            for code, value in by_code.items():
                ClassMealCount.objects.filter(lunch_day=self.day, school_class__code=code.replace("_", "")).update(**{kind: value})
            fields = {"version": F("version") + 1}
            if staff is not None:
                fields[f"staff_{kind}"] = staff
            LunchDay.objects.filter(pk=self.day.pk).update(**fields)
        self.day.refresh_from_db()


class ClassCountTests(LunchFixtures, TransactionTestCase):
    def test_open_day_snapshots_active_classes(self):
        self.assertEqual(self.day.class_counts.count(), 3)
        self.assertEqual(self.row(self.a).enrolled_snapshot, 30)
        self.assertIsNone(self.row(self.a).planned)

    def test_ac23_rejects_negative_and_above_enrolled(self):
        for bad in (-1, 31):
            with self.subTest(value=bad), self.assertRaises(IntegrityError), transaction.atomic():
                ClassMealCount.objects.filter(pk=self.row(self.a).pk).update(planned=bad)
        with self.assertRaises(ValidationError):  # "số lẻ" không phải số nguyên
            row = self.row(self.a)
            row.planned = "1.5"
            row.full_clean()
        for good in (30, 0):
            ClassMealCount.objects.filter(pk=self.row(self.a).pk).update(planned=good)
            self.assertEqual(self.row(self.a).planned, good)
        with self.assertRaises(IntegrityError), transaction.atomic():
            SchoolClass.objects.create(code="BAD", name="Sai", enrolled=-1)

    def test_null_is_not_zero(self):
        self.set_counts(staff=5, _1A1=30, _1A2=28)  # 2A1 còn NULL
        self.assertIsNone(self.day.planned_total)
        with self.assertRaises(ValidationError) as ctx:
            confirm_counts(self.day.id, "planned", self.user, self.day.version)
        self.assertIn("2A1", " ".join(ctx.exception.messages))
        self.set_counts(_2A1=0)  # 0 = cả lớp nghỉ ăn, hợp lệ
        self.assertEqual(self.day.planned_total, 63)
        confirm_counts(self.day.id, "planned", self.user, self.day.version)

    def test_ac24_new_active_class_blocks_confirmation(self):
        self.set_counts(staff=5, _1A1=30, _1A2=28, _2A1=0)
        SchoolClass.objects.create(code="3A1", name="Lớp 3A1", enrolled=25)
        with self.assertRaises(ValidationError):
            confirm_counts(self.day.id, "planned", self.user, self.day.version)
        self.day = open_lunch_day(self.day.date)  # bổ sung dòng cho lớp mới
        self.set_counts(_3A1=25)
        confirm_counts(self.day.id, "planned", self.user, self.day.version)

    def test_db_refuses_incomplete_confirmation_even_without_service(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            LunchDay.objects.filter(pk=self.day.pk).update(
                planned_confirmed_at=timezone.now(), planned_confirmed_by=self.user, version=F("version") + 1)
            LunchDayEvent.objects.create(lunch_day=self.day, action="confirm_planned",
                                         version=self.day.version + 1, created_by=self.user)

    def test_confirmation_requires_history_event(self):
        self.set_counts(staff=5, _1A1=30, _1A2=28, _2A1=0)
        with self.assertRaises(IntegrityError), transaction.atomic():
            LunchDay.objects.filter(pk=self.day.pk).update(
                planned_confirmed_at=timezone.now(), planned_confirmed_by=self.user, version=F("version") + 1)


class ConfirmedDayTests(LunchFixtures, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.set_counts(staff=5, _1A1=30, _1A2=28, _2A1=0)
        self.day = confirm_counts(self.day.id, "planned", self.user, self.day.version)

    def test_ac25_changing_class_size_does_not_touch_confirmed_day(self):
        SchoolClass.objects.filter(pk=self.a.pk).update(enrolled=25)
        row = self.row(self.a)
        self.assertEqual((row.enrolled_snapshot, row.planned), (30, 30))
        self.assertEqual(self.day.planned_total, 63)

    def test_confirmed_planned_counts_are_read_only(self):
        for values in ({"planned": 29}, {"enrolled_snapshot": 25}):
            with self.subTest(values=values), self.assertRaises(IntegrityError), transaction.atomic():
                ClassMealCount.objects.filter(pk=self.row(self.a).pk).update(**values)
        new_class = SchoolClass.objects.create(code="4A1", name="Lớp 4A1", enrolled=10)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ClassMealCount.objects.create(lunch_day=self.day, school_class=new_class, enrolled_snapshot=10)
        with self.assertRaises(IntegrityError), transaction.atomic():
            LunchDay.objects.filter(pk=self.day.pk).update(staff_planned=6, version=F("version") + 1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.row(self.a).delete()

    def test_ac25_planned_and_actual_are_kept_separately(self):
        self.set_counts(kind="actual", staff=4, _1A1=29, _1A2=27, _2A1=0)
        day = confirm_counts(self.day.id, "actual", self.user, self.day.version)
        self.assertEqual((day.planned_total, day.actual_total), (63, 60))
        with self.assertRaises(IntegrityError), transaction.atomic():
            ClassMealCount.objects.filter(pk=self.row(self.a).pk).update(actual=30)
        self.assertEqual(list(day.events.values_list("action", flat=True)), ["confirm_planned", "confirm_actual"])

    def test_reopen_needs_reason_and_keeps_history(self):
        with self.assertRaises(ValidationError):
            reopen_counts(self.day.id, "planned", self.user, "  ", self.day.version)
        day = reopen_counts(self.day.id, "planned", self.user, "Lớp 1A2 báo thêm 1 suất", self.day.version)
        self.assertIsNone(day.planned_confirmed_at)
        events = list(day.events.order_by("version"))
        self.assertEqual([e.action for e in events], ["confirm_planned", "reopen_planned"])
        self.assertEqual(events[0].snapshot["classes"]["1A1"], {"count": 30, "enrolled": 30})
        with self.assertRaises(IntegrityError):
            LunchDayEvent.objects.filter(pk=events[0].pk).update(reason="sửa lịch sử")
        with self.assertRaises(IntegrityError), transaction.atomic():
            LunchDayEvent.objects.create(lunch_day=day, action="reopen_actual", version=99, created_by=self.user)

    def test_reopen_planned_blocked_while_actual_confirmed(self):
        self.set_counts(kind="actual", staff=4, _1A1=29, _1A2=27, _2A1=0)
        confirm_counts(self.day.id, "actual", self.user, self.day.version)
        self.day.refresh_from_db()
        with self.assertRaises(ValidationError):
            reopen_counts(self.day.id, "planned", self.user, "sai", self.day.version)

    def test_stale_version_is_conflict(self):
        with self.assertRaises(LunchVersionConflict):
            reopen_counts(self.day.id, "planned", self.user, "lý do", self.day.version - 1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            LunchDay.objects.filter(pk=self.day.pk).update(staff_actual=3)  # không tăng version

    def test_class_and_day_with_history_are_kept(self):
        SchoolClass.objects.filter(pk=self.a.pk).update(is_active=False)  # ngừng dùng vẫn giữ lịch sử
        self.assertEqual(self.row(self.a).planned, 30)
        with self.assertRaises(ProtectedError):
            SchoolClass.objects.get(pk=self.a.pk).delete()
        with self.assertRaises((IntegrityError, ProtectedError)):
            LunchDay.objects.get(pk=self.day.pk).delete()
