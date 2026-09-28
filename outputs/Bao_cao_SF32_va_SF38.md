# BÁO CÁO KẾT QUẢ PHÁT TRIỂN TÍNH NĂNG SF32 VÀ SF38

**Người thực hiện:** Nhóm Backend  
**Ngày báo cáo:** 27/09/2026  
**Dự án:** School Food Inventory Management  

---

## 1. TỔNG QUAN
Báo cáo này tóm tắt các hạng mục công việc đã hoàn thành, phương pháp triển khai và những lưu ý quan trọng dành cho team khi tiến hành gộp mã nguồn (merge code) từ nhánh tính năng vào nhánh chính (`dev1`). Hai tính năng chính được hoàn thiện bao gồm:
- **SF32:** Dịch vụ (Service) và API Kiểm kê tồn kho.
- **SF38:** Cấu hình Database Staging và quy trình Backup thử nghiệm.

## 2. CHI TIẾT TÍNH NĂNG SF32 - DỊCH VỤ VÀ API KIỂM KÊ
Tính năng kiểm kê đóng vai trò then chốt trong việc đối soát số lượng thực tế so với sổ sách, giúp hệ thống luôn đồng bộ. Nhóm Backend đã tuân thủ chặt chẽ kiến trúc tách lớp để bảo đảm hiệu suất.

### 2.1. Cấu trúc Dữ liệu (Models)
Các mô hình dữ liệu mới đã được thêm an toàn vào cuối file `apps/inventory/models.py`:
- **`StockTake` (Phiếu kiểm kê):** Quản lý vòng đời của phiếu từ lúc nháp (Draft) đến lúc chốt (Posted).
- **`StockTakeItem` (Chi tiết kiểm kê):** Ghi nhận tình trạng kho lúc bắt đầu (`snapshot_qty`, `snapshot_version`) và lưu trữ số đếm thực tế (`counted_qty`) để tính ra độ chênh lệch (`variance`).
- **`InventoryLedger` (Sổ lưu biến động):** Sổ cái kiểm toán. Chỉ tự động sinh ra khi quá trình kiểm kê phát hiện có chênh lệch kho.

### 2.2. Tầng Dịch vụ (Service Layer)
Nhằm tách biệt logic nghiệp vụ khỏi tầng giao tiếp API, toàn bộ luồng xử lý phức tạp được đóng gói tại `apps/inventory/services.py` với các đặc tính kỹ thuật sau:
- **Đảm bảo tính ACID:** Các hàm được bọc bằng `@transaction.atomic`. Nếu có bất kỳ lỗi nào xảy ra khi đang xử lý một danh sách dài hàng hóa, toàn bộ thay đổi sẽ được rollback về trạng thái an toàn.
- **Pessimistic & Optimistic Locking:** Khi chốt phiếu (`post_stocktake`), dữ liệu kho được khóa tạm thời bằng `select_for_update`, đồng thời đối chiếu `stock_version` (khóa lạc quan). Kỹ thuật này chặn đứng mọi giao dịch sửa đổi kho khác có thể xảy ra song song, loại bỏ hoàn toàn rủi ro Race Condition.

### 2.3. Cổng giao tiếp API & Phân quyền
Khai báo 3 Endpoints mới (POST tạo phiếu, PATCH điền số, POST chốt phiếu) trong `urls.py` và `views.py`. 
Tất cả đều phải đi qua Middleware xác thực `@inventory_permission_required`, giới hạn quyền truy cập chỉ dành cho tài khoản có role `manager`.

### 2.4. Kiểm thử tự động (Unit Testing)
Suite test `StockTakeTests` (trong `tests.py`) đã vượt qua (Pass) 100% các Acceptance Criteria:
- Kiểm tra thành công toàn bộ vòng đời tạo phiếu và chốt phiếu.
- Chặn thành công lỗi Chốt lặp (Double Post) với mã trả về HTTP 400.
- Chặn thành công thao tác chốt khi Snapshot dữ liệu đã cũ (Outdated Snapshot) với mã trả về HTTP 409.

## 3. CHI TIẾT TÍNH NĂNG SF38 - CẤU HÌNH DATABASE STAGING

### 3.1. Cấu hình Cơ sở dữ liệu và Bảo vệ Test Runner
Tại `schoolfood/settings.py`:
- Thay vì ghi đè mã cứng, hệ thống đã hỗ trợ trích xuất URL kết nối DB thông qua biến môi trường `DATABASE_URL` để bảo mật trên môi trường Cloud/Staging (Chuẩn 12-Factor App).
- **Đã chèn cơ chế bảo vệ Test Runner:** Nếu lệnh `python manage.py test` được gọi, hệ thống lập tức ngắt kết nối khỏi DB thật và chuyển sang dùng Database ảo `test_schoolfood_local`. Xóa bỏ hoàn toàn rủi ro làm mất dữ liệu Production.

### 3.2. Sửa lỗi kết nối Frontend Vite Proxy
Thêm biến `VITE_BACKEND_URL: http://backend:8000` vào khối cấu hình của Frontend trong `compose.yaml`. Thay đổi này khắc phục triệt để sự cố Vite Proxy gặp lỗi 500 khi không tìm thấy Backend trong mạng nội bộ của Docker.

### 3.3. Tự động hóa Backup/Restore
Cung cấp script `backup_restore.ps1` cho phép kỹ sư vận hành tự động quá trình tải bản sao (dump) từ Staging về máy local thông qua công cụ dòng lệnh pg_dump.

## 4. HƯỚNG DẪN GỘP CODE (MERGE CODE) DÀNH CHO TEAM
Để việc gộp nhánh diễn ra suôn sẻ, các thành viên cần thực hiện:
1. **Giải quyết Xung đột (Resolve Conflict):** Tại file `views.py` và `urls.py`, nếu bị báo Conflict do nhiều người cùng chèn code, hãy chọn *"Accept Both Changes"*. Code của nhánh này đã được thiết kế nối tiếp vào cuối file nên không gây ảnh hưởng.
2. **Chạy Migrations:** Bắt buộc chạy `docker compose exec backend python manage.py makemigrations` và `python manage.py migrate` ngay sau khi merge xong để khởi tạo bảng.

---
*Báo cáo kết thúc.*
