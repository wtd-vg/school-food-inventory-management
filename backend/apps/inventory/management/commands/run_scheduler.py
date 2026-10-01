"""BE-08: vòng lặp lịch gửi email thực đơn (service `scheduler` trong compose.prod.yaml).

Mỗi 60 giây:
- Ngày học (T2–T6) và đã qua MENU_SEND_TIME (mặc định 06:30 giờ Việt Nam) mà hôm nay chưa chạy → gửi.
  Container khởi động lại lúc 8h vẫn gửi bù trong ngày.
- Ngày nào có yêu cầu "Gửi lại" (dòng tổng pending) → chạy lại, chỉ gửi phần còn thiếu.
Dừng gọn khi nhận SIGTERM/SIGINT. --once: chạy một vòng rồi thoát (kiểm tra thủ công).
"""

import signal
import time as clock
from datetime import datetime

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from django.utils import timezone

from apps.inventory.models import NotificationLog
from apps.inventory.notifications import SUMMARY, send_daily_menu


class Command(BaseCommand):
    help = "Lịch gửi email thực đơn 06:30 mỗi ngày học và xử lý yêu cầu gửi lại."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--interval", type=int, default=60)

    def handle(self, *args, **options):
        self.stopping = False
        signal.signal(signal.SIGTERM, self._stop)
        signal.signal(signal.SIGINT, self._stop)
        hour, minute = (int(x) for x in settings.MENU_SEND_TIME.split(":"))
        self.stdout.write(f"Scheduler chạy: gửi lúc {hour:02d}:{minute:02d}, chế độ {settings.EMAIL_MODE}.")
        while not self.stopping:
            close_old_connections()
            try:
                self.tick(hour, minute)
            except Exception as exc:  # vòng lặp nền không được chết vì một lần lỗi; lỗi ghi ra log container
                self.stderr.write(f"Lỗi khi gửi: {type(exc).__name__}: {exc}")
            if options["once"]:
                break
            for _ in range(options["interval"]):
                if self.stopping:
                    break
                clock.sleep(1)

    def tick(self, hour, minute):
        now = timezone.localtime()
        today = now.date()
        due = now.time() >= datetime.min.replace(hour=hour, minute=minute).time()
        if due and not NotificationLog.objects.filter(date=today, email_hash=SUMMARY).exists():
            self.stdout.write(f"{today}: {send_daily_menu(today)}")
        for day in NotificationLog.objects.filter(email_hash=SUMMARY, status=NotificationLog.Status.PENDING,
                                                  date__lte=today).values_list("date", flat=True):
            self.stdout.write(f"{day} (gửi lại): {send_daily_menu(day)}")

    def _stop(self, *_):
        self.stopping = True
