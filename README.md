# SchoolFood — quản lý kho và bữa trưa trường học

SchoolFood quản lý kho thực phẩm và bữa trưa cho một trường, viết bằng React/TypeScript, Django và PostgreSQL.

- **Đã có:** nhập–xuất–kiểm kê dùng chung một sổ kho, báo cáo, nền lớp/ngày ăn, món ăn, giao diện "Bếp Nhà Trường". Bản production chạy tại https://schoolfoodusth.store.
- **Đang làm:** bảo mật (vai trò Quản lý/Hiệu trưởng, khóa đăng nhập, nhật ký thao tác), thực đơn cố định theo thứ, gửi email thực đơn cho phụ huynh mỗi sáng.
- **Kế hoạch, hiện trạng và lỗi mở:** [plan_final.md](plan_final.md).

## Bắt đầu theo vai trò

- **AI/agent:** đọc [CLAUDE.md](CLAUDE.md) và [plan_final.md](plan_final.md), rồi khảo sát code liên quan trước khi trình kế hoạch.
- **Thành viên:** đọc [hướng dẫn chung](outputs/team-6/SchoolFood_HuongDan_Chung.md), [task được giao](outputs/team-6/SchoolFood_HuongDan_Task.md), [quy chuẩn Git](GIT_WORKFLOW.md) và [hướng dẫn giao diện](frontend/UI_GUIDE.md).
- **Leader/reviewer:** xem [plan_final.md](plan_final.md), [kiến trúc](architecture.md), [kế hoạch G2](outputs/team-6/GiaiDoan2_KeHoach.md) và [checklist](SchoolFood_Checklist.xlsx).

"Có code", "test đạt" và "đã nghiệm thu" là ba trạng thái khác nhau. Không tự đánh dấu Excel.

## Chạy local bằng Docker

Cần Git và Docker Desktop đang chạy. Clone/pull dev1 theo [quy chuẩn Git](GIT_WORKFLOW.md), giữ thay đổi đang làm trên nhánh riêng.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py seed_demo
```

**Nâng cấp DB cũ (ISSUE-001):** DB từng migrate tại `f00048d` sẽ dừng ở `0008_issue_contract` với lỗi `relation "inventory_issue" already exists`. Không xóa volume, không `--fake`. Chạy lần lượt:

```powershell
docker compose exec backend python manage.py sf_legacy_db_check            # chỉ kiểm tra
docker compose exec backend python manage.py sf_legacy_db_check --apply    # xóa 2 bảng phiếu xuất cũ nếu còn rỗng
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py sf31_ledger_audit --strict
```

Lệnh chỉ xóa hai bảng `inventory_issue`/`inventory_issueline` của bản cũ khi chúng rỗng và đúng schema cũ. Nếu bảng còn dữ liệu, bị bảng khác tham chiếu hoặc schema lạ, lệnh dừng với exit 1 và không sửa gì; khi đó cần kế hoạch chuyển dữ liệu riêng. DB sạch hoặc đã nâng cấp: lệnh báo `clean`/`up_to_date`.

Chỉ migrate/seed trên DB local đã xác nhận. Tài khoản thường được gán group trong Django admin `/admin/`. Không ghi mật khẩu vào repo.

Mở http://localhost:5173 và đăng nhập. Các cổng:
- Django: http://localhost:8001; DB: localhost:5433.
- Trong Docker, backend dùng `db:5432` và Vite gọi `backend:8000`.
- Đổi cổng host bằng `POSTGRES_HOST_PORT` / `BACKEND_HOST_PORT` trong `.env`.

Chạy frontend ngoài Docker: chạy `npm ci` trong `frontend` và đặt `VITE_BACKEND_URL=http://localhost:8001`.

## Kiểm tra

```powershell
docker compose exec backend python manage.py check
docker compose exec backend python manage.py makemigrations --check --dry-run
docker compose exec frontend npm run build
docker compose logs --tail 100 backend frontend
```

Test backend chạy trên PostgreSQL riêng (bắt buộc vì có trigger PL/pgSQL). Lệnh đầy đủ ở [CLAUDE.md §4](CLAUDE.md). Settings từ chối chạy test khi host DB không phải local.

```powershell
docker compose down
```

Lệnh dừng trên giữ volume. Không thêm `-v` nếu cần giữ dữ liệu.

## Deploy

EC2 + Docker Compose + Cloudflare Tunnel. Dùng các lệnh `npm run ec2:*` trong [package.json](package.json), xem [CLAUDE.md §4](CLAUDE.md). `.env.prod` chỉ nằm trên server.

## Cấu trúc chính

| Đường dẫn | Trách nhiệm |
| --- | --- |
| `backend/apps/inventory/models.py`, `migrations/` | Model và schema PostgreSQL (trigger) |
| `backend/apps/inventory/services.py`, `lunch.py` | Giao dịch kho, ngày ăn/số suất |
| `backend/apps/inventory/*views.py`, `urls.py` | HTTP API, validation, quyền/CSRF |
| `backend/apps/inventory/test*.py` | Test logic/API/ràng buộc/concurrency |
| `frontend/src/features/` | Màn hình theo nghiệp vụ |
| `frontend/src/components/`, `lib/`, `services/` | Component dùng chung, định dạng/Decimal/HTTP, gọi API |
| `compose.yaml`, `compose.prod.yaml`, `Dockerfile`, `deploy/` | Môi trường local và production |
| `design/` | Mẫu giao diện gốc |
| `outputs/team-6/` | Thẻ task, kế hoạch G2, contract, checklist, bằng chứng |

## Quy trình phát triển

Khảo sát → kế hoạch → chủ dự án duyệt → sửa trên nhánh task → tự kiểm tra → review → PR về dev1. Không tự commit/push/merge khi chưa có yêu cầu tương ứng. Dữ liệu, mật khẩu, `.env*`, `venv`, `node_modules` và log tạm không đưa lên Git.

Mã SF01–SF42 được giữ. Giai đoạn 2 dùng G2.1–G2.5, SF43–SF72.
