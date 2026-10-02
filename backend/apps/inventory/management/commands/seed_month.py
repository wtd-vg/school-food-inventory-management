"""Dữ liệu mẫu khoảng một tháng, đi đủ luồng nghiệp vụ G2 (SF75, chủ dự án yêu cầu 02/10/2026).

    python manage.py seed_month                               # máy local (DEBUG=True), sau seed_sample
    python manage.py seed_month --production --user admin    # production: bắt buộc --production
    python manage.py seed_month --production --dry-run        # diễn tập: chạy đủ, tự kiểm tra rồi rollback

Chạy SAU seed_sample (dùng lại danh mục, món, lớp, nhà cung cấp mẫu). Chỉ THÊM dữ liệu, không sửa/xóa gì đã có:
- thực đơn cố định áp dụng từ --start (mặc định thứ Hai 3 tuần trước tuần này) để các tuần cũ có thực đơn;
- mỗi ngày học từ --start tới hôm qua chưa có ngày ăn: chốt dự kiến → tính và duyệt nhu cầu → đơn rau/thịt
  (duyệt → gửi NCC → nhận hàng, có ngày nhận 2 đợt, có ngày NCC giao thiếu phải đóng phần còn lại) → xuất bếp
  → chốt thực tế → đóng ngày; hàng khô nhập đầu kỳ theo đơn;
- kiểm kê cuối tháng (ngày học cuối cùng trước tháng của hôm nay);
- các ngày đã mở mà chưa xong trước hôm nay: đi tiếp tới đóng ngày; hôm nay: tới xuất bếp (số thực tế, ảnh,
  gửi thư, đóng ngày để người dùng tự làm);
- 5 ngày học kế tiếp: mở ngày, chốt dự kiến; 2 ngày đầu duyệt nhu cầu; đơn "đã gửi", đơn nháp, đơn đã hủy.
Không tạo ảnh suất ăn, nhật ký gửi thư, tài khoản. Toàn bộ trong một transaction; trước khi commit tự đối soát
sổ kho (--strict) và kiểm tra tồn chạy theo ngày chứng từ không âm, sai thì rollback. Chạy lại: thấy đã chạy thì dừng.

Thực đơn ngày đã qua bị trigger be03 khóa; lệnh tạm đặt đồng hồ của trigger về trước --start NGAY TRONG
transaction rồi khôi phục đúng định nghĩa cũ trước khi commit (cùng cách test_menus dùng), không tắt trigger nào.
"""

import random
from collections import defaultdict
from datetime import date as Date
from datetime import timedelta
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import F

from apps.inventory import audit, day_services, demand_services, lunch, menu_services, purchase_services, services
from apps.inventory.models import (
    AuditLog,
    ClassMealCount,
    DemandRevision,
    Dish,
    FoodItem,
    Issue,
    LunchDay,
    LunchDayClose,
    MenuVersion,
    MenuVersionItem,
    PurchaseOrder,
    SchoolClass,
    StockTransaction,
    Supplier,
)

from .seed_sample import FOODS, MARKER_SUPPLIER, MENU, STAFF

ACTION = "seed_month"
FRESH = {"THIT_HEO", "THIT_GA", "CA_BASA", "DAU_HU", "RAU_NGOT", "RAU_MUONG", "BI_DO", "CA_CHUA", "CA_ROT",
         "BAP_CAI", "CHUOI"}
PRICE = {code: Decimal(price) for code, _n, _c, _u, price, _s in FOODS}
OWNER = {code: owner for code, _n, _c, _u, _p, owner in FOODS}
TENTH = Decimal("0.1")
MILLI = Decimal("0.001")
RICE_RESERVE = Decimal("0.5")
# Kiểm kê cuối tháng: mã → chênh lệch (âm = hao hụt). Gạo, dầu đếm khớp.
STOCKTAKE = {"RAU_NGOT": Decimal("-0.150"), "RAU_MUONG": Decimal("-0.200"), "BAP_CAI": Decimal("-0.100"),
             "CA_CHUA": Decimal("-0.080"), "HANH_TOI": Decimal("-0.050"), "TRUNG_GA": Decimal("-2"),
             "GAO": Decimal("0"), "DAU_AN": Decimal("0")}


