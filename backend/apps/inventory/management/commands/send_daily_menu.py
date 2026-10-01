"""BE-08: gửi email thực đơn của một ngày (mặc định hôm nay).

    python manage.py send_daily_menu
    python manage.py send_daily_menu --date 2026-10-06
Chạy lại an toàn: email đã gửi (hoặc đã ghi dry_run) trong ngày không gửi lần hai.
"""

from django.core.management.base import BaseCommand, CommandError

from apps.inventory.http_input import InputError, parse_iso_date
from apps.inventory.menu_services import today
from apps.inventory.notifications import send_daily_menu


class Command(BaseCommand):
    help = "Gửi email thực đơn bữa trưa cho phụ huynh (EMAIL_MODE=dry_run chỉ ghi nhật ký)."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="YYYY-MM-DD, mặc định hôm nay (giờ Việt Nam).")

    def handle(self, *args, **options):
        try:
            day = parse_iso_date(options["date"]) if options["date"] else today()
        except InputError as exc:
            raise CommandError(exc.message)
        stats = send_daily_menu(day)
        self.stdout.write(f"{day}: " + ", ".join(f"{k}={v}" for k, v in stats.items()))
