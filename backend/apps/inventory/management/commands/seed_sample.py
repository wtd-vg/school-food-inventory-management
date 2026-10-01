"""Dữ liệu mẫu đầy đủ để trình diễn (SF73, chủ dự án yêu cầu 01/10/2026), chạy được cả trên production.

    python manage.py seed_sample                       # máy local (DEBUG=True)
    python manage.py seed_sample --production --user admin   # production: bắt buộc --production

Tạo (giữ nguyên dữ liệu đã có, mã trùng thì dùng lại bản cũ):
- 5 danh mục, 20 nguyên liệu, 3 nhà cung cấp, 6 lớp (1A–5A), 11 món có công thức, thực đơn T2–T6 từ ngày mai;
- 5 học sinh/lớp, email phụ huynh đuôi .invalid (RFC 2606): không bao giờ gửi thật (notifications.is_sample_email);
- 2 phiếu nhập/NCC đã chốt (giá đợt 2 cao hơn để thấy giá vốn bình quân đổi);
- 10 ngày học gần nhất: số suất dự kiến/thực tế đã chốt, phiếu xuất bếp đã chốt theo định lượng × suất thực tế,
  đã đóng ngày → báo cáo ngày có chi phí/suất;
- hôm nay và ngày học kế tiếp: mở ngày, số dự kiến đã chốt → đi tiếp Nhu cầu → Đơn → Nhận → Xuất trên giao diện.
Không tạo tài khoản. Không tạo ảnh suất ăn (ảnh phải là ảnh thật). Chạy lại: thấy NCC mẫu đã có thì dừng.
"""

import random
from datetime import timedelta
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import F

from apps.inventory import audit, day_services, lunch, menu_services, services, student_services
from apps.inventory.models import (
    Category,
    ClassMealCount,
    Dish,
    FoodItem,
    Issue,
    IssueLine,
    LunchDay,
    MenuVersion,
    RecipeComponent,
    SchoolClass,
    Student,
    Supplier,
)

MARKER_SUPPLIER = "NCC_GAO"
STAFF = 8
HISTORY_DAYS = 10
QTY = Decimal("0.001")

CATEGORIES = [
    ("GAO_NGU_COC", "Gạo & ngũ cốc"),
    ("THIT_CA_TRUNG", "Thịt, cá, trứng"),
    ("RAU_CU_QUA", "Rau củ quả"),
    ("GIA_VI", "Gia vị & dầu ăn"),
    ("TRANG_MIENG", "Sữa & tráng miệng"),
]

# mã, tên, danh mục, đơn vị, giá đợt 1, nhà cung cấp
FOODS = [
    ("GAO", "Gạo tẻ", "GAO_NGU_COC", "kg", "18000", "NCC_GAO"),
    ("THIT_HEO", "Thịt heo nạc", "THIT_CA_TRUNG", "kg", "135000", "NCC_THIT"),
    ("THIT_GA", "Thịt gà", "THIT_CA_TRUNG", "kg", "95000", "NCC_THIT"),
    ("CA_BASA", "Cá basa phi lê", "THIT_CA_TRUNG", "kg", "85000", "NCC_THIT"),
    ("TRUNG_GA", "Trứng gà", "THIT_CA_TRUNG", "piece", "3500", "NCC_THIT"),
    ("DAU_HU", "Đậu hũ", "THIT_CA_TRUNG", "kg", "30000", "NCC_RAU"),
    ("RAU_NGOT", "Rau ngót", "RAU_CU_QUA", "kg", "30000", "NCC_RAU"),
    ("RAU_MUONG", "Rau muống", "RAU_CU_QUA", "kg", "20000", "NCC_RAU"),
    ("BI_DO", "Bí đỏ", "RAU_CU_QUA", "kg", "18000", "NCC_RAU"),
    ("CA_CHUA", "Cà chua", "RAU_CU_QUA", "kg", "25000", "NCC_RAU"),
    ("CA_ROT", "Cà rốt", "RAU_CU_QUA", "kg", "20000", "NCC_RAU"),
    ("BAP_CAI", "Bắp cải", "RAU_CU_QUA", "kg", "15000", "NCC_RAU"),
    ("HANH_TOI", "Hành tỏi", "GIA_VI", "kg", "60000", "NCC_RAU"),
    ("DAU_AN", "Dầu ăn", "GIA_VI", "lit", "45000", "NCC_GAO"),
    ("NUOC_MAM", "Nước mắm", "GIA_VI", "lit", "40000", "NCC_GAO"),
    ("DUONG", "Đường", "GIA_VI", "kg", "22000", "NCC_GAO"),
    ("MUOI", "Muối", "GIA_VI", "kg", "8000", "NCC_GAO"),
    ("SUA_CHUA", "Sữa chua", "TRANG_MIENG", "piece", "6000", "NCC_THIT"),
    ("CHUOI", "Chuối", "TRANG_MIENG", "kg", "25000", "NCC_RAU"),
    ("KHOAI_TAY", "Khoai tây", "RAU_CU_QUA", "kg", "25000", "NCC_RAU"),
]

