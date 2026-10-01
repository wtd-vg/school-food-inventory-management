"""BE-08: gửi email thực đơn của một ngày (mặc định hôm nay).

    python manage.py send_daily_menu
    python manage.py send_daily_menu --date 2026-10-06
    python manage.py send_daily_menu --preview     # BE-17: chạy thử, không gửi, không ghi gì
Chạy lại an toàn: email đã gửi (hoặc đã ghi dry_run) trong ngày không gửi lần hai.

--preview ép EMAIL_MODE=dry_run và rollback toàn bộ (nhật ký, bản chụp thực đơn). Không dùng chế độ thử
thường trên production: dòng dry_run ghi lại sẽ khiến lần gửi thật 06:30 cùng ngày bỏ qua email đó.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.test.utils import override_settings

from apps.inventory.http_input import InputError, parse_iso_date
from apps.inventory.menu_services import today
from apps.inventory.notifications import send_daily_menu


class Command(BaseCommand):
    help = "Gửi email thực đơn bữa trưa cho phụ huynh (EMAIL_MODE=dry_run chỉ ghi nhật ký)."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="YYYY-MM-DD, mặc định hôm nay (giờ Việt Nam).")
        parser.add_argument("--preview", action="store_true",
                            help="Chạy thử: không gửi thư, không ghi nhật ký (rollback).")

    def handle(self, *args, **options):
        try:
            day = parse_iso_date(options["date"]) if options["date"] else today()
        except InputError as exc:
            raise CommandError(exc.message)
        if options["preview"]:
            with override_settings(EMAIL_MODE="dry_run"), transaction.atomic():
                stats = send_daily_menu(day)
                transaction.set_rollback(True)
            self.stdout.write(f"{day} (xem trước, không ghi): " + ", ".join(f"{k}={v}" for k, v in stats.items()))
            return
        stats = send_daily_menu(day)
        self.stdout.write(f"{day}: " + ", ".join(f"{k}={v}" for k, v in stats.items()))
