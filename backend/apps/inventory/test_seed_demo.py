"""BE-18: dữ liệu demo chạy lặp an toàn và không chạy trên production."""

import os
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from io import StringIO
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone

from .crypto_fields import decrypt
from .models import (
    Category, DayMenuSnapshot, Dish, FoodItem, MenuVersion, MenuVersionItem, NotificationLog, ParentContact,
    RecipeComponent, SchoolClass, Student,
)


@override_settings(DEBUG=True, EMAIL_MODE='dry_run')
class SeedDemoTests(TestCase):
    def setUp(self):
        self.passwords = {
            'DEMO_MANAGER_PASSWORD': secrets.token_urlsafe(24),
            'DEMO_PRINCIPAL_PASSWORD': secrets.token_urlsafe(24),
        }
        self.env = patch.dict(os.environ, self.passwords)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.keys = override_settings(
            FIELD_ENCRYPTION_KEYS=Fernet.generate_key().decode(), CONTACT_HASH_KEY=secrets.token_hex(32),
        )
        self.keys.enable()
        self.addCleanup(self.keys.disable)

    def seed(self, **options):
        output = StringIO()
        call_command('seed_demo', stdout=output, **options)
        for password in self.passwords.values():
            self.assertNotIn(password, output.getvalue())
        return output.getvalue()

    def test_security_chay_hai_lan_khong_nhan_ban(self):
        self.seed(scenario='security')
        models = [get_user_model(), Category, SchoolClass, FoodItem, Dish, RecipeComponent,
                  MenuVersion, MenuVersionItem, Student, ParentContact]
        before = {model: list(model.objects.order_by('pk').values()) for model in models}
        self.seed(scenario='security')
        for model in models:
            self.assertEqual(list(model.objects.order_by('pk').values()), before[model])
        self.assertEqual([model.objects.count() for model in models], [2, 3, 3, 3, 3, 4, 1, 15, 5, 5])
        for role in ('manager', 'principal'):
            user = get_user_model().objects.get(username=f'demo_{role}')
            self.assertEqual(list(user.groups.values_list('name', flat=True)), [role])
            self.assertTrue(user.check_password(self.passwords[f'DEMO_{role.upper()}_PASSWORD']))
            self.assertEqual(user.email, f'demo_{role}@example.test')
        self.assertEqual(list(SchoolClass.objects.values_list('code', 'enrolled', 'grade')),
                         [('1A1', 30, 1), ('1A2', 28, 1), ('2A1', 25, 2)])
        self.assertEqual(set(FoodItem.objects.values_list('unit', flat=True)), {'kg'})
        quantities = {(c.dish.code, c.food.code): c.quantity
                      for c in RecipeComponent.objects.select_related('dish', 'food')}
        self.assertEqual(quantities, {('THITKHO', 'THIT'): Decimal('0.060'),
                                     ('CANHBI', 'BI'): Decimal('0.050'),
                                     ('CANHBI', 'THIT'): Decimal('0.010'), ('COM', 'GAO'): Decimal('0.120')})
        version = MenuVersion.objects.get()
        self.assertEqual(version.effective_from, timezone.localdate() + timedelta(days=1))
        for day in range(5):
            self.assertEqual(list(version.items.filter(weekday=day).values_list('dish__code', flat=True)),
                             ['COM', 'THITKHO', 'CANHBI'])
        for n in range(1, 6):
            student = Student.objects.get(full_name=f'Học sinh demo {n}', school_class__code='1A1')
            contact = student.contacts.get()
            self.assertEqual(decrypt(contact.email_encrypted), f'phuhuynh{n}@example.test')
            self.assertNotIn('@', contact.email_encrypted)
            self.assertIsNotNone(contact.consent_at)

    def test_thieu_mat_khau_khong_ghi_du_lieu(self):
        for variable in self.passwords:
            for value in (None, '', '   '):
                with self.subTest(variable=variable, value=value), patch.dict(os.environ):
                    if value is None:
                        os.environ.pop(variable, None)
                    else:
                        os.environ[variable] = value
                    with self.assertRaisesMessage(CommandError, variable):
                        self.seed(scenario='security')
                    self.assertEqual(Category.objects.count(), 0)
                    self.assertEqual(get_user_model().objects.count(), 0)

    @override_settings(DEBUG=False)
    def test_tu_choi_production(self):
        for options in ({}, {'scenario': 'security'}):
            with self.subTest(options=options), self.assertRaisesMessage(CommandError, 'DEBUG=False'):
                self.seed(**options)
        self.assertEqual(Category.objects.count(), 0)

    def test_khong_chon_scenario_chi_tao_ba_danh_muc(self):
        self.seed()
        self.seed()
        self.assertEqual(set(Category.objects.values_list('code', flat=True)), {'RAU_CU', 'THIT', 'TINH_BOT'})
        self.assertEqual(get_user_model().objects.count(), 0)
        self.assertEqual(Student.objects.count(), 0)

    def test_chay_lai_ngay_sau_khong_tao_them_version(self):
        self.seed(scenario='security')
        day_after = timezone.localdate() + timedelta(days=2)
        with patch('apps.inventory.management.commands.seed_demo.timezone.localdate', return_value=day_after):
            self.seed(scenario='security')
        self.assertEqual(MenuVersion.objects.count(), 1)

    def test_loi_tao_hoc_sinh_rollback_toan_bo(self):
        with patch('apps.inventory.student_services.create_student', side_effect=ValueError('Lỗi giả lập')):
            with self.assertRaisesMessage(ValueError, 'Lỗi giả lập'):
                self.seed(scenario='security')
        for model in (Category, get_user_model(), SchoolClass, FoodItem, Dish, RecipeComponent,
                      MenuVersion, MenuVersionItem, Student, ParentContact):
            self.assertEqual(model.objects.count(), 0)

    def test_mat_khau_yeu_bi_tu_choi_khong_lo_mat_khau(self):
        for weak in ('ngan', '1234567890', 'demo_manager1'):
            with self.subTest(weak=weak), patch.dict(os.environ, {'DEMO_MANAGER_PASSWORD': weak}):
                with self.assertRaises(CommandError) as caught:
                    self.seed(scenario='security')
                self.assertIn('DEMO_MANAGER_PASSWORD', str(caught.exception))
                self.assertNotIn(weak, str(caught.exception))
                self.assertEqual(get_user_model().objects.count(), 0)
                self.assertEqual(Category.objects.count(), 0)

    @override_settings(EMAIL_MODE='smtp')
    def test_tu_choi_khi_email_mode_smtp(self):
        with self.assertRaisesMessage(CommandError, 'EMAIL_MODE=dry_run'):
            self.seed(scenario='security')
        self.assertEqual(Student.objects.count(), 0)

    def test_tai_khoan_da_co_giu_mat_khau_va_duoc_gan_vai_tro(self):
        user = get_user_model().objects.create_user('demo_manager', password='mat-khau-cu-dai-hon-10')
        self.seed(scenario='security')
        user.refresh_from_db()
        self.assertTrue(user.check_password('mat-khau-cu-dai-hon-10'))
        self.assertEqual(list(user.groups.values_list('name', flat=True)), ['manager'])
        self.assertTrue(Group.objects.filter(name='principal', user__username='demo_principal').exists())


