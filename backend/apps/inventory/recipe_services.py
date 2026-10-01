"""BE-06 / SF50 / ISSUE-003: quy đổi định lượng và thay công thức món.

Định lượng lưu cho MỘT suất theo đơn vị kho của nguyên liệu, Decimal 6 số lẻ (RecipeComponent).
Chỉ quy đổi trong cùng loại đơn vị (khối lượng g↔kg, thể tích ml↔lít); kg↔lít không có quy tắc nên bị
từ chối. Kết quả vượt 6 số lẻ thì từ chối, không làm tròn âm thầm (ví dụ 0,0004 g).
"""

from decimal import Decimal

from django.db import transaction

from .http_input import Conflict, check_decimal, check_int, field_error
from .models import FoodItem, RecipeComponent

DP = 6
STEP = Decimal("0.000001")
DIMENSIONS = {
    "mass": {"kg": Decimal("1"), "g": Decimal("0.001")},
    "volume": {"lit": Decimal("1"), "l": Decimal("1"), "ml": Decimal("0.001")},
    "count": {"piece": Decimal("1")},
}
UNIT_LABELS = {"kg": "kg", "g": "g", "lit": "lít", "l": "lít", "ml": "ml", "piece": "cái"}


def _dimension(unit):
    for name, units in DIMENSIONS.items():
        if unit in units:
            return name
    return None


def allowed_units(food_unit):
    food_unit = food_unit.lower()
    dim = _dimension(food_unit)
    return sorted(DIMENSIONS[dim]) if dim else [food_unit]


def convert_to_base(food_unit, quantity, input_unit, key="quantity"):
    """quantity (Decimal) theo input_unit → Decimal theo food_unit, đúng 6 số lẻ."""
    food_unit, input_unit = food_unit.strip().lower(), str(input_unit).strip().lower()
    if input_unit == food_unit:
        factor = Decimal("1")
    else:
        dim = _dimension(food_unit)
        if dim is None or input_unit not in DIMENSIONS[dim]:
            raise field_error(
                key.replace("quantity", "unit"),
                f"Không quy đổi được {input_unit} sang {food_unit}.",
                f"Không quy đổi được đơn vị {input_unit} sang {UNIT_LABELS.get(food_unit, food_unit)} của nguyên liệu.",
            )
        factor = DIMENSIONS[dim][input_unit] / DIMENSIONS[dim][food_unit]
    result = quantity * factor
    if result != result.quantize(STEP):
        raise field_error(key, "Định lượng quá nhỏ hoặc quá nhiều chữ số lẻ.",
                          "Định lượng quy đổi vượt 6 chữ số lẻ, hãy nhập đơn vị lớn hơn hoặc làm tròn.")
    result = result.quantize(STEP)
    if result <= 0:
        raise field_error(key, "Phải lớn hơn 0.", "Định lượng phải lớn hơn 0.")
    if result >= Decimal("100000000"):
        raise field_error(key, "Giá trị quá lớn.", "Định lượng quá lớn.")
    return result


def parse_components(raw):
    """Kiểm tra danh sách dòng công thức; trả [(food, quantity_base)] theo thứ tự nhập."""
    if not isinstance(raw, list) or not raw:
        raise field_error("components", "Cần ít nhất một nguyên liệu.", "Công thức cần ít nhất một nguyên liệu.")
    food_ids, rows = [], []
    for i, comp in enumerate(raw):
        key = f"components[{i}]"
        if not isinstance(comp, dict):
            raise field_error(key, "Phải là object.", f"Dòng nguyên liệu {i + 1} không hợp lệ.")
        extra = sorted(set(comp) - {"food_id", "quantity", "unit"})
        if extra:
            raise field_error(key, "Trường không được phép: " + ", ".join(extra), f"Dòng {i + 1} có trường không được phép.")
        food_id = check_int(comp.get("food_id"), f"{key}.food_id", minimum=1, label=f"Nguyên liệu dòng {i + 1}")
        if food_id in food_ids:
            raise field_error(f"{key}.food_id", "Trùng nguyên liệu.", f"Dòng {i + 1}: nguyên liệu bị lặp trong công thức.")
        food_ids.append(food_id)
        quantity = check_decimal(comp.get("quantity"), f"{key}.quantity", 17, DP, label=f"Định lượng dòng {i + 1}")
        unit = comp.get("unit")
        if not isinstance(unit, str) or not unit.strip():
            raise field_error(f"{key}.unit", "Thiếu đơn vị.", f"Dòng {i + 1}: thiếu đơn vị.")
        rows.append((food_id, quantity, unit, key))
    foods = {f.id: f for f in FoodItem.objects.filter(id__in=food_ids)}
    result = []
    for food_id, quantity, unit, key in rows:
        food = foods.get(food_id)
        if food is None:
            raise field_error(f"{key}.food_id", "Không tồn tại.", f"Nguyên liệu #{food_id} không tồn tại.")
        result.append((food, convert_to_base(food.unit, quantity, unit, f"{key}.quantity")))
    return result


@transaction.atomic
def replace_components(dish, components):
    """Thay toàn bộ công thức (dish đã được khóa bởi caller). Ngày đã chụp thực đơn giữ bản cũ."""
    dish.components.all().delete()
    RecipeComponent.objects.bulk_create([
        RecipeComponent(dish=dish, food=food, quantity=qty) for food, qty in components
    ])


def component_payload(comp):
    return {
        "food_id": comp.food_id,
        "food_name": comp.food.name,
        "food_unit": comp.food.unit,
        "quantity": str(comp.quantity),
    }


def ensure_dish_can_deactivate(dish):
    from django.utils import timezone

    from .models import MenuVersion

    today = timezone.localdate()
    current = MenuVersion.objects.filter(effective_from__lte=today).order_by("-effective_from").first()
    active_versions = MenuVersion.objects.filter(effective_from__gt=today)
    if current is not None:
        active_versions = active_versions | MenuVersion.objects.filter(pk=current.pk)
    if dish.menu_items.filter(version__in=active_versions).exists():
        raise Conflict("Món đang có trong thực đơn hiện hành hoặc sắp áp dụng; sửa thực đơn trước khi ngừng dùng món.")

