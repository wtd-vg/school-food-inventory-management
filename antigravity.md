# Báo cáo Triển khai Task SF13: Session đăng nhập, CSRF và Phân quyền API

> **Người thực hiện:** Antigravity (hỗ trợ TV1 Leader)  
> **Người review:** TV6  
> **Mã mốc:** M2 (SF13)  
> **Tiêu chí nghiệm thu liên quan:** AC04 trong `SchoolFood_Checklist_6_ThanhVien.xlsx`  
> **Trạng thái:** ✅ **Đã hoàn thành và Test tự động đạt 100% (15/15 tests PASS)**

---

## 1. Tóm tắt các công việc đã thực hiện

Theo đúng đặc tả trong [SchoolFood_HuongDan_Task.md](outputs/team-6/SchoolFood_HuongDan_Task.md) và [SchoolFood_HuongDan_Chung.md](outputs/team-6/SchoolFood_HuongDan_Chung.md), tôi đã hoàn thành đầy đủ 6 hạng mục kỹ thuật của **SF13**:

### 1.1. Tạo mới module xác thực: `backend/apps/inventory/auth_views.py`
Xây dựng 4 endpoint xác thực theo chuẩn REST JSON và 1 decorator bảo vệ quyền:

| Endpoint | Method | Chức năng | Hành vi / Mã HTTP |
| :--- | :---: | :--- | :--- |
| `/api/auth/csrf/` | `GET` | Cấp CSRF token và đặt cookie `csrftoken` | Trả về `{"csrf_token": "..."}`, HTTP 200. |
| `/api/auth/login/` | `POST` | Đăng nhập bằng `username` và `password` | Dùng hàm `authenticate()` của Django. Tuyệt đối không log password. Thành công lưu session, trả thông tin user kèm `role` (`manager` hoặc `viewer`), HTTP 200. Sai pass trả HTTP 401. Thiếu thông tin trả HTTP 400. Gọi GET trả HTTP 405. |
| `/api/auth/me/` | `GET` | Kiểm tra trạng thái phiên đăng nhập | Trả về `{"id": ..., "username": "...", "role": "..."}`. Nếu chưa đăng nhập trả HTTP 401. |
| `/api/auth/logout/` | `POST` | Đăng xuất an toàn | Hủy session trên server (`logout(request)`), trả HTTP 200. |

* **Decorator `@inventory_permission_required`:**
  * Khách chưa đăng nhập (anonymous): Chặn ngay với HTTP `401 Unauthorized`.
  * Phương thức đọc (`GET`, `HEAD`, `OPTIONS`): Cả `manager` và `viewer` đều được phép đọc dữ liệu.
  * Phương thức ghi (`POST`, `PATCH`, `PUT`, `DELETE`): Chỉ tài khoản thuộc nhóm `manager` (hoặc superuser) mới được ghi. Tài khoản `viewer` bị chặn với HTTP `403 Forbidden`.

---

### 1.2. Tự động khởi tạo nhóm quyền: `backend/apps/inventory/apps.py`
* Đăng ký signal `post_migrate` liên kết với hàm `create_default_groups`.
* Mỗi khi chạy `python manage.py migrate`, Django sẽ tự động đảm bảo 2 Group `manager` và `viewer` tồn tại trong database mà không cần người dùng phải vào Django Admin tạo thủ công.

---

### 1.3. Cấu hình CSRF & Session: `backend/schoolfood/settings.py`
* Đã cấu hình các biến bảo mật cho phép Frontend (Vite) giao tiếp an toàn với Backend:
  ```python
  CSRF_COOKIE_HTTPONLY = False       # Để frontend/React đọc cookie csrftoken khi cần
  SESSION_COOKIE_HTTPONLY = True      # Bảo vệ session ID chống XSS
  SESSION_COOKIE_SAMESITE = "Lax"
  CSRF_COOKIE_SAMESITE = "Lax"

  CSRF_TRUSTED_ORIGINS = [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:8000",
      "http://127.0.0.1:8000",
  ]
  ```

---