SUPPLIERS = [
    ("NCC_GAO", "Đại lý gạo & gia vị Minh Phát"),
    ("NCC_THIT", "Thực phẩm sạch An Tâm"),
    ("NCC_RAU", "HTX rau an toàn Vân Nội"),
]

CLASSES = [("1A", "Lớp 1A", 1, 32), ("1B", "Lớp 1B", 1, 30), ("2A", "Lớp 2A", 2, 31),
           ("3A", "Lớp 3A", 3, 29), ("4A", "Lớp 4A", 4, 33), ("5A", "Lớp 5A", 5, 30)]

# Định lượng cho một suất theo đơn vị kho (kg / lit / piece).
DISHES = [
    ("COM_TRANG", "Cơm trắng", [("GAO", "0.080")]),
    ("THIT_KHO_TRUNG", "Thịt kho trứng", [("THIT_HEO", "0.040"), ("TRUNG_GA", "1"), ("NUOC_MAM", "0.004"), ("DUONG", "0.003")]),
    ("GA_RIM_GUNG", "Gà rim gừng", [("THIT_GA", "0.060"), ("HANH_TOI", "0.003"), ("NUOC_MAM", "0.004"), ("DAU_AN", "0.003")]),
    ("CA_SOT_CA", "Cá basa sốt cà chua", [("CA_BASA", "0.060"), ("CA_CHUA", "0.020"), ("DAU_AN", "0.004")]),
    ("DAU_HU_SOT", "Đậu hũ sốt cà thịt bằm", [("DAU_HU", "0.060"), ("THIT_HEO", "0.015"), ("CA_CHUA", "0.015")]),
    ("CANH_RAU_NGOT", "Canh rau ngót thịt bằm", [("RAU_NGOT", "0.030"), ("THIT_HEO", "0.010"), ("MUOI", "0.001")]),
    ("CANH_BI_DO", "Canh bí đỏ", [("BI_DO", "0.040"), ("THIT_HEO", "0.008"), ("MUOI", "0.001")]),
    ("CANH_BAP_CAI", "Canh bắp cải cà rốt", [("BAP_CAI", "0.030"), ("CA_ROT", "0.010"), ("MUOI", "0.001")]),
    ("RAU_MUONG_XAO", "Rau muống xào tỏi", [("RAU_MUONG", "0.050"), ("HANH_TOI", "0.002"), ("DAU_AN", "0.003")]),
    ("SUA_CHUA", "Sữa chua", [("SUA_CHUA", "1")]),
    ("CHUOI", "Chuối tráng miệng", [("CHUOI", "0.080")]),
]

MENU = {
    0: ["COM_TRANG", "THIT_KHO_TRUNG", "CANH_RAU_NGOT", "CHUOI"],
    1: ["COM_TRANG", "GA_RIM_GUNG", "CANH_BI_DO", "SUA_CHUA"],
    2: ["COM_TRANG", "CA_SOT_CA", "RAU_MUONG_XAO", "CANH_BAP_CAI"],
    3: ["COM_TRANG", "DAU_HU_SOT", "CANH_RAU_NGOT", "CHUOI"],
    4: ["COM_TRANG", "THIT_KHO_TRUNG", "CANH_BI_DO", "SUA_CHUA"],
}

STUDENT_NAMES = ["Nguyễn Minh An", "Trần Bảo Ngọc", "Lê Gia Huy", "Phạm Khánh Linh", "Hoàng Đức Minh",
                 "Vũ Thảo Vy", "Đặng Quốc Bảo", "Bùi Hà My", "Đỗ Anh Khoa", "Ngô Phương Thảo"]


