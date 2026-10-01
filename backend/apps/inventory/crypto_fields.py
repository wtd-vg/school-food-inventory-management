"""BE-04 (R11): mã hóa email phụ huynh và chuẩn hóa/băm để tìm trùng mà không giải mã.

- FIELD_ENCRYPTION_KEYS: danh sách khóa Fernet, phân cách bằng dấu phẩy. Khóa ĐẦU dùng để mã hóa, mọi
  khóa dùng để giải mã → xoay khóa bằng cách thêm khóa mới lên đầu (MultiFernet).
- CONTACT_HASH_KEY: khóa HMAC cho email_hash (chống trùng, chống gửi lặp).
- Mất khóa = mất toàn bộ email: cất khóa ngoài server (docs/SECURITY.md).
"""

import hashlib
import hmac
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email


@lru_cache(maxsize=None)
def _fernet(keys):
    return MultiFernet([Fernet(k.strip().encode()) for k in keys.split(",") if k.strip()])


def encrypt(text):
    return _fernet(settings.FIELD_ENCRYPTION_KEYS).encrypt(text.encode()).decode()


def decrypt(token):
    try:
        return _fernet(settings.FIELD_ENCRYPTION_KEYS).decrypt(token.encode()).decode()
    except InvalidToken:
        raise ValueError("Không giải mã được: sai khóa FIELD_ENCRYPTION_KEYS.") from None


def contact_hash(email):
    return hmac.new(settings.CONTACT_HASH_KEY.encode(), email.encode(), hashlib.sha256).hexdigest()


def normalize_email(raw):
    """strip + viết thường + kiểm định dạng. Không bỏ dấu chấm của Gmail (đổi người nhận)."""
    if not isinstance(raw, str):
        raise ValueError("Email phải là chuỗi.")
    email = raw.strip().lower()
    if not email or len(email) > 254:
        raise ValueError("Email không hợp lệ.")
    try:
        validate_email(email)
    except ValidationError:
        raise ValueError(f"Email không hợp lệ: {raw.strip()[:60]}") from None
    return email


def email_hint(email):
    """"nguyenvana@gmail.com" → "ng•••@gmail.com"."""
    local, _, domain = email.partition("@")
    return f"{local[:2]}•••@{domain}"[:80]