### 1.4. Đấu nối URL: `backend/apps/inventory/urls.py`
* Khai báo 4 đường dẫn xác thực vào `urlpatterns`:
  * `path("auth/csrf/", get_csrf, name="auth_csrf")`
  * `path("auth/login/", login_view, name="auth_login")`
  * `path("auth/me/", me_view, name="auth_me")`
  * `path("auth/logout/", logout_view, name="auth_logout")`

---

### 1.5. Áp dụng bảo vệ vào các API nghiệp vụ: `backend/apps/inventory/views.py`
* Đã gắn decorator `@inventory_permission_required` vào toàn bộ các API danh mục:
  * `categories` (`GET`, `POST`)
  * `category_detail` (`PATCH`, cấm `DELETE`)
  * `foods` (`GET`, `POST`)
  * `food_detail` (`PATCH`, cấm `DELETE`)
  * `suppliers` (`GET`, `POST`)
  * `supplier_detail` (`PATCH`, cấm `DELETE`)
* Giữ nguyên API `/api/hello/` để phục vụ healthcheck kết nối skeleton ban đầu.

---

### 1.6. Bộ kiểm thử tự động toàn diện: `backend/apps/inventory/tests.py`
Đã viết mới class `AuthAndPermissionTest` kiểm thử đầy đủ các kịch bản thực tế theo tiêu chí **AC04**:
1. `test_csrf_endpoint`: Kiểm tra lấy token và cookie thành công.
2. `test_login_success_and_roles`: Kiểm tra đăng nhập đúng cho cả 2 role `manager` và `viewer`.
3. `test_login_invalid_password`: Kiểm tra đăng nhập sai mật khẩu bị chặn 401.
4. `test_login_missing_fields`: Kiểm tra thiếu username/password bị trả 400.
5. `test_login_get_method_not_allowed`: Kiểm tra login bằng GET bị cấm 405.
6. `test_me_unauthenticated_returns_401`: Chưa login gọi `/api/auth/me/` trả 401.
7. `test_unauthenticated_access_to_business_api_returns_401`: Chưa login gọi API nghiệp vụ trả 401.
8. `test_viewer_permission_can_read_but_cannot_write`: Viewer đọc được (200), nhưng POST/PATCH bị chặn 403.
9. `test_manager_permission_can_read_and_write`: Manager đọc (200) và ghi (201/200) thành công.
10. `test_csrf_protection_enforced`: Sử dụng `Client(enforce_csrf_checks=True)` để test CSRF thật:
    * Gửi POST không có CSRF token: Bị Django chặn ngay với HTTP 403.
    * Gửi POST kèm header `X-CSRFToken` hợp lệ: Thành công HTTP 201.

---

## 2. Bằng chứng kiểm thử (Verification Output)

### Kết quả chạy lệnh test tự động:
```powershell
python backend/manage.py test apps.inventory
```

```text
Creating test database for alias 'default'...
...............
----------------------------------------------------------------------
Ran 15 tests in 12.053s

OK
Destroying test database for alias 'default'...
Found 15 test(s).
System check identified no issues (0 silenced).
```
👉 **Toàn bộ 15/15 test cases đều PASS (Xanh 100%).**

### Kết quả build Frontend:
```powershell
npm --prefix frontend run build
```

```text
> tsc --noEmit && vite build
✓ 29 modules transformed.
✓ built in 815ms
```
👉 Không có xung đột kiểu hay lỗi TypeScript.

---

## 3. Danh sách các file đã chỉnh sửa / tạo mới

1. **Tạo mới:** `backend/apps/inventory/auth_views.py` (Chứa toàn bộ logic auth, session, csrf và decorator phân quyền).
2. **Cập nhật:** `backend/apps/inventory/apps.py` (Thêm signal tạo nhóm `manager` và `viewer`).
3. **Cập nhật:** `backend/schoolfood/settings.py` (Cấu hình CSRF, Session, Trusted Origins).
4. **Cập nhật:** `backend/apps/inventory/urls.py` (Đăng ký 4 routes `/api/auth/*`).
5. **Cập nhật:** `backend/apps/inventory/views.py` (Gắn `@inventory_permission_required` bảo vệ các view).
6. **Cập nhật:** `backend/apps/inventory/tests.py` (Thêm 10 test case toàn diện cho SF13 và AC04).
