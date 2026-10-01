"""BE-16 (ISSUE-009) + BE-09/10/11/15: hồi quy bảo mật với CSRF bật thật (Client(enforce_csrf_checks=True)).

- Ma trận quyền cho MỌI route trong apps.inventory.urls: route mới chưa khai vào EXPECTED_PERMS làm test fail.
- Khóa đăng nhập sai, phiên 30 phút/12 giờ, khóa tài khoản/đặt lại mật khẩu đá phiên cũ.
- Quản lý tài khoản, nhật ký chỉ thêm, đầu vào sai không gây 500 và không ghi dữ liệu.
"""

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import Group, User
from django.test import Client, TestCase
from django.urls import URLPattern
from django.utils import timezone

from apps.inventory import urls as inventory_urls

from .models import AuditLog, Category, FoodItem, Issue, Receipt, SchoolClass, Supplier

STRONG = "Bep-Nha-Truong-2026"

# tên route → (chính sách, method đọc, method ghi)
#   inventory: đọc = Quản lý + Hiệu trưởng, ghi = Quản lý · principal: chỉ Hiệu trưởng
#   manager: mọi method chỉ Quản lý · public: không cần đăng nhập · session: cần đăng nhập, mọi vai trò
EXPECTED_PERMS = {
    "hello": ("public", ["GET"], []),
    "auth_csrf": ("public", ["GET"], []),
    "auth_login": ("public", [], ["POST"]),
    "auth_me": ("session", ["GET"], []),
    "auth_logout": ("public", [], ["POST"]),
    "unsubscribe": ("public", [], ["POST"]),
    "users": ("principal", ["GET"], ["POST"]),
    "user_detail": ("principal", ["GET"], ["PATCH"]),
    "user_reset_password": ("principal", [], ["POST"]),
    "audit_logs": ("principal", ["GET"], []),
    "contact_reveal": ("manager", [], ["POST"]),
    "categories": ("inventory", ["GET"], ["POST"]),
    "category_detail": ("inventory", [], ["PATCH"]),
    "foods": ("inventory", ["GET"], ["POST"]),
    "food_detail": ("inventory", [], ["PATCH"]),
    "suppliers": ("inventory", ["GET"], ["POST"]),
    "supplier_detail": ("inventory", [], ["PATCH"]),
    "stocktakes": ("inventory", [], ["POST"]),
    "stocktake_items": ("inventory", [], ["PATCH"]),
    "stocktake_post": ("inventory", [], ["POST"]),
    "receipts": ("inventory", ["GET"], ["POST"]),
    "receipt_detail": ("inventory", ["GET"], []),
    "receipt_post": ("inventory", [], ["POST"]),
    "issues": ("inventory", ["GET"], ["POST"]),
    "issue_detail": ("inventory", ["GET"], []),
    "issue_post": ("inventory", [], ["POST"]),
    "reports_stock": ("inventory", ["GET"], []),
    "reports_transactions": ("inventory", ["GET"], []),
    "classes": ("inventory", ["GET"], ["POST"]),
    "class_detail": ("inventory", ["GET"], ["PATCH"]),
    "lunch_day_counts": ("inventory", ["GET"], ["PUT"]),
    "lunch_day_open": ("inventory", [], ["POST"]),
    "lunch_day_lock": ("inventory", [], ["POST"]),
    "lunch_day_reopen": ("inventory", [], ["POST"]),
    "dishes": ("inventory", ["GET"], ["POST"]),
    "dish_detail": ("inventory", ["GET"], ["PATCH"]),
    "menu_week": ("inventory", ["GET"], []),
    "menu_today": ("inventory", ["GET"], []),
    "menu_versions": ("inventory", ["GET"], ["POST"]),
    "menu_version_detail": ("inventory", ["GET"], ["DELETE"]),
    "holidays": ("inventory", ["GET"], ["POST"]),
    "holiday_detail": ("inventory", [], ["DELETE"]),
    "students": ("inventory", ["GET"], ["POST"]),
    "students_import": ("inventory", [], ["POST"]),
    "student_detail": ("inventory", ["GET"], ["PATCH", "DELETE"]),
    "notifications": ("inventory", ["GET"], []),
    "notifications_send": ("inventory", [], ["POST"]),
    "notifications_test": ("inventory", [], ["POST"]),
    "lunch_day_demand": ("inventory", ["GET"], []),
    "lunch_day_demand_calculate": ("inventory", [], ["POST"]),
    "demand_approve": ("inventory", [], ["POST"]),
    "purchase_orders": ("inventory", ["GET"], ["POST"]),
    "purchase_order_from_demand": ("inventory", [], ["POST"]),
    "purchase_order_detail": ("inventory", ["GET"], []),
    "purchase_order_receipts": ("inventory", [], ["POST"]),
    "purchase_order_action": ("inventory", [], ["POST"]),
    "lunch_day_issue": ("inventory", [], ["POST"]),
    "lunch_day_cost": ("inventory", ["GET"], []),
    "lunch_day_close": ("inventory", [], ["POST"]),
    "lunch_day_reopen_close": ("inventory", [], ["POST"]),
    "reports_daily": ("inventory", ["GET"], []),
    "lunch_day_photos": ("inventory", ["GET"], ["POST"]),
    "meal_photo_detail": ("inventory", [], ["DELETE"]),
    "meal_photo_image": ("inventory", ["GET"], []),
}
SAMPLE_ARGS = {"int": "999999", "str": "2026-10-06"}