class Command(BaseCommand):
    help = "Nạp dữ liệu mẫu khoảng một tháng đi đủ luồng: nhu cầu → đơn → nhận → xuất → đóng ngày (sau seed_sample)."

    def add_arguments(self, parser):
        parser.add_argument("--production", action="store_true",
                            help="Bắt buộc khi DEBUG=False: xác nhận nạp dữ liệu mẫu vào DB thật.")
        parser.add_argument("--user", help="Tài khoản ghi là người lập (mặc định: superuser đầu tiên).")
        parser.add_argument("--start", type=Date.fromisoformat,
                            help="Ngày bắt đầu YYYY-MM-DD (mặc định: thứ Hai 3 tuần trước tuần này).")
        parser.add_argument("--dry-run", action="store_true",
                            help="Chạy đủ và tự kiểm tra rồi rollback, không ghi gì (diễn tập trên DB thật).")

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["production"]:
            raise CommandError("DEBUG=False: thêm --production để xác nhận nạp dữ liệu mẫu vào DB thật.")
        if not Supplier.objects.filter(code=MARKER_SUPPLIER).exists():
            raise CommandError("Chưa có dữ liệu mẫu gốc: chạy seed_sample trước.")
        if AuditLog.objects.filter(action=ACTION).exists():
            self.stdout.write(self.style.WARNING("seed_month đã chạy trước đó, không nạp lại."))
            return
        from .seed_sample import Command as SeedSample
        self.user = SeedSample()._user(opts.get("user"))
        self.rng = random.Random(20261002)
        self.today = menu_services.today()
        start = opts.get("start") or menu_services.week_start(self.today) - timedelta(weeks=3)
        if start >= self.today:
            raise CommandError("--start phải trước hôm nay.")
        self.foods = {f.code: f for f in FoodItem.objects.filter(code__in=PRICE)}
        self.suppliers = {s.code: s for s in Supplier.objects.filter(code__in=set(OWNER.values()))}
        self.stats = defaultdict(int)

        with transaction.atomic():
            negative_before = self._negative_foods()
            self._menu_from(start)
            backfill = [d for d in self._school_days(start, self.today) if not LunchDay.objects.filter(date=d).exists()]
            if backfill:
                self._dry_goods(backfill)
            open_days = set(LunchDay.objects.filter(date__gte=start, date__lt=self.today).exclude(
                id__in=LunchDayClose.objects.filter(reopened_at__isnull=True).values("lunch_day_id"))
                .values_list("date", flat=True))
            month_start, counted = self.today.replace(day=1), False
            for i, d in enumerate(sorted(set(backfill) | open_days)):
                if d >= month_start and not counted:
                    counted = self._month_end_stocktake()
                self._day(d, i, finish=True)
            if not counted:
                self._month_end_stocktake()
            if menu_services.day_status(self.today) == menu_services.MENU:
                self._day(self.today, 0, finish=False)
            self._next_week()
            for d in self._school_days(start, self.today + timedelta(days=1)):
                menu_services.snapshot_day(d)
            audit.record(None, ACTION, "system", "", "Nạp dữ liệu mẫu một tháng (seed_month)", actor=self.user)
            self._verify(negative_before)
            if opts["dry_run"]:
                transaction.set_rollback(True)

        s = self.stats
        self.stdout.write(self.style.SUCCESS(
            ("DIỄN TẬP (đã rollback, không ghi gì) — " if opts["dry_run"] else "") + f"Xong từ {start:%d/%m/%Y}: lấp {len(backfill)} ngày học, đóng {s['closed']} ngày, {s['orders']} đơn đặt, "
            f"{s['receipts']} phiếu nhập, {s['issues']} phiếu xuất, {s['stocktakes']} kiểm kê, "
            f"mở trước {s['upcoming']} ngày tới."))

    # ------------------------------------------------------------------ lịch và thực đơn
    def _school_days(self, start, end):
        """Ngày học trong [start, end)."""
        days, d = [], start
        while d < end:
            if menu_services.day_status(d) == menu_services.MENU:
                days.append(d)
            d += timedelta(days=1)
        return days

    def _menu_from(self, start):
        """Thực đơn áp dụng từ start nếu trước đó chưa có. Trigger be03 khóa version đã có hiệu lực: tạm lùi
        đồng hồ của trigger trong transaction này rồi chạy lại đúng định nghĩa cũ (pg_get_functiondef)."""
        if MenuVersion.objects.filter(effective_from__lte=start).exists():
            return
        dishes = {d.code: d for d in Dish.objects.filter(code__in={c for codes in MENU.values() for c in codes})}
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_get_functiondef('be03_menu_today'::regproc)")
            original = cursor.fetchone()[0]
            cursor.execute("CREATE OR REPLACE FUNCTION be03_menu_today() RETURNS date AS $$ "
                           f"SELECT DATE '{(start - timedelta(days=1)).isoformat()}'; $$ LANGUAGE sql STABLE;")
            version = MenuVersion.objects.create(effective_from=start, created_by=self.user,
                                                 note="Thực đơn mẫu (nạp bù cho các tuần trước)")
            MenuVersionItem.objects.bulk_create([
                MenuVersionItem(version=version, weekday=w, dish=dishes[c], position=i)
                for w, codes in MENU.items() for i, c in enumerate(codes)
            ])
            cursor.execute(original)

    # ------------------------------------------------------------------ một ngày ăn
    def _set_counts(self, day, kind):
        """Điền các ô còn trống (không đè số người dùng đã nhập) rồi chốt."""
        for row in ClassMealCount.objects.filter(lunch_day=day, **{f"{kind}__isnull": True}).order_by("id"):
            base = row.enrolled_snapshot if kind == lunch.PLANNED else (row.planned or 0)
            ClassMealCount.objects.filter(pk=row.pk).update(**{kind: max(0, base - self.rng.randint(0, 2))})
        if getattr(day, f"staff_{kind}") is None:
            LunchDay.objects.filter(pk=day.pk).update(**{f"staff_{kind}": STAFF}, version=F("version") + 1)
        day.refresh_from_db()
        return lunch.confirm_counts(day.id, kind, self.user, day.version)

    def _revision(self, day):
        revision = DemandRevision.objects.filter(lunch_day=day, status=DemandRevision.Status.APPROVED).first()
        if revision is not None and not demand_services.is_outdated(revision):
            return revision
        reserves = {}
        if day.date.weekday() == 0:  # thứ Hai nấu dư cơm phòng học sinh ăn thêm
            reserves[self.foods["GAO"].id] = (RICE_RESERVE, "Dự phòng cơm thêm đầu tuần")
        revision = demand_services.calculate(day.date, self.user, reserves)
        return demand_services.approve(revision.id, self.user)

    def _day(self, d, i, finish):
        day = lunch.open_lunch_day(d)
        if LunchDayClose.objects.filter(lunch_day=day, reopened_at__isnull=True).exists():
            return
        if day.planned_confirmed_at is None:
            day = self._set_counts(day, lunch.PLANNED)
        if not Issue.objects.filter(lunch_day=day, status=Issue.Status.POSTED).exists():
            revision = self._revision(day)
            self._fresh_orders(revision, d, i)
            issue = day_services.create_day_issue(d, self.user)
            services.post_issue(issue.id, self.user)
            self.stats["issues"] += 1
        if not finish:
            return
        day.refresh_from_db()
        if day.actual_confirmed_at is None:
            self._set_counts(day, lunch.ACTUAL)
        summary = day_services.day_cost(d)
        extra = [f for f in summary["foods"] if Decimal(f["variance"]) != 0]
        note = "; ".join(f"Xuất thêm {f['variance']} {f['unit']} {f['food_name'].lower()} (dự phòng)" for f in extra)
        day_services.close_day(d, note, self.user)
        self.stats["closed"] += 1

    # ------------------------------------------------------------------ đơn đặt và nhận hàng
    def _order(self, supplier_code, expected, lines, note, order_day=None):
        """lines: [(food_code, qty)]. Mã đơn theo ngày đặt (hôm trước ngày giao) cho dữ liệu nạp bù."""
        order = purchase_services.create(
            self.suppliers[supplier_code].id, expected,
            [(self.foods[c].id, q, PRICE[c]) for c, q in lines], self.user, note=note)
        if order_day is not None:
            PurchaseOrder.objects.filter(pk=order.pk).update(code=purchase_services._next_code(order_day))
            order.refresh_from_db()
        self.stats["orders"] += 1
        return order

    def _send(self, order):
        order = purchase_services.approve(order.id, order.version)
        return purchase_services.mark_sent(order.id, order.version)

    def _receive(self, order, d, part=None, price_factor=Decimal("1")):
        """Nhận và chốt một phiếu theo đơn: part=None nhận hết phần còn chờ, part=Decimal là tỉ lệ."""
        lines = []
        for pl in order.lines.select_related("food").order_by("id"):
            qty = pl.qty_open if part is None else (pl.qty_open * part).quantize(TENTH, rounding=ROUND_HALF_UP)
            if qty > 0:
                price = (PRICE[pl.food.code] * price_factor / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 100
                lines.append((pl.id, qty, price))
        receipt = purchase_services.create_receipt(order.id, d, lines, self.user)
        services.post_receipt(receipt.id, self.user)
        self.stats["receipts"] += 1

    def _jitter(self):
        return Decimal(1) + Decimal(self.rng.randint(-5, 8)) / 100

    def _fresh_orders(self, revision, d, i):
        """Rau/thịt mua tươi theo ngày: đặt (nhu cầu + 5%, làm tròn 0,1) hôm trước, nhận sáng ngày ăn.
        Mẫu xoay vòng: rau nhận 2 đợt (i % 4 == 1); thịt NCC giao vừa đủ dùng rồi đóng phần thiếu (i % 4 == 3)."""
        by_code = {l.food.code: l for l in revision.lines.select_related("food")}
        order_day = d - timedelta(days=3 if d.weekday() == 0 else 1)
        for supplier_code in ("NCC_THIT", "NCC_RAU"):
            needs = {c: l.required_qty + l.reserve_qty for c, l in by_code.items()
                     if c in FRESH and OWNER[c] == supplier_code}
            if not needs:
                continue
            lines = [(c, (q * Decimal("1.05")).quantize(TENTH, rounding=ROUND_CEILING)) for c, q in sorted(needs.items())]
            order = self._send(self._order(supplier_code, d, lines, f"Rau, thịt tươi cho bữa trưa {d:%d/%m/%Y}",
                                           order_day=order_day))
            factor = self._jitter()
            if supplier_code == "NCC_RAU" and i % 4 == 1:
                self._receive(order, d, part=Decimal("0.6"), price_factor=factor)
                order.refresh_from_db()
                self._receive(order, d, price_factor=factor)
            elif supplier_code == "NCC_THIT" and i % 4 == 3:
                short = []
                for pl in order.lines.select_related("food").order_by("id"):
                    qty = needs[pl.food.code].quantize(TENTH, rounding=ROUND_CEILING)
                    price = (PRICE[pl.food.code] * factor / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 100
                    short.append((pl.id, min(qty, pl.qty_open), price))
                receipt = purchase_services.create_receipt(order.id, d, short, self.user, note="NCC giao thiếu")
                services.post_receipt(receipt.id, self.user)
                self.stats["receipts"] += 1
                order.refresh_from_db()
                if order.status == PurchaseOrder.Status.SENT:
                    purchase_services.close_remaining(order.id, order.version,
                                                      "NCC giao thiếu, phần đã nhận đủ dùng cho ngày ăn")
            else:
                self._receive(order, d, price_factor=factor)

    def _dry_goods(self, backfill):
        """Hàng khô (gạo, gia vị, trứng, sữa chua) cho cả kỳ nạp bù: đặt 2 ngày trước ngày đầu, nhận hôm trước."""
        servings = sum(SchoolClass.objects.filter(is_active=True).values_list("enrolled", flat=True)) + STAFF
        total = defaultdict(Decimal)
        for d in backfill:
            menu = menu_services.menu_for_date(d, take_snapshot=False)
            for fid, q in demand_services.required_by_food(servings, menu).items():
                total[fid] += q
            if d.weekday() == 0:
                total[self.foods["GAO"].id] += RICE_RESERVE
        by_id = {f.id: c for c, f in self.foods.items()}
        receive_on = backfill[0] - timedelta(days=1)
        groups = defaultdict(list)
        for fid, q in total.items():
            code = by_id.get(fid)
            if code and code not in FRESH:
                groups[OWNER[code]].append((code, (q * Decimal("1.1")).quantize(Decimal("1"), rounding=ROUND_CEILING)))
        for supplier_code, lines in sorted(groups.items()):
            order = self._send(self._order(supplier_code, receive_on, sorted(lines), "Hàng khô đầu kỳ",
                                           order_day=receive_on - timedelta(days=1)))
            self._receive(order, receive_on)

    # ------------------------------------------------------------------ kiểm kê, tuần tới
    def _month_end_stocktake(self):
        """Kiểm kê ngày học cuối của tháng trước (vd 30/09 khi hôm nay 02/10); đã có chứng từ muộn hơn thì kiểm kê
        vào ngày chứng từ muộn nhất, để số tồn chụp đúng là tồn của ngày kiểm kê."""
        d = self.today.replace(day=1) - timedelta(days=1)
        while menu_services.day_status(d) != menu_services.MENU:
            d -= timedelta(days=1)
        latest = StockTransaction.objects.order_by("-date").values_list("date", flat=True).first()
        if latest and latest > d:
            d = latest
        foods = [self.foods[c] for c in STOCKTAKE]
        note = f"Kiểm kê cuối tháng {d:%m/%Y}" if d < self.today.replace(day=1) else "Kiểm kê định kỳ"
        st = services.create_stocktake(sorted(f.id for f in foods), self.user, d, note)
        for item in st.items.select_related("food"):
            counted = max(Decimal("0"), item.snapshot_qty + STOCKTAKE[item.food.code])
            services.update_stocktake_item(item.id, str(counted.quantize(MILLI)))
        services.post_stocktake(st.id, self.user)
        self.stats["stocktakes"] += 1
        return True

    def _next_week(self):
        d, days = self.today + timedelta(days=1), []
        while len(days) < 5 and d < self.today + timedelta(days=30):
            if menu_services.day_status(d) == menu_services.MENU:
                days.append(d)
            d += timedelta(days=1)
        for i, d in enumerate(days):
            day = lunch.open_lunch_day(d)
            if day.planned_confirmed_at is None:
                self._set_counts(day, lunch.PLANNED)
                self.stats["upcoming"] += 1
            if i >= 3 or PurchaseOrder.objects.filter(expected_date=d).exists():
                continue
            revision = self._revision(day) if i < 2 else DemandRevision.objects.filter(lunch_day=day).first()
            lines = [] if revision is None else [
                (l.food.code, (l.required_qty * Decimal("1.05")).quantize(TENTH, rounding=ROUND_CEILING))
                for l in revision.lines.select_related("food") if l.food.code in FRESH and OWNER[l.food.code] == "NCC_RAU"]
            supplier = "NCC_RAU" if lines else "NCC_THIT"
            lines = lines or [("THIT_GA", Decimal("12.0")), ("CA_BASA", Decimal("8.0"))]
            order = self._order(supplier, d, lines,
                                f"Rau, thịt tươi cho bữa trưa {d:%d/%m/%Y}")
            if i == 0:
                self._send(order)  # đã gửi NCC, chờ nhận hàng sáng ngày ăn
            elif i == 2:
                order = purchase_services.approve(order.id, order.version)
                purchase_services.cancel(order.id, order.version, "NCC báo tăng giá, đặt lại nơi khác")
            # i == 1: để nháp

    # ------------------------------------------------------------------ tự kiểm tra trước khi commit
    def _negative_foods(self):
        """Mặt hàng có lúc tồn âm khi cộng dồn sổ kho theo (ngày chứng từ, id)."""
        balance, bad = defaultdict(Decimal), set()
        for fid, delta in StockTransaction.objects.order_by("date", "id").values_list("food_id", "quantity_delta"):
            balance[fid] += delta
            if balance[fid] < 0:
                bad.add(fid)
        return bad

    def _verify(self, negative_before):
        new_bad = self._negative_foods() - negative_before
        if new_bad:
            names = ", ".join(FoodItem.objects.filter(id__in=new_bad).values_list("name", flat=True))
            raise CommandError(f"Tồn theo ngày chứng từ bị âm ({names}); đã rollback, không ghi gì.")
        call_command("sf31_ledger_audit", "--strict", stdout=self.stdout)