class Command(BaseCommand):
    help = "Nạp dữ liệu mẫu đầy đủ (danh mục, món, thực đơn, học sinh, nhập kho, 10 ngày ăn đã đóng)."

    def add_arguments(self, parser):
        parser.add_argument("--production", action="store_true",
                            help="Bắt buộc khi DEBUG=False: xác nhận nạp dữ liệu mẫu vào DB thật.")
        parser.add_argument("--user", help="Tài khoản ghi là người lập (mặc định: superuser đầu tiên).")

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["production"]:
            raise CommandError("DEBUG=False: thêm --production để xác nhận nạp dữ liệu mẫu vào DB thật.")
        if Supplier.objects.filter(code=MARKER_SUPPLIER).exists():
            self.stdout.write(self.style.WARNING("Dữ liệu mẫu đã có (NCC_GAO tồn tại), không nạp lại."))
            return
        user = self._user(opts.get("user"))
        self.rng = random.Random(20261001)
        today = menu_services.today()
        with transaction.atomic():
            foods = self._catalog()
            dishes = self._dishes(foods)
            self._menu(dishes, today, user)
            classes = self._classes()
            self._students(classes, user)
            history = self._school_days_before(today, HISTORY_DAYS)
            self._receipts(foods, history, user)
            closed = self._history(history, foods, user)
            upcoming = self._upcoming(today, user)
            audit.record(None, "seed_sample", "system", "", "Nạp dữ liệu mẫu (seed_sample)", actor=user)
        self.stdout.write(self.style.SUCCESS(
            f"Xong: {len(foods)} nguyên liệu, {len(dishes)} món, {len(classes)} lớp, "
            f"{Student.objects.filter(school_class__in=classes).count()} học sinh, {closed} ngày ăn đã đóng, "
            f"mở sẵn: {', '.join(d.isoformat() for d in upcoming) or 'không'}."))

    # ------------------------------------------------------------------ helpers
    def _user(self, username):
        User = get_user_model()
        qs = User.objects.filter(is_active=True)
        user = qs.filter(username=username).first() if username else qs.filter(is_superuser=True).order_by("id").first()
        if user is None:
            raise CommandError("Không tìm thấy tài khoản đang hoạt động để ghi là người lập (dùng --user).")
        return user

    def _catalog(self):
        cats = {code: Category.objects.get_or_create(code=code, defaults={"name": name})[0] for code, name in CATEGORIES}
        for code, name in SUPPLIERS:
            Supplier.objects.get_or_create(code=code, defaults={"name": name})
        foods = {}
        for code, name, cat, unit, _price, _ncc in FOODS:
            foods[code] = FoodItem.objects.get_or_create(code=code, defaults={"name": name, "category": cats[cat], "unit": unit})[0]
        return foods

    def _dishes(self, foods):
        dishes = {}
        for code, name, components in DISHES:
            dish, created = Dish.objects.get_or_create(code=code, defaults={"name": name})
            if created or not dish.components.exists():
                RecipeComponent.objects.bulk_create([
                    RecipeComponent(dish=dish, food=foods[f], quantity=Decimal(q)) for f, q in components
                ])
            dishes[code] = dish
        return dishes

    def _menu(self, dishes, today, user):
        start = today + timedelta(days=1)
        if MenuVersion.objects.filter(effective_from__gte=start).exists():
            return
        days = {str(w): [dishes[c].id for c in codes] for w, codes in MENU.items()}
        menu_services.create_menu_version(start, days, user, note="Thực đơn mẫu")

    def _classes(self):
        result = []
        for code, name, grade, enrolled in CLASSES:
            klass, _ = SchoolClass.objects.get_or_create(code=code, defaults={"name": name, "grade": grade, "enrolled": enrolled})
            result.append(klass)
        return result

    def _students(self, classes, user):
        for klass in classes:
            if Student.objects.filter(school_class=klass).exists():
                continue
            for i, name in enumerate(self.rng.sample(STUDENT_NAMES, 5), start=1):
                email = f"phuhuynh.{klass.code.lower()}.{i:02d}@du-lieu-mau.invalid"
                student_services.create_student(name, klass, [email], user, consent_note="Dữ liệu mẫu")

    def _school_days_before(self, today, count):
        days, d = [], today - timedelta(days=1)
        while len(days) < count:
            if menu_services.day_status(d) == menu_services.MENU and not LunchDay.objects.filter(date=d).exists():
                days.append(d)
            d -= timedelta(days=1)
        return sorted(days)

    def _need(self, codes, servings):
        """Lượng xuất theo định lượng × suất: kg/lit làm tròn 0.001 HALF_UP, cái làm tròn lên."""
        need = {}
        for code in codes:
            for food_code, q in next(c for d, _n, c in DISHES if d == code):
                need[food_code] = need.get(food_code, Decimal("0")) + Decimal(q) * servings
        return {k: v.quantize(Decimal("1") if k in ("TRUNG_GA", "SUA_CHUA") else QTY,
                              rounding=ROUND_CEILING if k in ("TRUNG_GA", "SUA_CHUA") else ROUND_HALF_UP)
                for k, v in need.items()}

    def _receipts(self, foods, history, user):
        """Hai đợt nhập/NCC: đợt 1 trước ngày đầu, đợt 2 giữa kỳ (giá +5–10%). Đủ cho lịch sử + 2 tuần tới."""
        servings = sum(c[3] for c in CLASSES) + STAFF
        total = {}
        for _ in range(HISTORY_DAYS + 10):
            for w in range(5):
                for k, v in self._need(MENU[w], servings).items():
                    total[k] = total.get(k, Decimal("0")) + v / 5
        self.receipt_dates = [history[0] - timedelta(days=1), history[len(history) // 2]]
        for batch, when in enumerate(self.receipt_dates):
            for ncc, _name in SUPPLIERS:
                lines = []
                for code, _n, _c, unit, price, owner in FOODS:
                    if owner != ncc:
                        continue
                    qty = (total[code] / 2 if code in total else Decimal("5")).quantize(Decimal("1"), rounding=ROUND_CEILING)
                    unit_price = Decimal(price) * (Decimal("1") + Decimal(self.rng.randint(5, 10)) / 100 if batch else Decimal("1"))
                    unit_price = (unit_price / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 100
                    lines.append({"food_id": foods[code].id, "quantity": str(qty), "unit_price": str(unit_price)})
                receipt = services.create_receipt_draft(
                    supplier_id=Supplier.objects.get(code=ncc).id, date=when, lines=lines, user=user,
                    note=f"Nhập mẫu đợt {batch + 1}")
                if batch == 0:
                    services.post_receipt(receipt.id, user)
                else:
                    self.second_batch = getattr(self, "second_batch", []) + [receipt.id]

    def _set_counts(self, day, user, kind):
        rows = list(ClassMealCount.objects.filter(lunch_day=day).order_by("id"))
        for row in rows:
            if kind == lunch.PLANNED:
                value = max(0, row.enrolled_snapshot - self.rng.randint(0, 2))
            else:
                value = max(0, (row.planned or 0) - self.rng.randint(0, 2))
            ClassMealCount.objects.filter(pk=row.pk).update(**{kind: value})
        LunchDay.objects.filter(pk=day.pk).update(**{f"staff_{kind}": STAFF}, version=F("version") + 1)
        day.refresh_from_db()
        return lunch.confirm_counts(day.id, kind, user, day.version)

    def _history(self, history, foods, user):
        for i, d in enumerate(history):
            if d >= self.receipt_dates[1] and getattr(self, "second_batch", None):
                for receipt_id in self.second_batch:
                    services.post_receipt(receipt_id, user)
                self.second_batch = []
            day = lunch.open_lunch_day(d)
            day = self._set_counts(day, user, lunch.PLANNED)
            day = self._set_counts(day, user, lunch.ACTUAL)
            need = self._need(MENU[d.weekday()], day.actual_total)
            issue = Issue.objects.create(code=f"XB{d:%Y%m%d}-1", date=d, lunch_day=day, created_by=user,
                                         note=f"Xuất cho bếp ngày {d:%d/%m/%Y} (dữ liệu mẫu)")
            IssueLine.objects.bulk_create([IssueLine(issue=issue, food=foods[k], quantity=v) for k, v in sorted(need.items())])
            services.post_issue(issue.id, user)
            day_services.close_day(d, "Dữ liệu mẫu: xuất theo định lượng × suất thực tế (không có đề xuất đã duyệt).", user)
        for receipt_id in getattr(self, "second_batch", []):
            services.post_receipt(receipt_id, user)
        return len(history)

    def _upcoming(self, today, user):
        """Hôm nay (nếu là ngày học) và ngày học kế tiếp: mở ngày, chốt số dự kiến (nếu chưa ai nhập)."""
        days = [today] if menu_services.day_status(today) == menu_services.MENU else []
        d = today + timedelta(days=1)
        while menu_services.day_status(d) != menu_services.MENU and d < today + timedelta(days=30):
            d += timedelta(days=1)
        days.append(d)
        opened = []
        for d in days:
            day = lunch.open_lunch_day(d)
            if day.planned_confirmed_at is None and not day.class_counts.filter(planned__isnull=False).exists():
                self._set_counts(day, user, lunch.PLANNED)
                opened.append(d)
        return opened
