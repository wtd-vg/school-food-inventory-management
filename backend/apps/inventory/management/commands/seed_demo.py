from django.core.management.base import BaseCommand
from apps.inventory.models import Category

class Command(BaseCommand):
    help = 'Seed dữ liệu danh mục mẫu không trùng lặp'

    def handle(self, *args, **kwargs):
        # 1. Danh sách các danh mục cố định
        danh_muc_mau = [
            {'code': 'RAU_CU', 'name': 'Rau củ quả tươi'},
            {'code': 'THIT', 'name': 'Thịt'},
            {'code': 'TINH_BOT', 'name': 'Cơm'},
        ]
        
        # 2. Vòng lặp tạo dữ liệu bằng update_or_create
        for dm in danh_muc_mau:
            obj, created = Category.objects.update_or_create(
                code=dm['code'],
                defaults={'name': dm['name']}
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Đã tạo mới: {dm['code']}"))
            else:
                self.stdout.write(self.style.WARNING(f"Đã tồn tại/cập nhật: {dm['code']}"))

        self.stdout.write(self.style.SUCCESS('Hoàn tất seed danh mục!'))