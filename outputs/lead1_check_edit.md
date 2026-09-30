# Nhật Ký Thay Đổi & Kiểm Tra Kỹ Thuật (Lead 1 Check & Edit Log)

> **Người thực hiện:** TV1 (Leader) & Antigravity  
> **Thời gian cập nhật:** 24/09/2026  
> **Mục tiêu:** Ghi lại toàn bộ các thay đổi mã nguồn, sửa lỗi kỹ thuật, chuẩn hóa quy chuẩn và trạng thái kiểm thử để phục vụ nghiệm thu các mốc M1, M2 (SF12, SF13, SF14, SF15, SF16).

---

## 1. Bảng tổng hợp các thay đổi theo file

| File thay đổi | Loại thay đổi | Mô tả chi tiết việc đã xử lý |
| :--- | :---: | :--- |
| `backend/apps/inventory/models.py` | Cập nhật | Bổ sung trường `phone = models.CharField(max_length=32, blank=True, default="")` vào model `Supplier` theo đúng đặc tả M2. |
| `backend/apps/inventory/migrations/0004_supplier_phone.py` | Tạo mới | File migration tự động tạo cho trường `phone` của model `Supplier`. |
| `backend/apps/inventory/views.py` | Tái cấu trúc | **1.** Gắn decorator `@inventory_permission_required` bảo vệ toàn bộ 6 view API nghiệp vụ.<br>**2.** Xóa sạch 20 dòng comment phân cách `# =========================`.<br>**3.** Sửa lỗi thụt lề PEP8 ở các khối `status=400` trong `foods` và `suppliers`.<br>**4.** Sửa lỗi tiềm ẩn `KeyError: 'category_id'` gây HTTP 500 (kiểm tra `missing_fields` trước).<br>**5.** Chặn cả 3 trường kho (`quantity`, `avg_cost`, `stock_version`) khi client gửi POST/PATCH.<br>**6.** Chuẩn hóa `.strip().upper()` cho `code` và `.strip()` cho `name` trên tất cả các view.<br>**7.** Thêm sắp xếp `.order_by("id")` cho `categories`, `foods`, `suppliers`.<br>**8.** Xử lý đầy đủ trường `phone` trong GET, POST và PATCH của `suppliers`. |
| `backend/apps/inventory/auth_views.py` | Tạo mới | Module xác thực cho **SF13**: `get_csrf` (`/api/auth/csrf/`), `login_view` (`/api/auth/login/`), `me_view` (`/api/auth/me/`), `logout_view` (`/api/auth/logout/`) và decorator `@inventory_permission_required`. |
| `backend/apps/inventory/apps.py` | Cập nhật | Đăng ký signal `post_migrate` tự động sinh 2 Group `manager` và `viewer` khi migrate. |
| `backend/schoolfood/settings.py` | Cập nhật | Cấu hình `CSRF_COOKIE_HTTPONLY = False`, `SESSION_COOKIE_HTTPONLY = True`, `SESSION_COOKIE_SAMESITE = "Lax"`, `CSRF_TRUSTED_ORIGINS` cho cổng 5173 và 8000. |
| `backend/apps/inventory/urls.py` | Cập nhật | Đăng ký 4 route xác thực `/api/auth/csrf/`, `login/`, `me/`, `logout/`. |
| `backend/apps/inventory/tests.py` | Cập nhật | Viết mới class `AuthAndPermissionTest` kiểm thử đầy đủ AC04 (10 test case mới, tổng 15/15 tests PASS 100%). Bao gồm test CSRF thực tế với `enforce_csrf_checks=True`. |
| `frontend/src/CategoryPage.tsx` | Cập nhật | Sửa nút "Xóa" từ gọi `DELETE` (bị 405) sang gọi `PATCH is_active: false` (soft-delete chuẩn). Cập nhật nút bấm "Ngừng dùng" / "Kích hoạt". |
| `GIT_WORKFLOW.md` | Tạo mới | Bộ quy chuẩn Git cho 6 thành viên: quy tắc không commit `venv/`, đặt tên nhánh `feat/SFxx`, quy trình mở PR về `dev1`. |
| `README.md` | Cập nhật | Liên kết trực tiếp file `GIT_WORKFLOW.md` vào phần đầu hướng dẫn của nhóm. |
| `outputs/sf13.md` | Tạo mới | Tài liệu bàn giao kỹ thuật chi tiết SF13 cho các thành viên làm SF14, SF15, SF16, SF17, SF18. |
| `outputs/team-6/sf13.md` | Tạo mới | Bản sao lưu tài liệu bàn giao SF13 trong thư mục `team-6`. |
| `antigravity.md` | Tạo mới | Báo cáo chi tiết công việc triển khai SF13 và kết quả kiểm thử. |

---

## 2. Chi tiết các lỗi kỹ thuật Backend đã được xử lý triệt để

1. **Lỗi 1 (Model `Supplier` thiếu `phone`):**
   * Đã thêm `phone = models.CharField(max_length=32, blank=True, default="")` vào `models.py`.
   * Đã chạy `makemigrations inventory` sinh migration `0004_supplier_phone.py`.
2. **Lỗi 2 (Copy-paste nhầm trường trong API `suppliers`):**
   * Đã sửa `allowed_fields = {"code", "name", "phone", "is_active"}` (loại bỏ `category_id` và `unit`).
3. **Lỗi 3 (Thụt lề PEP8):**
   * Đã sửa toàn bộ thụt lề sai lệch (từ 16–20 spaces về chuẩn 4 spaces).
4. **Lỗi 4 (Thiếu chuẩn hóa chuỗi `code` và `name`):**
   * Đã thêm `.strip().upper()` cho `code` và `.strip()` cho `name` trong `categories`, `foods`, `suppliers`.
   * Chặn không cho nhập chuỗi toàn khoảng trắng `"   "` (trả HTTP 400).
5. **Lỗi 5 (Hệ thống mở, thiếu Auth & CSRF):**
   * Hoàn thành trọn vẹn task **SF13**: Phân quyền 2 cấp `manager` (đọc & ghi) và `viewer` (chỉ đọc), chặn khách chưa đăng nhập (401), bảo vệ CSRF bắt buộc cho mọi request ghi.
6. **Frontend (SF15 & SF17):**
   * Giữ nguyên mã nguồn frontend để TV3 và TV5 chủ động phát triển giao diện theo phân công chuyên môn.
7. **Kiểm thử tự động Backend (SF13 & SF16 nền tảng):**
   * Đã cập nhật `backend/apps/inventory/tests.py` phủ kín toàn bộ luồng Auth, Session, CSRF thật và phân quyền.

---

## 3. Bằng chứng kiểm tra & Độ tin cậy (Test Evidence)

### 3.1. Chạy test Backend Django
```powershell
python backend/manage.py test apps.inventory
```
**Kết quả:**
```text
Creating test database for alias 'default'...
...............
----------------------------------------------------------------------
Ran 15 tests in 10.461s

OK
Destroying test database for alias 'default'...
Found 15 test(s).
System check identified no issues (0 silenced).
```
👉 **15/15 tests PASS (100% Xanh)**.

### 3.2. Build Frontend TypeScript & Vite
```powershell
npm --prefix frontend run build
```
**Kết quả:**
```text
> schoolfood-frontend@0.1.0 build
> tsc --noEmit && vite build
✓ 29 modules transformed.
✓ built in 815ms
```
👉 **Build thành công 100%, không có lỗi type nào**.
