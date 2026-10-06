# SchoolFood — quản lý kho và bữa trưa trường học

SchoolFood quản lý kho thực phẩm và bữa trưa cho một trường, viết bằng React/TypeScript, Django và PostgreSQL.

- **Chức năng:** danh mục, nhập–xuất–kiểm kê dùng chung một sổ kho; lớp, số suất, món, thực đơn cố định theo thứ (Thứ Bảy tuỳ chọn); nhu cầu → đặt hàng → nhận hàng → xuất bếp → đóng ngày, chi phí mỗi suất; ảnh suất ăn và email thực đơn cho phụ huynh; vai trò Quản lý/Hiệu trưởng, khóa đăng nhập, nhật ký thao tác; báo cáo.
- **Production:** https://schoolfoodusth.store.
- **Tài liệu:** [kiến trúc](architecture.md), [bảo mật và vận hành](docs/SECURITY.md), [quy chuẩn Git](GIT_WORKFLOW.md), [hướng dẫn giao diện](frontend/UI_GUIDE.md).

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

Test backend chạy trên PostgreSQL riêng (bắt buộc vì có trigger PL/pgSQL). Settings từ chối chạy test khi host DB không phải local; không bao giờ trỏ test vào DB thật.

```powershell
$pw = [guid]::NewGuid().ToString('N')
docker run -d --rm --name sf-test-db -e POSTGRES_USER=sf_test -e POSTGRES_PASSWORD=$pw -e POSTGRES_DB=sf_test -p 127.0.0.1:55429:5432 postgres:17-alpine
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
$env:DB_HOST="127.0.0.1"; $env:DB_PORT="55429"; $env:DB_USER="sf_test"; $env:DB_PASSWORD=$pw; $env:DB_NAME="sf_test"
python backend/manage.py test apps.inventory --noinput
docker stop sf-test-db
```

```powershell
docker compose down
```

Lệnh dừng trên giữ volume. Không thêm `-v` nếu cần giữ dữ liệu.

## Deploy

EC2 + Docker Compose + Cloudflare Tunnel. `.env.prod` chỉ nằm trên server. Trên EC2, trong thư mục repo:

```bash
git pull --ff-only && npm run ec2:build && npm run ec2:up && npm run ec2:migrate && npm run ec2:check && npm run ec2:ledger-audit
```

`ec2:migrate` luôn sao lưu DB (pg_dump) trước khi migrate. Các lệnh khác: xem `scripts` trong [package.json](package.json) và [docs/SECURITY.md](docs/SECURITY.md).

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

## Quy trình phát triển

Khảo sát → kế hoạch → chủ dự án duyệt → sửa trên nhánh task → tự kiểm tra → review → PR về dev1. Không tự commit/push/merge khi chưa có yêu cầu tương ứng. Dữ liệu, mật khẩu, `.env*`, `venv`, `node_modules` và log tạm không đưa lên Git.

Mã SF01–SF42 được giữ. Giai đoạn 2 dùng G2.1–G2.5, SF43–SF72.
