# BÁO CÁO KẾT QUẢ PHÁT TRIỂN TÍNH NĂNG SF34 VÀ SF40

**Người thực hiện:** TV4 (Cùng TV2 hỗ trợ làm song song)  
**Dự án:** School Food Inventory Management  

---

## 1. TỔNG QUAN
Báo cáo này liệt kê chi tiết các công việc đã thực hiện để hoàn thiện hai tính năng do TV4 phụ trách:
- **SF34:** API báo cáo tồn kho và số lượng giao dịch (Report API).
- **SF40:** Cấu hình Production an toàn cho hệ thống (Security Settings).

## 2. CHI TIẾT TÍNH NĂNG SF34 - API BÁO CÁO
API được xây dựng tại `apps/inventory/views.py` và `urls.py`. Cung cấp dữ liệu phục vụ cho bảng báo cáo của Frontend.

### 2.1. API `GET /api/reports/stock/`
- Trả về danh sách thực phẩm hiện có.
- Sử dụng `annotate(Count('ledger_entries'))` để đếm tổng số giao dịch (nhập/xuất/kiểm kê) của từng mặt hàng rất tối ưu (không bị lỗi N+1 query).
- Tự động tính toán tổng giá trị kho của từng mặt hàng: `stock_value = quantity * avg_cost`. Kết quả được làm tròn 2 chữ số thập phân (`round(..., 2)`).

### 2.2. API `GET /api/reports/transactions/`
- Trả về chi tiết các biến động lịch sử kho (`InventoryLedger`).
- Hỗ trợ lọc (filter) theo `food_id` để xem lịch sử của 1 mặt hàng.
- Hỗ trợ lọc khoảng thời gian từ ngày (`from`) đến ngày (`to`), tự động parse và tìm kiếm an toàn.

### 2.3. Kiểm thử tự động (Unit Test)
- Cập nhật thêm suite `ReportTests` trong `tests.py`.
- Bao phủ các kịch bản: Quản lý xem báo cáo kho (200), Lọc giao dịch chính xác số lượng, và quyền xem của tài khoản Viewer.

## 3. CHI TIẾT TÍNH NĂNG SF40 - CẤU HÌNH PRODUCTION
Đã bổ sung và hoàn thiện file `schoolfood/settings.py` để vượt qua toàn bộ bài kiểm tra `python manage.py check --deploy`.

### Các thiết lập bảo mật cốt lõi:
- Đọc `DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS` từ biến môi trường (`os.getenv`). Tuyệt đối không để lộ mã khóa tĩnh trên code.
- Nếu `DEBUG=False` (Production), hệ thống tự động bật các lớp giáp bảo mật:
  - `CSRF_COOKIE_SECURE = True`: Tránh tấn công đánh cắp phiên.
  - `SESSION_COOKIE_SECURE = True`.
  - `SECURE_SSL_REDIRECT = True`: Ép mọi truy cập phải qua HTTPS.
  - `SECURE_HSTS_SECONDS = 31536000`: Bật Strict-Transport-Security.

## 4. HƯỚNG DẪN GỘP CODE (MERGE CODE)
Khi tạo Pull Request, TV4 và TV2 sẽ gộp chung toàn bộ file thay đổi gồm:
- `apps/inventory/views.py`
- `apps/inventory/urls.py`
- `apps/inventory/tests.py`
- `schoolfood/settings.py`

Nhờ việc tổ chức code theo phương pháp *Append-only* (chèn nối tiếp), sẽ không có conflict lớn nào xảy ra với nhánh chính (`dev1`). Đảm bảo `docker compose exec backend python manage.py test` passed 100%.

## 5. LƯU Ý DÀNH CHO CÁC THÀNH VIÊN KHÁC

### 5.1. Dành cho TV3 (Frontend trang Báo cáo - SF33)
- API `GET /api/reports/stock/` đã trả sẵn trường `stock_value` (tổng tiền kho làm tròn) và `transaction_count` (tổng số lần giao dịch). TV3 chỉ việc map thẳng key này lên UI, tuyệt đối **không cần viết code JS tính toán lại** ở Frontend.
- Khi gọi bộ lọc ngày cho API `GET /api/reports/transactions/`, TV3 truyền đúng định dạng `YYYY-MM-DD` (ví dụ `?from=2026-09-01&to=2026-09-30`). Backend đã tự động tính toán để bao gồm mọi giao dịch đến tận `23:59:59` của ngày kết thúc.

### 5.2. Dành cho TV1 / TV6 (Triển khai & Nghiệm thu)
- Do các thiết lập bảo mật mạnh mẽ từ SF40, khi đưa lên máy chủ thật, **BẮT BUỘC** phải khai báo các biến môi trường:
  - `DEBUG=False`
  - `ALLOWED_HOSTS=tên-miền-thực-tế.com` (Nếu thiếu biến này, mọi Request sẽ văng lỗi HTTP 400).
- Chừng nào chạy local (`DEBUG=True`), các rào cản bảo mật (như ép HTTPS hay Secure Cookie) sẽ tự động tắt để anh em dev dễ dàng.

---
*Báo cáo kết thúc.*
