"""BE-08: vòng lặp lịch gửi email thực đơn (service `scheduler` trong compose.prod.yaml).

Mỗi 60 giây:
- Ngày nào Quản lý bấm "Gửi thư cho phụ huynh" (dòng tổng pending) → gửi, chỉ gửi phần còn thiếu.
- Chỉ khi MENU_AUTO_SEND=true (mặc định tắt từ SF74): ngày học đã qua MENU_SEND_TIME mà chưa chạy → tự gửi.
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
    help = "Gửi email thực đơn khi Quản lý bấm gửi (và tự gửi 06:30 nếu MENU_AUTO_SEND=true)."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--interval", type=int, default=60)

    def handle(self, *args, **options):
        self.stopping = False
        signal.signal(signal.SIGTERM, self._stop)
        signal.signal(signal.SIGINT, self._stop)
        hour, minute = (int(x) for x in settings.MENU_SEND_TIME.split(":"))
        when = f"tự gửi lúc {hour:02d}:{minute:02d}" if settings.MENU_AUTO_SEND else "chỉ gửi khi Quản lý bấm"
        self.stdout.write(f"Scheduler chạy: {when}, chế độ {settings.EMAIL_MODE}.")
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
        if settings.MENU_AUTO_SEND and due and not NotificationLog.objects.filter(date=today, email_hash=SUMMARY).exists():
            self.stdout.write(f"{today}: {send_daily_menu(today)}")
        for day in NotificationLog.objects.filter(email_hash=SUMMARY, status=NotificationLog.Status.PENDING,
                                                  date__lte=today).values_list("date", flat=True):
            self.stdout.write(f"{day} (gửi lại): {send_daily_menu(day)}")

    def _stop(self, *_):
        self.stopping = True
