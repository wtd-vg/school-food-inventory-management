"""ISSUE-001: kiểm tra DB cũ (bản f00048d) trước khi `migrate`.

    python manage.py sf_legacy_db_check            # chỉ đọc, in chẩn đoán
    python manage.py sf_legacy_db_check --apply    # xóa hai bảng phiếu xuất cũ nếu còn rỗng

Exit 1 khi cần người xử lý (bảng cũ có dữ liệu, bị tham chiếu, hoặc schema lạ). Chi tiết: legacy_db.py.
Sau --apply: chạy `migrate`, rồi `sf31_ledger_audit --strict`.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import DEFAULT_DB_ALIAS, connections

from apps.inventory.legacy_db import (
    LEGACY_EMPTY,
    NEEDS_PERSON,
    collect_facts,
    diagnose,
    drop_empty_legacy_tables,
)


class Command(BaseCommand):
    help = "ISSUE-001: nhận diện DB đã migrate ở f00048d; --apply xóa hai bảng phiếu xuất cũ khi còn rỗng."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Thực hiện xóa (mặc định chỉ kiểm tra).")
        parser.add_argument("--database", default=DEFAULT_DB_ALIAS)

    def handle(self, *args, **options):
        connection = connections[options["database"]]
        settings = connection.settings_dict
        self.stdout.write(f"DB: {settings['NAME']} @ {settings['HOST']}:{settings['PORT']}")

        diagnosis = diagnose(collect_facts(connection))
        self.stdout.write(f"Trạng thái: {diagnosis.state}")
        self.stdout.write(diagnosis.message)
        if diagnosis.state in NEEDS_PERSON:
            raise CommandError("Dừng: không tự sửa DB ở trạng thái này.")
        if diagnosis.state != LEGACY_EMPTY:
            return
        if not options["apply"]:
            self.stdout.write("Chưa thay đổi gì. Chạy lại với --apply để xóa hai bảng rỗng.")
            return

        diagnosis, dropped = drop_empty_legacy_tables(connection)
        if not dropped:
            raise CommandError(f"Trạng thái đổi trong lúc chạy ({diagnosis.state}): {diagnosis.message}")
        for table in dropped:
            self.stdout.write(f"Đã xóa bảng rỗng {table}.")
        self.stdout.write(self.style.SUCCESS(
            "Xong. Tiếp theo: `python manage.py migrate` rồi `python manage.py sf31_ledger_audit --strict`."
        ))
