"""BE-08: dựng email thực đơn cho phụ huynh và link hủy nhận (token ký số theo SECRET_KEY)."""

from django.conf import settings
from django.core import signing
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape

UNSUBSCRIBE_SALT = "schoolfood.unsubscribe"


def unsubscribe_token(email_hash):
    return signing.dumps({"h": email_hash}, salt=UNSUBSCRIBE_SALT)


def read_unsubscribe_token(token):
    """email_hash từ token; token sai/giả → ValueError. Token không hết hạn (link trong thư cũ vẫn dùng được)."""
    try:
        data = signing.loads(token, salt=UNSUBSCRIBE_SALT)
    except signing.BadSignature:
        raise ValueError("Link hủy nhận không hợp lệ.") from None
    email_hash = data.get("h") if isinstance(data, dict) else None
    if not isinstance(email_hash, str) or len(email_hash) != 64:
        raise ValueError("Link hủy nhận không hợp lệ.")
    return email_hash


def build_menu_email(to_email, email_hash, day, children, connection=None):
    """day: dict của menu_services.menu_for_date; children: tên các bé của chính phụ huynh này."""
    base = settings.PUBLIC_BASE_URL
    token = unsubscribe_token(email_hash)
    page_link = f"{base}/huy-nhan/{token}"
    one_click = f"{base}/api/unsubscribe/{token}/"
    date_text = f"{day['weekday_label']}, {day['date'][8:10]}/{day['date'][5:7]}/{day['date'][:4]}"
    dishes = [d["dish_name"] for d in day["dishes"]]
    school = settings.SCHOOL_NAME
    kids = ", ".join(children)

    text = "\n".join([
        f"{school} — thực đơn bữa trưa {date_text}",
        "",
        *[f"- {name}" for name in dishes],
        "",
        f"Áp dụng cho bé: {kids}",
        "",
        f"Không muốn nhận email này nữa: {page_link}",
    ])
    html = (
        '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2933">'
        f'<p style="margin:0 0 4px;color:#52606d">{escape(school)}</p>'
        f'<h2 style="margin:0 0 12px;font-size:20px">Thực đơn bữa trưa {escape(date_text)}</h2>'
        '<ul style="padding-left:20px;margin:0 0 16px">'
        + "".join(f"<li>{escape(name)}</li>" for name in dishes)
        + "</ul>"
        f"<p style=\"margin:0 0 16px\">Áp dụng cho bé: <strong>{escape(kids)}</strong></p>"
        f'<p style="font-size:13px;color:#7b8794">Không muốn nhận email này nữa? '
        f'<a href="{escape(page_link)}">Hủy nhận</a>.</p></div>'
    )
    message = EmailMultiAlternatives(
        subject=f"Thực đơn bữa trưa {date_text}",
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
        headers={
            "List-Unsubscribe": f"<{one_click}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        connection=connection,
    )
    message.attach_alternative(html, "text/html")
    return message
