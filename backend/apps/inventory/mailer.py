"""BE-08 / SF74: thư thực đơn cho phụ huynh (kèm ảnh suất ăn thực tế) và link hủy nhận (token ký số theo SECRET_KEY).

Mẫu thư dùng bảng + CSS inline (Gmail/Outlook bỏ <style> và flex). Ảnh nhúng inline bằng Content-ID
(multipart/related): phụ huynh xem được ngay mà không cần đăng nhập, không có link ảnh công khai.
Màu lấy từ design tokens "Bếp Nhà Trường" (frontend/src/styles/tokens.css).
"""

from email.mime.image import MIMEImage

from django.conf import settings
from django.core import signing
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape

UNSUBSCRIBE_SALT = "schoolfood.unsubscribe"

BG, SURFACE, LINE, BRAND, WARM = "#FFF8EC", "#FFFFFF", "#EADFC9", "#FFC93C", "#FFF6E0"
INK, MUTED, LINK, NUM_BG = "#2A2522", "#6B5F55", "#1D4F87", "#FFE9BF"
FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


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


def date_text(day):
    return f"{day['weekday_label']}, {day['date'][8:10]}/{day['date'][5:7]}/{day['date'][:4]}"


def subject_for(day, photos):
    return f"{'Thực đơn & hình ảnh' if photos else 'Thực đơn'} bữa trưa {date_text(day)}"


def _photo_cell(photo, src, width):
    caption = (f'<div style="padding-top:6px;font-size:13px;line-height:1.4;color:{MUTED}">{escape(photo["note"])}</div>'
               if photo["note"] else "")
    height = round(width * photo["height"] / photo["width"])
    return (f'<img src="{escape(src(photo))}" width="{width}" height="{height}" alt="{escape(photo["note"] or "Suất ăn thực tế")}" '
            f'style="display:block;width:100%;max-width:{width}px;height:auto;border:0;border-radius:12px">{caption}')


def _photos_block(photos, src):
    if not photos:
        return ""
    first, rest = photos[0], photos[1:]
    rows = [f'<tr><td colspan="2" style="padding:0 0 12px">{_photo_cell(first, src, 520)}</td></tr>']
    for i in range(0, len(rest), 2):
        pair = rest[i:i + 2]
        cells = "".join(
            f'<td width="50%" valign="top" style="padding:0 {6 if j == 0 else 0}px 12px {0 if j == 0 else 6}px">'
            f'{_photo_cell(p, src, 254)}</td>' for j, p in enumerate(pair))
        if len(pair) == 1:
            cells += '<td width="50%"></td>'
        rows.append(f"<tr>{cells}</tr>")
    return (
        f'<tr><td style="padding:8px 24px 4px">'
        f'<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:{MUTED}">'
        f'Hình ảnh suất ăn thực tế</div></td></tr>'
        f'<tr><td style="padding:8px 24px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="border-collapse:collapse">{"".join(rows)}</table></td></tr>'
    )


