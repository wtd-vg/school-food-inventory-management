"""BE-09: đọc và kiểm tra đầu vào HTTP dùng chung (đóng ISSUE-004/005/006/008).

Quy ước lỗi API: {"message": "<câu tiếng Việt>", "errors": {"<field>": "<lý do>"}}.
- Body phải là JSON object; mảng/null/chuỗi → 400.
- Boolean chỉ nhận true/false JSON; "false" (chuỗi) → 400.
- Decimal chỉ nhận chuỗi số thập phân; float/bool/NaN/Infinity/"1e3" → 400. Thừa chữ số lẻ thì
  từ chối, không làm tròn âm thầm.
- `@json_api` đổi ngoại lệ đã biết thành mã HTTP; KHÔNG bắt Exception chung để không che lỗi lập trình.
"""

import json
import re
from datetime import date
from decimal import Decimal
from functools import wraps

from django.core.exceptions import ObjectDoesNotExist, PermissionDenied, ValidationError
from django.http import JsonResponse

DECIMAL_RE = re.compile(r"^-?\d+(\.\d+)?$")


class InputError(Exception):
    status = 400

    def __init__(self, message, errors=None):
        super().__init__(message)
        self.message = message
        self.errors = errors or {}


class Conflict(InputError):
    """Xung đột trạng thái/version → 409."""

    status = 409


def error(message, status=400, errors=None):
    body = {"message": message}
    if errors:
        body["errors"] = errors
    return JsonResponse(body, status=status)


def field_error(field, reason, message=None):
    return InputError(message or reason, {field: reason})


def _validation_payload(exc):
    if hasattr(exc, "error_dict"):
        errors = {k: " ".join(str(m) for m in v) for k, v in exc.message_dict.items()}
        return " ".join(errors.values()), errors
    return " ".join(str(m) for m in exc.messages), None


def json_api(view):
    """Ánh xạ ngoại lệ nghiệp vụ → JSON lỗi chuẩn. Đặt TRONG decorator quyền."""
    from .lunch import LunchVersionConflict
    from .services import InventoryConflict

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        try:
            return view(request, *args, **kwargs)
        except InputError as exc:
            return error(exc.message, exc.status, exc.errors)
        except (InventoryConflict, LunchVersionConflict) as exc:
            message, errors = _validation_payload(exc)
            return error(message, 409, errors)
        except ValidationError as exc:
            message, errors = _validation_payload(exc)
            return error(message, 400, errors)
        except ObjectDoesNotExist:
            return error("Không tìm thấy dữ liệu.", 404)
        except PermissionDenied as exc:
            return error(str(exc) or "Bạn không có quyền thực hiện thao tác này.", 403)

    return wrapper


def method_not_allowed():
    return error("Phương thức không được hỗ trợ.", 405)


# ---------------------------------------------------------------- body
def read_object(request):
    if not request.body:
        raise InputError("Thiếu dữ liệu JSON.")
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise InputError("Dữ liệu JSON không hợp lệ.")
    if not isinstance(data, dict):
        raise InputError("Dữ liệu gửi lên phải là một object JSON.")
    return data


def only_fields(data, allowed):
    extra = sorted(set(data) - set(allowed))
    if extra:
        raise InputError(
            "Có trường không được phép: " + ", ".join(extra) + ".",
            {name: "Trường không được phép." for name in extra},
        )


# ---------------------------------------------------------------- scalars
_MISSING = object()


def _get(data, key, required):
    value = data.get(key, _MISSING)
    if value is _MISSING:
        if required:
            raise field_error(key, "Trường này là bắt buộc.", f"Thiếu trường {key}.")
        return _MISSING
    return value


def req_str(data, key, max_len, required=True, allow_blank=False, upper=False, lower=False, label=None):
    value = _get(data, key, required)
    if value is _MISSING:
        return None
    if not isinstance(value, str):
        raise field_error(key, "Phải là chuỗi.", f"{label or key} phải là chuỗi.")
    value = value.strip()
    if not value and not allow_blank:
        raise field_error(key, "Không được để trống.", f"{label or key} không được để trống.")
    if len(value) > max_len:
        raise field_error(key, f"Tối đa {max_len} ký tự.", f"{label or key} tối đa {max_len} ký tự.")
    if upper:
        value = value.upper()
    if lower:
        value = value.lower()
    return value


def opt_bool(data, key):
    value = data.get(key, _MISSING)
    if value is _MISSING:
        return None
    if type(value) is not bool:
        raise field_error(key, "Chỉ nhận true hoặc false.", f"{key} chỉ nhận giá trị true hoặc false.")
    return value


