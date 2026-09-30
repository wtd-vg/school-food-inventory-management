"""SF31: đối chiếu tồn kho với sổ kho duy nhất StockTransaction.

    python manage.py sf31_ledger_audit            # in bảng lệch, luôn exit 0
    python manage.py sf31_ledger_audit --strict   # exit 1 nếu có lệch (dùng khi nghiệm thu BASE01)

Chỉ đọc, không sửa dữ liệu. Tồn của mỗi food phải bằng tổng quantity_delta của nó (food tạo mới
có tồn 0). Food lệch thường là dữ liệu local cũ: tồn được đặt tay/seed trước khi có sổ kho, hoặc
bút toán chỉ nằm trong bảng legacy InventoryLedger. Không tự tạo bút toán bù: người phụ trách
kiểm tra rồi xử lý bằng phiếu kiểm kê có lý do.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Sum

from apps.inventory.models import FoodItem, InventoryLedger, StockTransaction


class Command(BaseCommand):
    help = "Đối chiếu FoodItem.quantity với tổng StockTransaction.quantity_delta (SF31/BASE01)."

    def add_arguments(self, parser):
        parser.add_argument("--strict", action="store_true", help="Trả exit code 1 nếu có lệch.")

    def handle(self, *args, **options):
        sums = {
            row["food_id"]: row["total"] or Decimal("0")
            for row in StockTransaction.objects.values("food_id").annotate(total=Sum("quantity_delta"))
        }
        mismatches = []
        for food in FoodItem.objects.order_by("id"):
            ledger_total = sums.get(food.id, Decimal("0"))
            if ledger_total != food.quantity:
                mismatches.append((food, ledger_total))

        legacy = list(InventoryLedger.objects.values("transaction_type").annotate(n=Count("id")).order_by("transaction_type"))

        self.stdout.write(f"StockTransaction: {StockTransaction.objects.count()} bút toán")
        self.stdout.write("InventoryLedger (legacy, không còn ghi): "
                          + (", ".join(f"{r['transaction_type']}={r['n']}" for r in legacy) or "0"))
        if not mismatches:
            self.stdout.write(self.style.SUCCESS("Tồn kho khớp sổ kho cho mọi thực phẩm."))
            return
        self.stdout.write(self.style.WARNING(f"{len(mismatches)} thực phẩm lệch:"))
        for food, ledger_total in mismatches:
            self.stdout.write(
                f"  {food.code:<12} {food.name:<30} tồn={food.quantity}  sổ kho={ledger_total}  lệch={food.quantity - ledger_total}"
            )
        if options["strict"]:
            raise CommandError("Tồn kho chưa khớp sổ kho.")
