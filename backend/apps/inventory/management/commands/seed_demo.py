"""Dữ liệu mẫu cho máy local/demo. KHÔNG chạy trên production (từ chối khi DEBUG=False).

    python manage.py seed_demo                       # 3 danh mục
    python manage.py seed_demo --scenario security   # BE-18: + 2 tài khoản, 3 lớp, 3 món, thực đơn, 5 học sinh

--scenario security đọc mật khẩu demo từ DEMO_MANAGER_PASSWORD / DEMO_PRINCIPAL_PASSWORD (không có mặc định,
không in ra), chỉ chạy với EMAIL_MODE=dry_run. Chạy lại không nhân bản và không đổi mật khẩu tài khoản đã có.
"""

import os
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.inventory import menu_services, student_services
from apps.inventory.models import Category, Dish, FoodItem, MenuVersion, RecipeComponent, SchoolClass, Student


class Command(BaseCommand):
    help = 'Tạo danh mục mẫu; --scenario security thêm dữ liệu demo bảo mật trên DEBUG=True.'

    def add_arguments(self, parser):
        parser.add_argument('--scenario', choices=['security'], help='Kịch bản demo bảo mật.')

    @transaction.atomic
    def handle(self, *args, **kwargs):
        if not settings.DEBUG:
            raise CommandError('Không được chạy seed_demo khi DEBUG=False.')
        passwords = {}
        if kwargs.get('scenario') == 'security':
            for role in ('manager', 'principal'):
                variable = f'DEMO_{role.upper()}_PASSWORD'
                password = os.environ.get(variable, '')
                if not password.strip():
                    raise CommandError(f'Thiếu biến môi trường {variable}; hãy đặt mật khẩu demo trước khi chạy.')
                try:
                    validate_password(password, user=get_user_model()(username=f'demo_{role}'))
                except ValidationError as exc:
                    # Thông báo của validator không chứa mật khẩu.
                    raise CommandError(f'{variable} chưa đạt yêu cầu mật khẩu: ' + ' '.join(exc.messages)) from None
                passwords[role] = password
            if settings.EMAIL_MODE != 'dry_run':
                raise CommandError('Demo security chỉ chạy với EMAIL_MODE=dry_run để không gửi thư thật.')

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

        if passwords:
            self.seed_security(passwords)

    def seed_security(self, passwords):
        users = {}
        for role, password in passwords.items():
            group, _ = Group.objects.get_or_create(name=role)
            user, created = get_user_model().objects.get_or_create(
                username=f'demo_{role}', defaults={'email': f'demo_{role}@example.test'},
            )
            if created:
                user.set_password(password)
                user.save(update_fields=['password'])
            if not user.groups.filter(pk=group.pk).exists():
                user.groups.add(group)
            users[role] = user

        classes = {}
        for code, enrolled, grade in [('1A1', 30, 1), ('1A2', 28, 1), ('2A1', 25, 2)]:
            classes[code], _ = SchoolClass.objects.get_or_create(
                code=code, defaults={'name': f'Lớp {code}', 'enrolled': enrolled, 'grade': grade},
            )

        foods = {}
        for code, name, category_code in [
            ('THIT', 'Thịt heo', 'THIT'), ('BI', 'Bí xanh', 'RAU_CU'), ('GAO', 'Gạo', 'TINH_BOT'),
        ]:
            foods[code], _ = FoodItem.objects.get_or_create(
                code=code, defaults={'name': name, 'unit': 'kg', 'category': Category.objects.get(code=category_code)},
            )

        dishes = {}
        for code, name, components in [
            ('THITKHO', 'Thịt kho', [('THIT', '0.060')]),
            ('CANHBI', 'Canh bí thịt bằm', [('BI', '0.050'), ('THIT', '0.010')]),
            ('COM', 'Cơm', [('GAO', '0.120')]),
        ]:
            dishes[code], _ = Dish.objects.get_or_create(code=code, defaults={'name': name})
            for food_code, quantity in components:
                RecipeComponent.objects.get_or_create(
                    dish=dishes[code], food=foods[food_code], defaults={'quantity': Decimal(quantity)},
                )

        tomorrow = timezone.localdate() + timedelta(days=1)
        if not MenuVersion.objects.exists():
            menu_services.create_menu_version(
                tomorrow, {str(day): [dishes[code].pk for code in ('COM', 'THITKHO', 'CANHBI')] for day in range(5)},
                users['manager'], note='Thực đơn demo bảo mật',
            )
            self.stdout.write(f'Đã tạo thực đơn demo áp dụng từ {tomorrow:%d/%m/%Y}.')
        else:
            self.stdout.write('Đã có phiên bản thực đơn; giữ nguyên, không tạo thêm.')

        for n in range(1, 6):
            full_name = f'Học sinh demo {n}'
            if not Student.objects.filter(school_class=classes['1A1'], full_name=full_name).exists():
                student_services.create_student(
                    full_name, classes['1A1'], [f'phuhuynh{n}@example.test'], users['manager'],
                    consent_note='Đồng ý giả lập cho dữ liệu demo',
                )

        self.stdout.write(self.style.SUCCESS(
            'Hoàn tất demo security: 2 tài khoản, 3 lớp, 3 thực phẩm, 3 món, 5 học sinh mẫu. '
            'Bản ghi đã có được giữ nguyên. Dùng EMAIL_MODE=dry_run khi thử gửi thư.'
        ))