def make_user(username, role=None, password=STRONG, **extra):
    user = User.objects.create_user(username=username, password=password, **extra)
    if role:
        user.groups.add(Group.objects.get_or_create(name=role)[0])
    return user


def route_url(pattern):
    route = str(pattern.pattern)
    for conv, sample in SAMPLE_ARGS.items():
        while f"<{conv}:" in route:
            start = route.index(f"<{conv}:")
            route = route[:start] + sample + route[route.index(">", start) + 1:]
    return "/api/" + route


class CsrfClientMixin:
    def csrf_client(self, user=None):
        client = Client(enforce_csrf_checks=True)
        if user is not None:
            client.force_login(user)
        client.get("/api/auth/csrf/")
        client.csrf = client.cookies["csrftoken"].value
        return client

    def call(self, client, method, url, body=None, csrf=True):
        headers = {"HTTP_X_CSRFTOKEN": client.csrf} if csrf and hasattr(client, "csrf") else {}
        if method in ("GET", "HEAD"):
            return getattr(client, method.lower())(url, **headers)
        data = json.dumps(body if body is not None else {})
        return getattr(client, method.lower())(url, data=data, content_type="application/json", **headers)


class PermissionMatrixTests(CsrfClientMixin, TestCase):
    def setUp(self):
        self.manager = make_user("ql", "manager")
        self.principal = make_user("ht", "principal")
        self.norole = make_user("khong_vai_tro")

    def test_every_route_declares_permissions(self):
        names = {p.name for p in inventory_urls.urlpatterns if isinstance(p, URLPattern)}
        self.assertEqual(sorted(names - set(EXPECTED_PERMS)), [], "Route mới phải khai quyền trong EXPECTED_PERMS")
        self.assertEqual(sorted(set(EXPECTED_PERMS) - names), [])

    def test_matrix(self):
        anon = self.csrf_client()
        clients = {"manager": self.csrf_client(self.manager), "principal": self.csrf_client(self.principal),
                   "norole": self.csrf_client(self.norole)}
        for pattern in inventory_urls.urlpatterns:
            policy, reads, writes = EXPECTED_PERMS[pattern.name]
            url = route_url(pattern)
            if policy == "public":
                continue
            for method in reads + writes:
                with self.subTest(route=pattern.name, method=method):
                    self.assertEqual(self.call(anon, method, url).status_code, 401)
                    self.assertEqual(self.call(clients["norole"], method, url).status_code, 403)
                    allowed = {
                        "inventory": {"manager"} | ({"principal"} if method in reads else set()),
                        "principal": {"principal"},
                        "manager": {"manager"},
                        "session": {"manager", "principal"},
                    }[policy]
                    for role in ("manager", "principal"):
                        status = self.call(clients[role], method, url).status_code
                        if role in allowed:
                            self.assertNotIn(status, (401, 403), f"{role} bị chặn ở {method} {url}")
                        else:
                            self.assertEqual(status, 403, f"{role} phải bị 403 ở {method} {url}")
                    if method in writes:
                        self.assertEqual(self.call(clients["manager"], method, url, csrf=False).status_code, 403,
                                         "Thiếu CSRF phải bị 403")

    def test_wrong_method_is_405(self):
        client = self.csrf_client(self.manager)
        self.assertEqual(self.call(client, "PUT", "/api/categories/").status_code, 405)
        self.assertEqual(self.call(client, "DELETE", "/api/foods/").status_code, 405)
        self.assertEqual(client.get("/api/stocktakes/").status_code, 405)


