# SchoolFood — quản lý kho và bữa trưa trường học

SchoolFood đang phát triển với React + TypeScript + Vite, Django và PostgreSQL. Bản local đã có đăng nhập, danh mục, cấu trúc phiếu nhập, kiểm kê và báo cáo; chưa hoàn thiện toàn bộ luồng nhập–xuất. Giai đoạn 2 bổ sung số suất, thực đơn, nhu cầu nguyên liệu, đặt/nhận hàng và đối chiếu bữa trưa.

## Bắt đầu theo vai trò

- Thành viên: đọc [hướng dẫn chung](outputs/team-6/SchoolFood_HuongDan_Chung.md), [task được giao](outputs/team-6/SchoolFood_HuongDan_Task.md) và [quy chuẩn Git](GIT_WORKFLOW.md).
- Leader/reviewer: xem [tiến độ](task_on_progress.md), [kiến trúc](architecture.md), [kế hoạch G2](outputs/team-6/GiaiDoan2_KeHoach.md) và [checklist](SchoolFood_Checklist_6_ThanhVien.xlsx).

## Hiện trạng tại 94c733a (khảo sát 29/09/2026)

| Chức năng | Có trong code | Việc còn lại |
| --- | --- | --- |
| Auth/danh mục | Session/CSRF, manager/viewer, Category/Food/Supplier API; UI login/category/food | Kiểm tra hồi quy và UI Supplier |
| Nhập | Model Receipt/Line/StockTransaction, service tạo nháp, trigger/test | Chốt nhập, API/UI đầy đủ |
| Xuất | Contract trong tài liệu | Model/service/API/UI và nghiệm thu |
| Kiểm kê/báo cáo | Model/API, ReportPage | Thống nhất ledger với SF19; nghiệm thu tích hợp |
| G2 bữa trưa | Kế hoạch SF43–SF72 | Chưa triển khai |
| Deploy | Một phần cấu hình và script | Chưa xác nhận môi trường triển khai hoặc khôi phục |

“Có code” khác “đã nghiệm thu”. Kết quả chạy mới nhất ở [tiến độ](task_on_progress.md). Không dùng README này để tự đánh dấu task hoàn tất.

## Chạy local bằng Docker

Cần Git và Docker Desktop đang chạy. Clone/pull dev1 theo [quy chuẩn Git](GIT_WORKFLOW.md), giữ thay đổi đang làm trên nhánh riêng.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py seed_demo
```

Chỉ migrate/seed trên DB local đã xác nhận. Seed hiện chỉ tạo/cập nhật ba Category, không tạo người dùng hoặc toàn bộ dữ liệu G2. Superuser dùng cho quản trị local; tài khoản thường được gán group manager/viewer trong Django admin `/admin/`. Không ghi mật khẩu vào repo.

Mở http://localhost:5173 và đăng nhập. Django ở http://localhost:8001; DB host localhost:5433. Trong Docker, backend dùng db:5432 và Vite gọi backend:8000. Cổng host đổi bằng POSTGRES_HOST_PORT/BACKEND_HOST_PORT trong .env.

Chạy frontend ngoài Docker: cài dependency bằng npm ci trong frontend; đặt VITE_BACKEND_URL=http://localhost:8001 khi backend ở Compose. Backend ngoài Docker cần DB_HOST=127.0.0.1, DB_PORT=5433 cùng thông tin DB local tương ứng. Không dùng mặc định backend:8000 từ máy host.

## Kiểm tra

```powershell
docker compose exec backend python manage.py check
docker compose exec backend python manage.py makemigrations --check --dry-run
docker compose exec frontend npm run build
docker compose logs --tail 100 backend frontend
```

Unit/integration tests: `python backend/manage.py test apps.inventory --noinput` khi đã cấu hình DB kiểm thử độc lập, hoặc lệnh tương ứng trong container kiểm thử. PostgreSQL bắt buộc vì SF19 có trigger; tài khoản test cần quyền tạo database. Xem hướng dẫn DB test trong [README.md](README.md). Bỏ DATABASE_URL trong process test và đặt rõ DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD; settings hiện chỉ đổi NAME khi thấy lệnh test, chưa bảo vệ host cloud. Không coi build thành công là đã test UI.

```powershell
docker compose down
```

Lệnh dừng trên giữ volume. Không thêm `-v` nếu cần giữ dữ liệu.

## Cấu trúc chính

| Đường dẫn | Trách nhiệm |
| --- | --- |
| backend/apps/inventory/models.py, migrations/ | Model và schema PostgreSQL |
| backend/apps/inventory/services.py | Giao dịch nghiệp vụ |
| backend/apps/inventory/views.py, urls.py, auth_views.py | HTTP, validation, auth/CSRF |
| backend/apps/inventory/tests.py, test_receipts.py | Test logic/API/ràng buộc/concurrency |
| frontend/src/App.tsx và các Page | Màn hình và điều hướng hiện tại |
| frontend/src/utils/api.ts | Session/CSRF và xử lý hết phiên |
| compose.yaml, Dockerfile | Môi trường local |
| outputs/team-6/ | Task, checklist, kế hoạch và bằng chứng |

## Quy trình phát triển

Khảo sát → kế hoạch → chủ dự án duyệt → sửa trên nhánh task → tự kiểm tra → review → PR về dev1. Approval đã có giữ nguyên trong phạm vi; không xin lại mỗi thao tác. Không tự commit/push/merge khi chưa có yêu cầu tương ứng. Dữ liệu, mật khẩu, .env, venv, node_modules và log tạm không đưa lên Git.

Mã SF01–SF42 được giữ. Giai đoạn 2 dùng G2.1–G2.5, SF43–SF72; G2.0 là kiểm tra nền kho, không phải M2 danh mục/auth. Xem checklist để nhận task; task mới đều chưa nghiệm thu.