def render_menu_html(day, children, photos, src, unsubscribe_link):
    """HTML thư. photos: [{"note", "width", "height", ...}]; src(photo) → URL ảnh (cid: trong thư, data: khi xem trước)."""
    school = escape(settings.SCHOOL_NAME)
    kids = escape(", ".join(children))
    dishes = "".join(
        f'<tr><td width="40" valign="middle" style="padding:10px 0;border-top:{"0" if i == 1 else f"1px solid {LINE}"}">'
        f'<div style="width:28px;height:28px;line-height:28px;border-radius:14px;background:{NUM_BG};text-align:center;'
        f'font-size:14px;font-weight:700;color:{INK}">{i}</div></td>'
        f'<td valign="middle" style="padding:10px 0;border-top:{"0" if i == 1 else f"1px solid {LINE}"};font-size:17px;'
        f'font-weight:600;color:{INK}">{escape(d["dish_name"])}</td></tr>'
        for i, d in enumerate(day["dishes"], start=1)
    )
    intro = ("Nhà trường gửi phụ huynh thực đơn và hình ảnh suất ăn thực tế bữa trưa hôm nay của các con."
             if photos else "Nhà trường gửi phụ huynh thực đơn bữa trưa hôm nay của các con.")
    return (
        f'<!doctype html><html lang="vi"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(subject_for(day, photos))}</title></head>'
        f'<body style="margin:0;padding:0;background:{BG}">'
        f'<div style="display:none;max-height:0;overflow:hidden">{escape(", ".join(d["dish_name"] for d in day["dishes"]))}</div>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG};font-family:{FONT}">'
        f'<tr><td align="center" style="padding:24px 12px">'
        f'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;'
        f'background:{SURFACE};border:1px solid {LINE};border-radius:18px;overflow:hidden;border-collapse:separate">'
        # Đầu thư
        f'<tr><td style="background:{BRAND};padding:22px 24px">'
        f'<div style="font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:{INK}">🍚 {school}</div>'
        f'<div style="padding-top:6px;font-size:24px;line-height:1.25;font-weight:800;color:{INK}">Thực đơn bữa trưa</div>'
        f'<div style="padding-top:2px;font-size:16px;color:{INK}">{escape(date_text(day))}</div></td></tr>'
        # Lời chào
        f'<tr><td style="padding:22px 24px 6px;font-size:15px;line-height:1.55;color:{INK}">'
        f'Kính gửi phụ huynh bé <strong>{kids}</strong>,<br>{intro}</td></tr>'
        # Thực đơn
        f'<tr><td style="padding:12px 24px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:{WARM};border-radius:14px;border-collapse:separate"><tr><td style="padding:14px 18px">'
        f'<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:{MUTED};'
        f'padding-bottom:4px">Món ăn hôm nay</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
        f'{dishes}</table></td></tr></table></td></tr>'
        f'{_photos_block(photos, src)}'
        # Chân thư
        f'<tr><td style="padding:14px 24px 22px;font-size:14px;line-height:1.55;color:{INK}">'
        f'Chúc các con ăn ngon miệng!<br><span style="color:{MUTED}">Ban giám hiệu và bếp ăn {school}</span></td></tr>'
        f'<tr><td style="padding:14px 24px;background:{BG};border-top:1px solid {LINE};font-size:12px;line-height:1.5;color:{MUTED}">'
        f'Thư gửi từ hệ thống SchoolFood tới email phụ huynh đã đăng ký với nhà trường. '
        f'Không muốn nhận thư này nữa? <a href="{escape(unsubscribe_link)}" style="color:{LINK}">Hủy nhận</a>.</td></tr>'
        f'</table></td></tr></table></body></html>'
    )


def render_menu_text(day, children, photos, unsubscribe_link):
    return "\n".join([
        f"{settings.SCHOOL_NAME} — thực đơn bữa trưa {date_text(day)}",
        "",
        f"Kính gửi phụ huynh bé {', '.join(children)},",
        "",
        "Món ăn hôm nay:",
        *[f"{i}. {d['dish_name']}" for i, d in enumerate(day["dishes"], start=1)],
        "",
        *([f"Thư có {len(photos)} ảnh suất ăn thực tế (xem ở chế độ HTML).", ""] if photos else []),
        "Chúc các con ăn ngon miệng!",
        "",
        f"Không muốn nhận email này nữa: {unsubscribe_link}",
    ])


def build_menu_email(to_email, email_hash, day, children, connection=None, photos=()):
    """day: dict của menu_services.menu_for_date; children: tên các bé của chính phụ huynh này;
    photos: meal_photos.email_photos(...) — [{"cid", "data", "note", "width", "height"}]."""
    base = settings.PUBLIC_BASE_URL
    token = unsubscribe_token(email_hash)
    page_link = f"{base}/huy-nhan/{token}"
    one_click = f"{base}/api/unsubscribe/{token}/"
    photos = list(photos)
    message = EmailMultiAlternatives(
        subject=subject_for(day, photos),
        body=render_menu_text(day, children, photos, page_link),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
        headers={
            "List-Unsubscribe": f"<{one_click}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        connection=connection,
    )
    message.attach_alternative(render_menu_html(day, children, photos, lambda p: f"cid:{p['cid']}", page_link), "text/html")
    if photos:
        message.mixed_subtype = "related"
        for p in photos:
            image = MIMEImage(p["data"], "jpeg")
            image.add_header("Content-ID", f"<{p['cid']}>")
            image.add_header("Content-Disposition", "inline", filename=f"{p['cid'].split('@')[0]}.jpg")
            message.attach(image)
    return message