class LoginAndSessionTests(CsrfClientMixin, TestCase):
    def setUp(self):
        self.manager = make_user("ql", "manager")
        self.principal = make_user("ht", "principal")

    def login(self, client, username="ql", password=STRONG, ip="198.51.100.1"):
        return client.post("/api/auth/login/", data=json.dumps({"username": username, "password": password}),
                           content_type="application/json", HTTP_X_CSRFTOKEN=client.csrf, REMOTE_ADDR=ip)

    def test_login_returns_role_flags(self):
        client = self.csrf_client()
        body = self.login(client).json()["user"]
        self.assertEqual((body["role"], body["can_write"], body["can_manage_users"]), ("manager", True, False))
        client2 = self.csrf_client()
        body = self.login(client2, "ht").json()["user"]
        self.assertEqual((body["role"], body["can_write"], body["can_manage_users"]), ("principal", False, True))

    def test_user_without_role_cannot_log_in(self):
        make_user("lac_loai")
        response = self.login(self.csrf_client(), "lac_loai")
        self.assertEqual(response.status_code, 403)

    def test_login_requires_csrf(self):
        client = self.csrf_client()
        response = client.post("/api/auth/login/", data=json.dumps({"username": "ql", "password": STRONG}),
                               content_type="application/json")
        self.assertEqual(response.status_code, 403)

    def test_five_failures_lock_username_for_15_minutes(self):
        client = self.csrf_client()
        for _ in range(4):
            self.assertEqual(self.login(client, password="sai-mat-khau").status_code, 401)
        locked = self.login(client, password="sai-mat-khau")
        self.assertEqual(locked.status_code, 429)
        self.assertIn("Retry-After", locked)
        self.assertEqual(self.login(client).status_code, 429, "Đang khóa thì mật khẩu đúng cũng bị chặn")
        later = timezone.now() + timedelta(minutes=16)
        with mock.patch("django.utils.timezone.now", return_value=later):
            self.assertEqual(self.login(client).status_code, 200)

    def test_unknown_and_wrong_password_give_same_message(self):
        client = self.csrf_client()
        a = self.login(client, "khong_ton_tai", "x").json()["message"]
        b = self.login(client, "ql", "x").json()["message"]
        self.assertEqual(a, b)

    def test_twenty_failures_lock_ip(self):
        client = self.csrf_client()
        for i in range(19):
            self.assertEqual(self.login(client, f"nguoi_{i}", "sai").status_code, 401)
        self.assertEqual(self.login(client, "nguoi_cuoi", "sai").status_code, 429)
        self.assertEqual(self.login(client, "ql", STRONG).status_code, 429)
        self.assertEqual(self.login(self.csrf_client(), "ql", STRONG, ip="198.51.100.2").status_code, 200)

    def test_idle_30_minutes_logs_out(self):
        client = self.csrf_client()
        self.login(client)
        self.assertEqual(client.get("/api/auth/me/").status_code, 200)
        with mock.patch("django.utils.timezone.now", return_value=timezone.now() + timedelta(minutes=31)):
            self.assertEqual(client.get("/api/auth/me/").status_code, 401)

    def test_absolute_12_hours_logs_out_even_when_active(self):
        client = self.csrf_client()
        self.login(client)
        start = timezone.now()
        for minutes in range(20, 12 * 60, 20):  # thao tác đều đặn, không bị hết hạn vì rảnh
            with mock.patch("django.utils.timezone.now", return_value=start + timedelta(minutes=minutes)):
                self.assertEqual(client.get("/api/auth/me/").status_code, 200, minutes)
        with mock.patch("django.utils.timezone.now", return_value=start + timedelta(hours=12, minutes=5)):
            self.assertEqual(client.get("/api/auth/me/").status_code, 401)

    def test_logout_invalidates_session(self):
        client = self.csrf_client()
        self.login(client)
        client.post("/api/auth/logout/", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)

    def test_lock_and_password_reset_kick_old_sessions(self):
        ql = self.csrf_client()
        self.login(ql)
        boss = self.csrf_client(self.principal)
        self.call(boss, "POST", f"/api/users/{self.manager.id}/reset-password/", {"password": "Mat-Khau-Moi-2026"})
        self.assertEqual(ql.get("/api/auth/me/").status_code, 401)

        ql2 = self.csrf_client()
        self.assertEqual(self.login(ql2, password="Mat-Khau-Moi-2026").status_code, 200)
        self.call(boss, "PATCH", f"/api/users/{self.manager.id}/", {"is_active": False})
        self.assertEqual(ql2.get("/api/auth/me/").status_code, 401)
        self.assertEqual(self.login(self.csrf_client(), password="Mat-Khau-Moi-2026").status_code, 401)


