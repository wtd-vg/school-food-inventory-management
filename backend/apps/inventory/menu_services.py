"""BE-07 / SF52 (R10): thực đơn cố định theo thứ, ngày nghỉ, bản chụp theo ngày.

- Chủ nhật và ngày trong SchoolHoliday là ngày nghỉ. Thứ Bảy (SF79) là ngày ăn khi version áp dụng cho ngày đó
  có món Thứ Bảy (hoặc ngày đó đã có bản chụp); version không có món Thứ Bảy thì Thứ Bảy nghỉ như trước.
- Thực đơn của ngày D: bản chụp DayMenuSnapshot nếu đã có; nếu chưa thì lấy MenuVersion mới nhất có
  effective_from ≤ D (theo thứ của D) với công thức hiện hành.
- snapshot_day(D) chụp một lần cho ngày đã tới (D ≤ hôm nay); sửa công thức sau đó không đổi ngày cũ.
- Sửa thực đơn = tạo version mới áp dụng từ ngày mai trở đi; version đã có hiệu lực là lịch sử.
Ngày "hôm nay" theo giờ Việt Nam (TIME_ZONE).
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from .http_input import Conflict, InputError, check_int, field_error
from .models import SATURDAY, WEEKDAY_LABELS, DayMenuSnapshot, Dish, MenuVersion, MenuVersionItem, SchoolHoliday

MENU, WEEKEND, HOLIDAY = "menu", "weekend", "holiday"
DAY_NAMES = ("Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật")


def today():
    return timezone.localdate()


def saturday_has_menu(d):
    """Thứ Bảy d có bữa trưa không: đã chụp thực đơn, hoặc version áp dụng cho d có món Thứ Bảy."""
    if DayMenuSnapshot.objects.filter(date=d).exists():
        return True
    version = version_for(d)
    return version is not None and version.items.filter(weekday=SATURDAY).exists()


def is_weekend(d):
    return d.weekday() > SATURDAY or (d.weekday() == SATURDAY and not saturday_has_menu(d))


def day_status(d):
    if is_weekend(d):
        return WEEKEND
    if SchoolHoliday.objects.filter(date=d).exists():
        return HOLIDAY
    return MENU


def version_for(d):
    return MenuVersion.objects.filter(effective_from__lte=d).order_by("-effective_from").first()


def build_items(version, weekday):
    """Món của một thứ trong version, kèm công thức HIỆN HÀNH (dạng lưu được vào JSON)."""
    if version is None or weekday > SATURDAY:
        return []
    items = (MenuVersionItem.objects.filter(version=version, weekday=weekday)
             .select_related("dish").prefetch_related("dish__components__food").order_by("position", "id"))
    return [
        {
            "dish_id": item.dish_id,
            "dish_name": item.dish.name,
            "components": [
                {"food_id": c.food_id, "food_name": c.food.name, "unit": c.food.unit, "quantity": str(c.quantity)}
                for c in item.dish.components.all()
            ],
        }
        for item in items
    ]


def _day(d, status, items, source, version_id):
    return {
        "date": d.isoformat(),
        "weekday": d.weekday(),
        "weekday_label": DAY_NAMES[d.weekday()],
        "status": status,
        "source": source,
        "menu_version_id": version_id,
        "holiday_name": SchoolHoliday.objects.filter(date=d).values_list("name", flat=True).first() if status == HOLIDAY else None,
        "dishes": items,
    }


@transaction.atomic
def snapshot_day(d):
    """Chụp thực đơn ngày d (idempotent). None nếu ngày nghỉ, chưa tới, hoặc chưa có thực đơn."""
    existing = DayMenuSnapshot.objects.filter(date=d).first()
    if existing:
        return existing
    if d > today() or day_status(d) != MENU:
        return None
    version = version_for(d)
    if version is None:
        return None
    try:
        with transaction.atomic():
            return DayMenuSnapshot.objects.create(date=d, menu_version=version, items=build_items(version, d.weekday()))
    except IntegrityError:  # tiến trình khác vừa chụp cùng ngày
        return DayMenuSnapshot.objects.get(date=d)


def menu_for_date(d, take_snapshot=True):
    status = day_status(d)
    if status != MENU:
        return _day(d, status, [], None, None)
    snap = snapshot_day(d) if take_snapshot else DayMenuSnapshot.objects.filter(date=d).first()
    if snap is not None:
        return _day(d, MENU, snap.items, "snapshot", snap.menu_version_id)
    version = version_for(d)
    if version is None:
        return _day(d, MENU, [], "none", None)
    return _day(d, MENU, build_items(version, d.weekday()), "version", version.id)


def week_start(d):
    return d - timedelta(days=d.weekday())


def week(d):
    start = week_start(d)
    return {"week_start": start.isoformat(), "days": [menu_for_date(start + timedelta(days=i)) for i in range(7)]}


def version_payload(version):
    items = list(version.items.select_related("dish").order_by("weekday", "position", "id"))
    nxt = MenuVersion.objects.filter(effective_from__gt=version.effective_from).order_by("effective_from").first()
    return {
        "id": version.id,
        "effective_from": version.effective_from.isoformat(),
        "effective_to": (nxt.effective_from - timedelta(days=1)).isoformat() if nxt else None,
        "note": version.note,
        "created_by": version.created_by.get_username(),
        "created_at": version.created_at.isoformat(),
        "is_editable": version.effective_from > today(),
        "is_current": version.effective_from <= today() and (nxt is None or nxt.effective_from > today()),
        # "0"–"4" luôn có; "5" (Thứ Bảy) chỉ có khi version có món Thứ Bảy (SF79, tương thích client cũ).
        "days": {
            str(w): [{"dish_id": i.dish_id, "dish_name": i.dish.name} for i in items if i.weekday == w]
            for w in range(SATURDAY + 1)
            if w < SATURDAY or any(i.weekday == w for i in items)
        },
    }


def parse_days(days):
    """{"0": [dish_id…], …, "4": […], "5"?: […]} → {weekday: [Dish…]}.

    Bắt buộc đủ Thứ Hai–Thứ Sáu ("0"–"4"); Thứ Bảy ("5") tuỳ chọn (SF79). Mỗi thứ có mặt cần ≥ 1 món có công thức.
    """
    if not isinstance(days, dict):
        raise field_error("days", "Phải là object theo thứ 0–5.", "Thực đơn phải gồm Thứ Hai đến Thứ Sáu (Thứ Bảy tuỳ chọn).")
    required = {str(w) for w in range(5)}
    allowed = required | {str(SATURDAY)}
    extra = sorted(set(days) - allowed)
    if extra:
        raise InputError(
            "Thực đơn chỉ gồm Thứ Hai đến Thứ Bảy; Chủ nhật luôn nghỉ.",
            {"days": f"Khóa không hợp lệ: {', '.join(map(str, extra))}. Chỉ nhận 0–5."},
        )
    missing = sorted(required - set(days))
    if missing:
        raise InputError(
            f"Thực đơn phải có đủ Thứ Hai đến Thứ Sáu, thiếu: {', '.join(WEEKDAY_LABELS[int(m)] for m in missing)}.",
            {"days": "Cần đủ các khóa 0–4; khóa 5 (Thứ Bảy) tuỳ chọn."},
        )
    all_ids, result = set(), {}
    for key in sorted(days):
        ids = days[key]
        label = WEEKDAY_LABELS[int(key)]
        if not isinstance(ids, list) or not ids:
            raise field_error(f"days.{key}", "Cần ít nhất một món.", f"{label} cần ít nhất một món.")
        seen = []
        for i, dish_id in enumerate(ids):
            check_int(dish_id, f"days.{key}[{i}]", minimum=1, label=f"Món {label}")
            if dish_id in seen:
                raise field_error(f"days.{key}", "Trùng món.", f"{label} có món bị lặp.")
            seen.append(dish_id)
        result[int(key)] = seen
        all_ids.update(seen)
    dishes = {d.id: d for d in Dish.objects.filter(id__in=all_ids).prefetch_related("components")}
    for weekday, ids in result.items():
        for dish_id in ids:
            dish = dishes.get(dish_id)
            label = WEEKDAY_LABELS[weekday]
            if dish is None:
                raise field_error(f"days.{weekday}", "Món không tồn tại.", f"{label}: món #{dish_id} không tồn tại.")
            if not dish.is_active:
                raise field_error(f"days.{weekday}", "Món đã ngừng dùng.", f"{label}: món {dish.name} đã ngừng dùng.")
            if not dish.components.all():
                raise field_error(f"days.{weekday}", "Món chưa có công thức.", f"{label}: món {dish.name} chưa có công thức.")
    return {w: [dishes[i] for i in ids] for w, ids in result.items()}


@transaction.atomic
def create_menu_version(effective_from, days, user, note=""):
    if effective_from <= today():
        raise field_error("effective_from", "Phải từ ngày mai trở đi.",
                          "Ngày áp dụng phải từ ngày mai trở đi; thực đơn đã áp dụng là lịch sử, không sửa lùi.")
    parsed = parse_days(days)
    if MenuVersion.objects.filter(effective_from=effective_from).exists():
        raise Conflict(f"Đã có thực đơn áp dụng từ {effective_from:%d/%m/%Y}. Xóa bản đó trước khi tạo lại.")
    version = MenuVersion.objects.create(effective_from=effective_from, note=note, created_by=user)
    MenuVersionItem.objects.bulk_create([
        MenuVersionItem(version=version, weekday=w, dish=dish, position=i)
        for w, dishes in parsed.items() for i, dish in enumerate(dishes)
    ])
    return version


@transaction.atomic
def delete_future_version(version_id):
    version = MenuVersion.objects.select_for_update().get(id=version_id)
    if version.effective_from <= today():
        raise Conflict("Thực đơn đã áp dụng là lịch sử, không xóa được.")
    version.delete()
    return version


@transaction.atomic
def add_holiday(d, name, user):
    if d < today():
        raise field_error("date", "Không thêm ngày nghỉ trong quá khứ.", "Không thêm ngày nghỉ cho ngày đã qua.")
    if is_weekend(d):
        raise field_error("date", "Ngày này đã là ngày nghỉ.",
                          "Chủ nhật và Thứ Bảy không có thực đơn đã là ngày nghỉ mặc định.")
    if DayMenuSnapshot.objects.filter(date=d).exists():
        raise Conflict("Ngày này đã có thực đơn được chụp/gửi, không đổi thành ngày nghỉ được.")
    try:
        with transaction.atomic():
            return SchoolHoliday.objects.create(date=d, name=name, created_by=user)
    except IntegrityError:
        raise Conflict(f"Ngày {d:%d/%m/%Y} đã là ngày nghỉ.")


@transaction.atomic
def delete_holiday(holiday_id):
    holiday = SchoolHoliday.objects.select_for_update().get(id=holiday_id)
    if holiday.date <= today():
        raise Conflict("Chỉ xóa được ngày nghỉ trong tương lai.")
    holiday.delete()
    return holiday


def holiday_payload(h):
    return {"id": h.id, "date": h.date.isoformat(), "name": h.name, "is_editable": h.date > today()}

