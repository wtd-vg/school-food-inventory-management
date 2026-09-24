"""Các bài kiểm thử cho app inventory, bao gồm skeleton và SF13 xác thực/phân quyền."""

import json
from django.contrib.auth.models import Group, User
from django.db import IntegrityError
from django.middleware.csrf import get_token
from django.test import Client, TestCase
from .models import Category


class HelloApiTest(TestCase):
    """Test API mẫu kiểm tra kết nối Django và DB."""

    def test_hello_api_connects_to_database(self) -> None:
        response = Client().get("/api/hello/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["database"], "PostgreSQL đã kết nối.")


class CategoryModelTest(TestCase):
    """Test model Category từ mốc M1."""

    def setUp(self):
        # Tạo user viewer để test đọc API categories
        self.viewer_group, _ = Group.objects.get_or_create(name="viewer")
        self.viewer = User.objects.create_user(username="viewer_cat", password="password123")
        self.viewer.groups.add(self.viewer_group)
        self.client = Client()
        self.client.force_login(self.viewer)

    def test_empty_list(self):
        count = Category.objects.count()
        self.assertEqual(count, 0)

    def test_valid_data(self):
        Category.objects.create(code="RICE", name="Các loại gạo")
        Category.objects.create(code="MEAT", name="Các loại thịt")
        count = Category.objects.count()
        self.assertEqual(count, 2)

    def test_block_same_data(self):
        Category.objects.create(code="Vegetables", name="Rau")
        with self.assertRaises(IntegrityError):
            Category.objects.create(code="Vegetables", name="Rau củ quả")

    def test_api_read_with_auth(self):
        Category.objects.create(code="RICE", name="Gạo")
        Category.objects.create(code="MEAT", name="Thịt")
        response = self.client.get("/api/categories/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["results"]), 2)
        self.assertEqual(data["results"][0]["code"], "RICE")


class AuthAndPermissionTest(TestCase):
    """
    SF13: Kiểm tra session đăng nhập, CSRF và phân quyền theo AC04.
    Manager đọc/ghi, viewer chỉ đọc, từ chối request chưa xác thực hoặc thiếu CSRF.
    """

    def setUp(self):
        # Đảm bảo group tồn tại
        self.manager_group, _ = Group.objects.get_or_create(name="manager")
        self.viewer_group, _ = Group.objects.get_or_create(name="viewer")

        # Tạo tài khoản mẫu
        self.manager_user = User.objects.create_user(
            username="bep_truong", password="manager_password_123"
        )
        self.manager_user.groups.add(self.manager_group)

        self.viewer_user = User.objects.create_user(
            username="ke_toan_xem", password="viewer_password_123"
        )
        self.viewer_user.groups.add(self.viewer_group)

    def test_csrf_endpoint(self):
        """GET /api/auth/csrf/ trả về token và đặt cookie csrftoken."""
        client = Client()
        response = client.get("/api/auth/csrf/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("csrf_token", data)
        self.assertTrue(len(data["csrf_token"]) > 0)
        self.assertIn("csrftoken", client.cookies)

    def test_login_success_and_roles(self):
        """Đăng nhập đúng trả về role tương ứng và tạo session."""
        client = Client()

        # 1. Đăng nhập manager
        res_manager = client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "bep_truong", "password": "manager_password_123"}),
            content_type="application/json",
        )
        self.assertEqual(res_manager.status_code, 200)
        self.assertEqual(res_manager.json()["user"]["role"], "manager")

        # Kiểm tra /api/auth/me/
        me_res = client.get("/api/auth/me/")
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.json()["role"], "manager")
        self.assertEqual(me_res.json()["username"], "bep_truong")

        # Logout
        logout_res = client.post("/api/auth/logout/")
        self.assertEqual(logout_res.status_code, 200)

        # 2. Đăng nhập viewer
        res_viewer = client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "ke_toan_xem", "password": "viewer_password_123"}),
            content_type="application/json",
        )
        self.assertEqual(res_viewer.status_code, 200)
        self.assertEqual(res_viewer.json()["user"]["role"], "viewer")

    def test_login_invalid_password(self):
        """Đăng nhập sai mật khẩu trả về 401."""
        client = Client()
        response = client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "bep_truong", "password": "wrong_password"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("message", response.json())

    def test_login_missing_fields(self):
        """Thiếu username hoặc password trả về 400."""
        client = Client()
        response = client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "bep_truong"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_login_get_method_not_allowed(self):
        """Login chỉ chấp nhận POST, GET trả về 405."""
        client = Client()
        response = client.get("/api/auth/login/")
        self.assertEqual(response.status_code, 405)

    def test_me_unauthenticated_returns_401(self):
        """Chưa đăng nhập gọi /api/auth/me/ trả về 401."""
        client = Client()
        response = client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)

    def test_unauthenticated_access_to_business_api_returns_401(self):
        """Chưa đăng nhập gọi API nghiệp vụ trả về 401."""
        client = Client()
        res_get = client.get("/api/categories/")
        self.assertEqual(res_get.status_code, 401)

        res_post = client.post(
            "/api/categories/",
            data=json.dumps({"code": "TEST", "name": "Test Cat"}),
            content_type="application/json",
        )
        self.assertEqual(res_post.status_code, 401)

    def test_viewer_permission_can_read_but_cannot_write(self):
        """Viewer được phép GET (200), nhưng bị chặn ghi 403 khi POST/PATCH."""
        client = Client()
        client.force_login(self.viewer_user)

        # GET thành công
        get_res = client.get("/api/categories/")
        self.assertEqual(get_res.status_code, 200)

        # POST bị 403
        post_res = client.post(
            "/api/categories/",
            data=json.dumps({"code": "VIEWER_POST", "name": "Thử tạo"}),
            content_type="application/json",
        )
        self.assertEqual(post_res.status_code, 403)
        self.assertIn("manager", post_res.json()["message"])

    def test_manager_permission_can_read_and_write(self):
        """Manager được phép cả đọc (200) và ghi (201/200)."""
        client = Client()
        client.force_login(self.manager_user)

        # POST thành công
        post_res = client.post(
            "/api/categories/",
            data=json.dumps({"code": "MGR_CAT", "name": "Rau Củ Tươi"}),
            content_type="application/json",
        )
        self.assertEqual(post_res.status_code, 201)
        cat_id = post_res.json()["id"]

        # PATCH thành công
        patch_res = client.patch(
            f"/api/categories/{cat_id}/",
            data=json.dumps({"is_active": False}),
            content_type="application/json",
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertFalse(patch_res.json()["is_active"])

    def test_csrf_protection_enforced(self):
        """
        Kiểm tra CSRF thực tế với enforce_csrf_checks=True:
        - POST thiếu CSRF token: bị từ chối 403.
        - POST có CSRF token hợp lệ: thành công 201.
        """
        client = Client(enforce_csrf_checks=True)

        # 1. Lấy CSRF token trước
        csrf_res = client.get("/api/auth/csrf/")
        csrf_token = csrf_res.json()["csrf_token"]

        # 2. Đăng nhập manager với CSRF token
        login_res = client.post(
            "/api/auth/login/",
            data=json.dumps({"username": "bep_truong", "password": "manager_password_123"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(login_res.status_code, 200)
        new_csrf_token = login_res.json()["csrf_token"]

        # 3. Thử POST thiếu header CSRF token -> Phải bị Django chặn 403
        failed_post = client.post(
            "/api/categories/",
            data=json.dumps({"code": "NO_CSRF", "name": "Không token"}),
            content_type="application/json",
        )
        self.assertEqual(failed_post.status_code, 403)

        # 4. Gửi kèm header X-CSRFToken -> Thành công 201
        success_post = client.post(
            "/api/categories/",
            data=json.dumps({"code": "WITH_CSRF", "name": "Có token hợp lệ"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=new_csrf_token,
        )
        self.assertEqual(success_post.status_code, 201)