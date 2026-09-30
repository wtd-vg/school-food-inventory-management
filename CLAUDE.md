# CLAUDE.md — SchoolFood

Ngữ cảnh cho Claude/agent khi làm việc trong repo này. File này tóm tắt và dẫn tới tài liệu gốc; khi mâu thuẫn, thứ tự ưu tiên là: yêu cầu trực tiếp của chủ dự án → phạm vi đã duyệt → [codex.md](codex.md) → [architecture.md](architecture.md) (thiết kế) → [thẻ task](outputs/team-6/SchoolFood_HuongDan_Task.md) (yêu cầu) → [Excel checklist](SchoolFood_Checklist_6_ThanhVien.xlsx) (trạng thái nghiệm thu).

Chiến lược thực thi G2 và đề xuất USP: [Claude_plan.md](Claude_plan.md). Prompt cho từng task: [Claude_prompt.md](Claude_prompt.md).

@codex.md

## 1. Dự án là gì

Quản lý kho thực phẩm và bữa trưa cho **một trường / một kho**. Giai đoạn 1 (SF01–SF42): danh mục, nhập, xuất, kiểm kê, báo cáo, deploy. Giai đoạn 2 (SF43–SF72, mốc G2.1–G2.5): số suất theo lớp → thực đơn trưa → nhu cầu nguyên liệu → đề xuất mua/giữ hàng → đơn đặt → nhận hàng → xuất cho bếp → đối chiếu/đóng ngày. Kế hoạch: [GiaiDoan2_KeHoach.md](outputs/team-6/GiaiDoan2_KeHoach.md).

Ngoài phạm vi G2 (không tự thêm): AI, nhiều bữa/khẩu phần, hồ sơ từng học sinh, lô/hạn dùng, quy cách đóng gói, gửi tin tự động, trả/hủy sau xuất.

## 2. Stack và bản đồ code

- Backend: Django 5.2.17, psycopg 3, PostgreSQL 17 (bắt buộc — có trigger PL/pgSQL, **không dùng SQLite**). Không DRF: view là function trả `JsonResponse`.
- Frontend: React 19 + TypeScript 5.9 + Vite 7. Chưa dùng router: `App.tsx` đổi màn hình bằng state `Screen`. CSS nhúng trong `App.tsx`.
- Một app duy nhất `backend/apps/inventory/`:

| File | Nội dung hiện tại |
| --- | --- |
| `models.py` | Category, FoodItem (quantity/avg_cost/stock_version), Supplier, Receipt/ReceiptLine/StockTransaction (SF19), InventoryLedger, StockTake/StockTakeItem |
| `migrations/0001–0007` | 0006 chứa trigger PostgreSQL deferred cho phiếu nhập/ledger. **Không sửa migration đã merge** |
| `services.py` | `create_receipt_draft` (SF19) + service kiểm kê (`create_stocktake`, `update_stocktake_item`, `post_stocktake`) — hai khối ghép chung một file |
| `views.py` | API category/food/supplier, stocktake, reports |
| `auth_views.py` | csrf/login/me/logout, `get_user_role`, decorator `inventory_permission_required` (401 anonymous; ghi chỉ manager → 403) |
| `urls.py` | mount dưới `/api/` |
| `tests.py`, `test_receipts.py` | 44 test; `test_receipts` dùng TransactionTestCase + 2 kết nối để thử trigger/concurrency |
| `management/commands/seed_demo.py` | chỉ seed 3 Category |

- Frontend `frontend/src/`: `App.tsx`, `LoginPage`, `CategoryPage`, `FoodPage`, `ReportPage`, `utils/api.ts` (`fetchApi`: gắn X-CSRFToken, `credentials: include`, 401 → phát event `session-expired`).

## 3. Hiện trạng cần biết (khảo sát 29/09/2026, nhánh `docs/g2-lunch-plan`)

Chưa có: `post_receipt` (SF20), API/UI phiếu nhập (SF21/22), toàn bộ xuất kho (SF25–SF30), mọi model/API/UI của G2. Nợ kỹ thuật đã thấy trong code — xử lý trong G2.0/task liên quan, không sửa lẻ ngoài phạm vi được duyệt:

- **Hai sổ kho tách nhau**: `StockTransaction` (nhập, có trigger, bất biến) và `InventoryLedger` (kiểm kê/báo cáo, không ràng buộc). Báo cáo chỉ đọc `InventoryLedger` → bỏ sót giao dịch nhập. Hướng đã duyệt: hợp nhất về `StockTransaction` IN/OUT/ADJUST (architecture.md §2).
- `post_stocktake`: khóa FoodItem không `order_by("id")` (rủi ro deadlock), dùng `ValueError` làm tín hiệu 409, lock `nowait` lỗi trả 400 và `except Exception` nuốt cả `DoesNotExist` (404 thành 400), không lưu người chốt/thời điểm chốt.
- `update_stocktake_item`: `Decimal(chuỗi sai)` → `InvalidOperation` không bắt → 500; nhận float. API trả `float(...)` trái quy ước Decimal-dạng-chuỗi.
- `create_stocktake` không kiểm tra kiểu `food_ids`.
- `is_active` được ép bằng `bool(...)` → chuỗi `"false"` thành `True`.
- `reports_transactions` lọc bằng datetime naive (RuntimeWarning, USE_TZ=True). Test `test_reports_stock` đỏ: API trả `"210.00"` (chuỗi), test mong `210.0` → cần chốt contract (khuyến nghị giữ chuỗi, sửa test).
- `settings.py`: khi chạy test chỉ đổi `NAME`, **host vẫn lấy từ `DATABASE_URL`** nếu có; `SECRET_KEY` có giá trị mặc định cứng và `ALLOWED_HOSTS` mặc định `*`.