class UserManagementTests(CsrfClientMixin, TestCase):
    def setUp(self):
        self.principal = make_user("ht", "principal")
        self.manager = make_user("ql", "manager")
        self.boss = self.csrf_client(self.principal)

    def test_create_user_with_role_and_strong_password(self):
        body = {"username": "ql2", "full_name": "Nguyễn Văn B", "role": "manager", "password": STRONG}
        response = self.call(self.boss, "POST", "/api/users/", body)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["role"], "manager")
        self.assertNotIn("password", response.content.decode())
        self.assertEqual(self.call(self.boss, "POST", "/api/users/", body).status_code, 409)

    def test_weak_passwords_rejected(self):
        for pw in ("Ngan1!", "1234567890", "ql3ql3ql3ql3", "password123"):
            with self.subTest(pw=pw):
                body = {"username": "ql3ql3ql3ql3", "full_name": "C", "role": "manager", "password": pw}
                response = self.call(self.boss, "POST", "/api/users/", body)
                self.assertEqual(response.status_code, 400)
                self.assertIn("password", response.json()["errors"])

    def test_cannot_lock_or_demote_self_or_last_principal(self):
        me = f"/api/users/{self.principal.id}/"
        self.assertEqual(self.call(self.boss, "PATCH", me, {"is_active": False}).status_code, 409)
        self.assertEqual(self.call(self.boss, "PATCH", me, {"role": "manager"}).status_code, 409)
        other = make_user("ht2", "principal")
        self.assertEqual(self.call(self.boss, "PATCH", f"/api/users/{other.id}/", {"is_active": False}).status_code, 200)
        other.is_active = True
        other.save()
        self.principal.groups.clear()
        self.principal.groups.add(Group.objects.get(name="principal"))

    def test_last_active_principal_is_protected(self):
        other = make_user("ht2", "principal")
        client = self.csrf_client(other)
        self.call(client, "PATCH", f"/api/users/{self.principal.id}/", {"role": "manager"})
        self.assertEqual(
            self.call(self.csrf_client(make_user("ht3", "principal")), "PATCH", f"/api/users/{other.id}/", {"is_active": False}).status_code,
            200,
        )

    def test_superuser_not_editable(self):
        root = User.objects.create_superuser("root", password=STRONG)
        self.assertEqual(self.call(self.boss, "PATCH", f"/api/users/{root.id}/", {"full_name": "x"}).status_code, 403)

    def test_manager_cannot_manage_users(self):
        client = self.csrf_client(self.manager)
        self.assertEqual(client.get("/api/users/").status_code, 403)
        self.assertEqual(client.get("/api/audit-logs/").status_code, 403)


class AuditLogTests(CsrfClientMixin, TestCase):
    def setUp(self):
        self.manager = make_user("ql", "manager")
        self.principal = make_user("ht", "principal")

    def test_login_and_failures_are_logged_without_password(self):
        client = self.csrf_client()
        client.post("/api/auth/login/", data=json.dumps({"username": "ql", "password": "sai-mk-bi-mat"}),
                    content_type="application/json", HTTP_X_CSRFTOKEN=client.csrf)
        client.post("/api/auth/login/", data=json.dumps({"username": "ql", "password": STRONG}),
                    content_type="application/json", HTTP_X_CSRFTOKEN=client.csrf)
        actions = list(AuditLog.objects.order_by("id").values_list("action", flat=True))
        self.assertEqual(actions, ["login_failed", "login"])
        dump = json.dumps(list(AuditLog.objects.values()), default=str)
        self.assertNotIn("sai-mk-bi-mat", dump)
        self.assertNotIn(STRONG, dump)

    def test_write_operations_are_logged_with_changes(self):
        client = self.csrf_client(self.manager)
        cat = self.call(client, "POST", "/api/categories/", {"code": "rau", "name": "Rau"}).json()
        self.call(client, "PATCH", f"/api/categories/{cat['id']}/", {"name": "Rau củ"})
        log = AuditLog.objects.get(action="category_update")
        self.assertEqual(log.changes, {"name": ["Rau", "Rau củ"]})
        self.assertEqual(log.actor, self.manager)

    def test_failed_operation_leaves_no_log(self):
        client = self.csrf_client(self.manager)
        cat = Category.objects.create(code="T", name="Thịt")
        food = FoodItem.objects.create(code="THIT", name="Thịt", category=cat, unit="kg")
        issue = self.call(client, "POST", "/api/issues/", {"date": "2026-10-06", "lines": [{"food_id": food.id, "quantity": "1"}]}).json()
        self.assertEqual(self.call(client, "POST", f"/api/issues/{issue['id']}/post/").status_code, 409)
        self.assertFalse(AuditLog.objects.filter(action="issue_post").exists())

    def test_audit_api_filters_and_paginates(self):
        for i in range(55):
            AuditLog.objects.create(actor_username="ql", action="food_update", entity_type="food", entity_id=str(i))
        AuditLog.objects.create(actor_username="ht", action="login")
        client = self.csrf_client(self.principal)
        page1 = client.get("/api/audit-logs/?action=food_update").json()
        self.assertEqual((len(page1["results"]), page1["total"], page1["total_pages"]), (50, 55, 2))
        self.assertEqual(len(client.get("/api/audit-logs/?action=food_update&page=2").json()["results"]), 5)
        self.assertEqual(client.get("/api/audit-logs/?actor=ht").json()["total"], 1)
        self.assertEqual(client.get("/api/audit-logs/?from=2026-99-01").status_code, 400)