def check_int(value, key, minimum=None, maximum=None, nullable=False, label=None):
    if value is None and nullable:
        return None
    if type(value) is not int:
        raise field_error(key, "Phải là số nguyên.", f"{label or key} phải là số nguyên.")
    if minimum is not None and value < minimum:
        raise field_error(key, f"Không được nhỏ hơn {minimum}.", f"{label or key} không được nhỏ hơn {minimum}.")
    if maximum is not None and value > maximum:
        raise field_error(key, f"Không được lớn hơn {maximum}.", f"{label or key} không được lớn hơn {maximum}.")
    return value


def req_int(data, key, minimum=None, maximum=None, required=True, nullable=False, label=None):
    value = _get(data, key, required)
    if value is _MISSING:
        return None
    return check_int(value, key, minimum, maximum, nullable, label)


def req_id(data, key, required=True, label=None):
    return req_int(data, key, minimum=1, required=required, label=label)


def check_decimal(value, key, max_digits, dp, positive=True, allow_zero=False, label=None):
    name = label or key
    if not isinstance(value, str):
        raise field_error(key, "Phải là số thập phân dạng chuỗi, ví dụ \"12.5\".", f"{name} phải là số thập phân dạng chuỗi.")
    text = value.strip()
    if not DECIMAL_RE.match(text):
        raise field_error(key, "Số thập phân không hợp lệ.", f"{name} không phải số thập phân hợp lệ.")
    number = Decimal(text)
    frac = text.split(".")[1] if "." in text else ""
    if len(frac.rstrip("0")) > dp:
        raise field_error(key, f"Tối đa {dp} chữ số sau dấu thập phân.", f"{name} chỉ được tối đa {dp} chữ số lẻ.")
    if abs(number) >= Decimal(10) ** (max_digits - dp):
        raise field_error(key, "Giá trị quá lớn.", f"{name} quá lớn.")
    if positive:
        if number < 0 or (number == 0 and not allow_zero):
            reason = "Không được âm." if allow_zero else "Phải lớn hơn 0."
            raise field_error(key, reason, f"{name}: {reason[0].lower()}{reason[1:]}")
    return number.quantize(Decimal(1).scaleb(-dp))


def req_decimal(data, key, max_digits, dp, positive=True, allow_zero=False, required=True, label=None):
    value = _get(data, key, required)
    if value is _MISSING:
        return None
    return check_decimal(value, key, max_digits, dp, positive, allow_zero, label)


def parse_iso_date(value, key="date", label=None):
    if not isinstance(value, str):
        raise field_error(key, "Ngày phải có dạng YYYY-MM-DD.", f"{label or key} phải có dạng YYYY-MM-DD.")
    try:
        if len(value) != 10:
            raise ValueError
        return date.fromisoformat(value)
    except ValueError:
        raise field_error(key, "Ngày không hợp lệ (YYYY-MM-DD).", f"{label or key} không hợp lệ (YYYY-MM-DD).")


def req_date(data, key="date", required=True, label=None):
    value = _get(data, key, required)
    if value is _MISSING:
        return None
    return parse_iso_date(value, key, label)


def req_list(data, key, min_len=1, required=True, label=None):
    value = _get(data, key, required)
    if value is _MISSING:
        return None
    if not isinstance(value, list):
        raise field_error(key, "Phải là danh sách.", f"{label or key} phải là danh sách.")
    if len(value) < min_len:
        raise field_error(key, f"Cần ít nhất {min_len} phần tử.", f"{label or key} cần ít nhất {min_len} dòng.")
    return value


def query_date(request, key):
    raw = request.GET.get(key)
    if not raw:
        return None
    return parse_iso_date(raw, key)


def query_int(request, key, minimum=1):
    raw = request.GET.get(key)
    if raw in (None, ""):
        return None
    if not raw.isdigit() or int(raw) < minimum:
        raise field_error(key, "Phải là số nguyên dương.", f"Tham số {key} phải là số nguyên dương.")
    return int(raw)


def client_ip(request):
    """IP người gọi. Chỉ tin X-Real-IP (nginx đặt từ CF-Connecting-IP) khi TRUST_PROXY_IP=true."""
    import ipaddress

    from django.conf import settings

    candidates = []
    if getattr(settings, "TRUST_PROXY_IP", False):
        candidates.append(request.META.get("HTTP_X_REAL_IP", "").strip())
    candidates.append((request.META.get("REMOTE_ADDR") or "").strip())
    for raw in candidates:
        try:
            return str(ipaddress.ip_address(raw))
        except ValueError:
            continue
    return None