## 4. Lệnh thường dùng (Windows PowerShell)

```powershell
# Chạy local
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py check
docker compose exec backend python manage.py makemigrations --check --dry-run
docker compose exec frontend npm run build          # tsc --noEmit + vite build
docker compose logs --tail 100 backend frontend > .tmp/logs.txt
```

URL: frontend http://localhost:5173, Django http://localhost:8001, DB localhost:5433.

**Test backend trên PostgreSQL tách biệt** (không bao giờ trỏ vào DB thật/cloud):

```powershell
$pw = [guid]::NewGuid().ToString('N')
docker run -d --rm --name sf-test-db -e POSTGRES_USER=sf_test -e POSTGRES_PASSWORD=$pw -e POSTGRES_DB=sf_test -p 127.0.0.1:55429:5432 postgres:17-alpine
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
$env:DB_HOST="127.0.0.1"; $env:DB_PORT="55429"; $env:DB_USER="sf_test"; $env:DB_PASSWORD=$pw; $env:DB_NAME="sf_test"
python backend/manage.py test apps.inventory --noinput -v 2 2>&1 | Tee-Object .tmp/test.log
docker stop sf-test-db
```

Chạy một test: `python backend/manage.py test apps.inventory.test_receipts.ReceiptDraftTests.test_option_b_rejects_empty_lines`.

## 5. Quy tắc làm việc bắt buộc

### 5.1 Nghĩ trước — trình kế hoạch — chờ duyệt — mới làm

Với mọi thay đổi code/schema/cấu hình (không áp dụng cho đọc, tìm kiếm, chạy test không phá dữ liệu):

1. Khảo sát: `git status`, nhánh, commit; đọc code liên quan (không suy ra "đã có" từ tài liệu kế hoạch).
2. Trình kế hoạch gồm: vấn đề, phương án (và phương án đã loại + lý do), danh sách file sẽ sửa/tạo, ảnh hưởng dữ liệu/migration, API contract (route, method, JSON request/response, mã lỗi) nếu có, task phụ thuộc, test và bằng chứng dự kiến, rủi ro.
3. **Dừng và chờ chủ dự án duyệt.** Không tạo/sửa file trước khi được duyệt.
4. Đã duyệt thì làm trọn phạm vi, không hỏi lại từng bước nhỏ; phạm vi thay đổi đáng kể thì trình bổ sung.

### 5.2 Tự kiểm tra trước khi báo xong

- Backend: `check`, `makemigrations --check`, unit/integration test cho logic mới (viết test **cùng lúc** với code; concurrency/trigger dùng TransactionTestCase trên PostgreSQL). Mỗi case nghiệm thu AC liên quan phải có test tương ứng.
- Frontend: `npm run build` đạt; chạy app thật, thao tác luồng chính bằng tài khoản manager **và** viewer; chụp ảnh màn hình (rộng ~1280px và ~375px) lưu `outputs/team-6/evidence/SFxx_<mô-tả>.png`. Ảnh không thay cho test dữ liệu.
- Log: lưu log test/server vào `.tmp/` (không commit); tóm tắt không chứa bí mật vào evidence khi cần review.
- Báo cáo gồm: lệnh đã chạy, ngày, commit, exit code, expected/actual, test chưa chạy được và lý do. Không chép số liệu test cũ thành kết quả mới. Không tự đánh dấu nghiệm thu/review thay thành viên.

### 5.3 Nguyên tắc kỹ thuật

- Decimal ở backend; JSON gửi/nhận decimal dạng **chuỗi**; từ chối float/bool/NaN/Infinity. Số lượng Decimal(14,3), tiền Decimal(14,2), giá trị Decimal(28,2), ROUND_HALF_UP.
- Nháp không đổi tồn. Chốt: `transaction.atomic`, khóa đầu phiếu (`select_for_update(of=("self",))`) rồi FoodItem **theo id tăng dần**; cập nhật quantity/avg_cost/stock_version + ledger trong cùng giao dịch; chống chốt lặp. Không dùng signal cộng/trừ tồn.
- Xung đột version/trạng thái → 409; input sai 400; chưa đăng nhập 401; quyền/CSRF 403; không thấy 404; sai method 405. `created_by` lấy từ session. Lỗi không lộ traceback.
- Schema đổi → migration mới; dữ liệu cũ phải có kế hoạch chuyển + đối chiếu trên DB riêng.
- Module mới theo nghiệp vụ trong app inventory (`meal_services.py`, `class_views.py`...), chỉ tạo khi đến task. Không thêm framework/thư viện (DRF, UI kit, queue...) nếu chưa được duyệt.
- File chung có chủ: models/migrations → TV1, `urls.py` → TV4, `App.tsx` → TV3.

### 5.4 Git

Nhánh `feat/SFxx-ten-ngan` (tài liệu `docs/...`), PR về `dev1`. Không commit/push/merge/deploy khi chưa được yêu cầu. Không `git add .`; stage từng file đã xem diff. Không đưa `.env`, `venv/`, `.venv/`, `db.sqlite3`, `node_modules/`, `.tmp/` lên Git. Chi tiết: [GIT_WORKFLOW.md](GIT_WORKFLOW.md).

## 6. Ví dụ số liệu chuẩn (dùng cho test)

300 suất × (60 g + 10 g thịt) = 21 kg; dự phòng 1 kg; tồn phân bổ 5 kg; đang chờ về 4 kg → mua 13 kg. Đặt 13, nhận 10 rồi 3; nhận thêm 4 khi chỉ còn 3 → chặn. Lớp 30 HS: -1 và 31 suất bị chặn; null ≠ 0. Tổng suất 30 + 28 + 5 (nhân viên) = 63. Giá vốn ngày cũ không đổi khi nhập giá mới.