@override_settings(DEBUG=True, EMAIL_MODE='dry_run', TIME_ZONE='Asia/Ho_Chi_Minh')
class SendMenuPreviewTests(TestCase):
    """BE-17: npm run ec2:send-menu-dry = send_daily_menu --preview, không ghi nhật ký/bản chụp."""

    def setUp(self):
        self.enterContext(patch.dict(os.environ, {
            'DEMO_MANAGER_PASSWORD': secrets.token_urlsafe(24),
            'DEMO_PRINCIPAL_PASSWORD': secrets.token_urlsafe(24),
        }))
        self.enterContext(override_settings(
            FIELD_ENCRYPTION_KEYS=Fernet.generate_key().decode(), CONTACT_HASH_KEY=secrets.token_hex(32),
        ))
        call_command('seed_demo', scenario='security', stdout=StringIO())

    def test_preview_dem_nguoi_nhan_nhung_khong_ghi_gi(self):
        version = MenuVersion.objects.get()
        ngay = version.effective_from + timedelta(days=(7 - version.effective_from.weekday()) % 7)  # thứ Hai
        bay_gio = datetime.combine(ngay, datetime.min.time(), ZoneInfo('Asia/Ho_Chi_Minh')).replace(hour=6, minute=0)
        output = StringIO()
        with patch('django.utils.timezone.now', return_value=bay_gio):
            call_command('send_daily_menu', '--preview', stdout=output)
        self.assertIn(ngay.isoformat(), output.getvalue())
        self.assertIn('dry_run=5', output.getvalue())
        self.assertFalse(NotificationLog.objects.exists())
        self.assertFalse(DayMenuSnapshot.objects.exists())

    def test_preview_ngay_chu_nhat_skipped(self):
        output = StringIO()
        call_command('send_daily_menu', '--preview', '--date', date(2026, 10, 4).isoformat(), stdout=output)
        self.assertIn('skipped=1', output.getvalue())
        self.assertFalse(NotificationLog.objects.exists())