class InputValidationTests(CsrfClientMixin, TestCase):
    """ISSUE-004/005/006/008: đầu vào sai → 400 JSON, không 500, không ghi dữ liệu."""

    def setUp(self):
        self.manager = make_user("ql", "manager")
        self.client_ = self.csrf_client(self.manager)
        self.cat = Category.objects.create(code="G", name="Gạo")
        self.food = FoodItem.objects.create(code="GAO", name="Gạo", category=self.cat, unit="kg")
        self.supplier = Supplier.objects.create(code="NCC", name="NCC")

    def counts(self):
        return (Category.objects.count(), Receipt.objects.count(), Issue.objects.count(), SchoolClass.objects.count())

    def post_raw(self, url, raw):
        return self.client_.post(url, data=raw, content_type="application/json", HTTP_X_CSRFTOKEN=self.client_.csrf)

    def test_non_object_bodies(self):
        before = self.counts()
        for url in ("/api/classes/", "/api/dishes/", "/api/receipts/", "/api/issues/", "/api/categories/"):
            for raw in ("[]", "null", '"x"', "1", "{bad json"):
                with self.subTest(url=url, raw=raw):
                    response = self.post_raw(url, raw)
                    self.assertEqual(response.status_code, 400)
                    self.assertIn("message", response.json())
        anon = self.csrf_client()
        self.assertEqual(anon.post("/api/auth/login/", data="[]", content_type="application/json",
                                   HTTP_X_CSRFTOKEN=anon.csrf).status_code, 400)
        self.assertEqual(self.counts(), before)

    def test_string_false_is_not_true(self):
        response = self.call(self.client_, "PATCH", f"/api/categories/{self.cat.id}/", {"is_active": "false"})
        self.assertEqual(response.status_code, 400)
        self.cat.refresh_from_db()
        self.assertTrue(self.cat.is_active)
        for url in ("/api/foods/", "/api/suppliers/", "/api/classes/"):
            with self.subTest(url=url):
                body = {"code": "X1", "name": "X", "is_active": 0, "category_id": self.cat.id, "unit": "kg"}
                if url != "/api/foods/":
                    body.pop("category_id"), body.pop("unit")
                self.assertEqual(self.call(self.client_, "POST", url, body).status_code, 400)

    def test_float_and_bad_decimals_rejected(self):
        before = self.counts()
        base = {"supplier_id": self.supplier.id, "date": "2026-10-06"}
        for line in ({"quantity": 0.1, "unit_price": "1"}, {"quantity": "1", "unit_price": 0.2},
                     {"quantity": "NaN", "unit_price": "1"}, {"quantity": "1e3", "unit_price": "1"},
                     {"quantity": True, "unit_price": "1"}, {"quantity": "1.0004", "unit_price": "1"},
                     {"quantity": "1", "unit_price": "0.001"}, {"quantity": "-1", "unit_price": "1"}):
            with self.subTest(line=line):
                body = {**base, "lines": [{"food_id": self.food.id, **line}]}
                self.assertEqual(self.call(self.client_, "POST", "/api/receipts/", body).status_code, 400)
        self.assertEqual(self.counts(), before)

    def test_issue_bad_date_and_scale_are_400_not_500(self):
        before = self.counts()
        for body in ({"date": "2026-99-99", "lines": [{"food_id": self.food.id, "quantity": "1.000"}]},
                     {"date": "2026-10-06", "lines": [{"food_id": self.food.id, "quantity": "0.0004"}]},
                     {"date": "2026-10-06", "code": 12, "lines": [{"food_id": self.food.id, "quantity": "1"}]}):
            with self.subTest(body=body):
                response = self.call(self.client_, "POST", "/api/issues/", body)
                self.assertEqual(response.status_code, 400)
                self.assertTrue(response.json()["message"])
        self.assertEqual(self.counts(), before)

    def test_hello_does_not_leak(self):
        self.assertEqual(Client().get("/api/hello/").json(), {"ok": True})
