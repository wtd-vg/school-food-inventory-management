"""BE-02: group vai trò, LoginThrottle, AuditLog chỉ thêm (PostgreSQL, trigger thật)."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import IntegrityError, connection, transaction
from django.db.models import ProtectedError
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from .models import ROLE_MANAGER, ROLE_PRINCIPAL, AuditLog, LoginThrottle


class RoleGroupTests(TestCase):
    def test_migration_creates_role_groups(self):
        self.assertEqual(
            set(Group.objects.filter(name__in=[ROLE_MANAGER, ROLE_PRINCIPAL]).values_list("name", flat=True)),
            {ROLE_MANAGER, ROLE_PRINCIPAL},
        )


class LoginThrottleTests(TransactionTestCase):
    def make(self, scope="user", key_hash=None):
        return LoginThrottle.objects.create(
            scope=scope,
            key_hash=key_hash or LoginThrottle.hash_key(scope, "demo_manager"),
            window_start=timezone.now(),
        )

    def test_hash_key_is_hex_keyed_and_normalized(self):
        h = LoginThrottle.hash_key("user", "Demo_Manager ")
        self.assertRegex(h, r"^[0-9a-f]{64}$")
        self.assertEqual(h, LoginThrottle.hash_key("user", "demo_manager"))
        self.assertNotEqual(h, LoginThrottle.hash_key("ip", "demo_manager"))
        self.assertNotIn("demo_manager", h)

    def test_one_row_per_scope_and_key(self):
        self.make()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make()
        self.make(scope="ip", key_hash=LoginThrottle.hash_key("user", "demo_manager"))

    def test_database_rejects_bad_scope_and_raw_value(self):
        for scope, key_hash in (("email", LoginThrottle.hash_key("user", "x")), ("user", "demo_manager")):
            with self.subTest(scope=scope, key_hash=key_hash), self.assertRaises(IntegrityError), transaction.atomic():
                LoginThrottle.objects.create(scope=scope, key_hash=key_hash, window_start=timezone.now())


class AuditLogAppendOnlyTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="be02_manager")
        self.log = AuditLog.objects.create(
            actor=self.user, actor_username=self.user.username, action="login",
            entity_type="user", entity_id=str(self.user.pk), ip="203.0.113.7",
        )

    def test_insert_and_read(self):
        row = AuditLog.objects.get(pk=self.log.pk)
        self.assertEqual((row.action, row.actor_id, row.changes), ("login", self.user.pk, {}))
        self.assertIsNotNone(row.created_at)

    def test_orm_update_and_delete_are_blocked(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            AuditLog.objects.filter(pk=self.log.pk).update(summary="sửa lén")
        with self.assertRaises(IntegrityError), transaction.atomic():
            AuditLog.objects.filter(pk=self.log.pk).delete()
        self.assertEqual(AuditLog.objects.get(pk=self.log.pk).summary, "")

    def test_raw_sql_update_and_delete_are_blocked(self):
        for sql in ("UPDATE inventory_auditlog SET action = 'x' WHERE id = %s",
                    "DELETE FROM inventory_auditlog WHERE id = %s"):
            with self.subTest(sql=sql), self.assertRaises(IntegrityError), transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(sql, [self.log.pk])
        self.assertTrue(AuditLog.objects.filter(pk=self.log.pk, action="login").exists())

    def test_empty_action_rejected(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            AuditLog.objects.create(action="")

    def test_actor_with_history_cannot_be_deleted(self):
        with self.assertRaises(ProtectedError):
            self.user.delete()

    def test_failed_login_without_actor(self):
        row = AuditLog.objects.create(actor_username="khong_ton_tai", action="login_failed", ip="2001:db8::1")
        self.assertIsNone(row.actor_id)
