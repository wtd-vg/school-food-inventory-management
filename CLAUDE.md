# CLAUDE.md — SchoolFood

Hướng dẫn bắt buộc cho Claude, Codex và mọi agent làm việc trong repo này (AGENTS.md trỏ về đây).

Thứ tự ưu tiên khi mâu thuẫn:
1. yêu cầu trực tiếp của chủ dự án;
2. [plan_final.md](plan_final.md) §1 (quyết định đã chốt);
3. file này;
4. [architecture.md](architecture.md) (thiết kế);
5. [thẻ task](outputs/team-6/SchoolFood_HuongDan_Task.md) (yêu cầu);
6. [Excel checklist](SchoolFood_Checklist.xlsx) (trạng thái nghiệm thu).

Kế hoạch, hiện trạng, lỗi mở và lộ trình nằm **chỉ** trong [plan_final.md](plan_final.md). Không tạo thêm file kế hoạch/báo cáo song song. Bằng chứng để ở `outputs/team-6/evidence/`, log tạm để ở `.tmp/`.

## 1. Dự án là gì

Quản lý kho thực phẩm và bữa trưa cho **một trường / một kho**.

- **Giai đoạn 1 (SF01–SF42):** danh mục, nhập, xuất, kiểm kê, báo cáo, deploy.
- **Giai đoạn 2 (SF43–SF72):** số suất theo lớp → thực đơn → nhu cầu nguyên liệu → đề xuất mua/giữ hàng → đơn đặt → nhận hàng → xuất cho bếp → đối chiếu/đóng ngày. Kế hoạch chi tiết: [GiaiDoan2_KeHoach.md](outputs/team-6/GiaiDoan2_KeHoach.md).
- **Vai trò:** Quản lý (mọi nghiệp vụ), Hiệu trưởng (giám sát, quản lý tài khoản). Phụ huynh không có tài khoản, nhận email thực đơn hôm nay lúc 6h30.
- **Thực đơn:** cố định theo thứ T2–T6, lặp hằng tuần. Chi tiết: plan_final §1 (R9–R12).

Ngoài phạm vi (không tự thêm): AI, nhiều bữa/khẩu phần, hồ sơ học sinh ngoài họ tên/lớp/email phụ huynh, lô/hạn dùng, quy cách đóng gói, trả/hủy sau xuất.

## 2. Stack và bản đồ code (`dev1@6f0bdc7`)

**Backend:** Django 5.2 + PostgreSQL 17 + psycopg 3, viết bằng function view/JsonResponse, không DRF. Trigger PL/pgSQL nên test bắt buộc chạy trên PostgreSQL.

**Frontend:** React 19 + TypeScript 5.9 + Vite 7 + react-router-dom 7, CSS Modules với design tokens "Bếp Nhà Trường". Không dùng UI kit.

| Đường dẫn | Nội dung |
| --- | --- |
| `backend/apps/inventory/models.py`, `migrations/` | Danh mục, Receipt/Issue/StockTake, **StockTransaction** (sổ kho duy nhất), SchoolClass, LunchDay, ClassMealCount, LunchDayEvent, Dish, RecipeComponent; InventoryLedger là legacy, không ghi |
| `services.py`, `lunch.py` | Tạo/chốt nhập–xuất–kiểm kê (lock/version/actor); mở/chốt/mở lại ngày ăn |
| `views.py`, `class_views.py`, `recipe_views.py`, `auth_views.py`, `urls.py` | HTTP API kho/báo cáo, lớp, món + lunch-days, auth/quyền |
| `test*.py`, `management/commands/` | Test; `seed_demo`, `sf31_ledger_audit` |
| `backend/schoolfood/settings.py` | Cấu hình production bắt buộc khi `DEBUG=False`; guard chặn test chạy trên DB host lạ |
| `frontend/src/` | `features/<nghiệp vụ>/` (màn hình), `components/ui`, `components/layout`, `lib/` (decimal, format, http), `services/` (gọi API), `auth/`, `styles/` |
| `frontend/UI_GUIDE.md`, `design/*.html` | Quy tắc giao diện và mẫu gốc |
| `Dockerfile`, `compose.yaml`, `compose.prod.yaml`, `deploy/nginx.conf`, `package.json` | Chạy local, production và lệnh `ec2:*` |

## 3. Đọc trước khi làm

1. Đọc yêu cầu hiện tại. Chạy `git status --short`, `git branch --show-current`, `git log -1 --oneline`; fetch rồi ghi SHA `origin/dev1`. Giữ nguyên thay đổi của người khác.
2. Đọc plan_final.md §1–§3, mục liên quan tới task và các lỗi ở §5.
3. Với task G2: đọc thẻ task, contract trong `outputs/team-6/contracts/` và architecture.md.
4. Khảo sát model, migration, service, API, frontend và test liên quan bằng tìm kiếm. **Không suy luận chức năng đã có từ tài liệu.**

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

- URL local: frontend http://localhost:5173, Django http://localhost:8001, DB localhost:5433. Trong Docker, Vite gọi `backend:8000`; chạy ngoài Docker thì đặt `VITE_BACKEND_URL=http://localhost:8001`.
- Thêm package frontend mới: chạy `docker compose exec frontend npm ci`.
- Vite trên Windows không nhận thay đổi file: chạy `docker compose restart frontend`.

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

**Production (EC2, `~/schoolfood`, file `.env.prod` chỉ nằm trên server):**

```bash
git pull --ff-only origin dev1 && npm run ec2:build && npm run ec2:up && npm run ec2:migrate && npm run ec2:check && npm run ec2:ledger-audit
```

`ec2:migrate` luôn pg_dump trước khi migrate. Không chạy seed demo trên production.

## 5. Quy tắc làm việc bắt buộc

### 5.1 Khảo sát → trình kế hoạch → chờ duyệt → làm

Áp dụng cho mọi thay đổi code/schema/cấu hình. Đọc, tìm kiếm và chạy test không phá dữ liệu thì không cần duyệt.

1. Khảo sát Git và code liên quan.
2. Trình kế hoạch gồm:
   - vấn đề;
   - phương án, kèm phương án đã loại và lý do;
   - file sẽ sửa/tạo;
   - ảnh hưởng dữ liệu/migration;
   - API contract (route, method, JSON, mã lỗi);
   - phụ thuộc;
   - test và bằng chứng dự kiến;
   - rủi ro.
3. **Dừng và chờ chủ dự án duyệt.** Không tạo/sửa file trước khi được duyệt.
4. Đã duyệt thì làm trọn phạm vi, không hỏi lại từng bước nhỏ. Phạm vi đổi đáng kể thì trình bổ sung.

### 5.2 Tự kiểm tra trước khi báo xong

**Backend:**
- Chạy `check`, `makemigrations --check`.
- Viết test **cùng lúc** với code. Concurrency/trigger dùng `TransactionTestCase` trên PostgreSQL. Mỗi case nghiệm thu (AC) phải có test tương ứng.
- Migration phải thử trên cả DB sạch **và** DB nâng cấp.

**Frontend:**
- `npm run build` đạt.
- Thao tác thật bằng tài khoản Quản lý **và** Hiệu trưởng.
- Chụp ảnh ~1280px và ~375px, lưu `outputs/team-6/evidence/<MÃ>_<mô-tả>.png`. Ảnh không thay cho test dữ liệu.

**Báo cáo:**
- Gồm lệnh đã chạy, ngày, commit, exit code, expected/actual, test chưa chạy được và lý do.
- Không chép số liệu test cũ thành kết quả mới.
- Không tự đánh dấu nghiệm thu/review thay thành viên.
- Cập nhật plan_final.md §2/§5 bằng bằng chứng thật.

### 5.3 Nguyên tắc kỹ thuật

- **Decimal:**
  - Decimal ở backend; JSON gửi/nhận decimal dạng **chuỗi**; từ chối float/bool/NaN/Infinity.
  - Kích thước: số lượng Decimal(14,3), tiền Decimal(14,2), giá trị Decimal(28,2).
  - Làm tròn `quantize(ROUND_HALF_UP)`, không dùng `round()`.
- **Nháp và chốt:**
  - Nháp không đổi tồn.
  - Chốt trong `transaction.atomic`: khóa đầu phiếu (`select_for_update(of=("self",))`) rồi FoodItem **theo id tăng dần**; cập nhật quantity/avg_cost/stock_version + StockTransaction trong cùng giao dịch; chống chốt lặp.
  - Không dùng signal cộng/trừ tồn. Thứ tự khóa G2 đầy đủ ở plan_final §3.
- **Mã lỗi:** input sai 400; chưa đăng nhập 401; quyền/CSRF 403; không thấy 404; sai method 405; xung đột version/trạng thái 409. `created_by` lấy từ session. Lỗi không lộ traceback.
- **Migration:** schema đổi → migration mới. Không sửa migration đã merge, không `--fake` mù, không `down -v`. Dữ liệu cũ phải có kế hoạch chuyển và đối chiếu trên DB riêng.
- **Tổ chức mã:** module mới theo nghiệp vụ trong app inventory (`menu_services.py`, `user_views.py`...). Không thêm framework/thư viện (DRF, UI kit, queue...) nếu chưa được duyệt.
- **Bảo mật:**
  - Không đọc/in bí mật từ `.env` / `.env.prod`.
  - Không ghi mật khẩu, token hay SĐT rõ vào log, audit, tài liệu.
  - Mọi API ghi phải qua decorator quyền + CSRF.
- **File chung có chủ:** models/migrations → TV1, `urls.py` → TV4, router/`App.tsx` → TV3.

### 5.4 Git

- Nhánh `feat/SFxx-ten-ngan` (tài liệu: `docs/...`), PR về `dev1`.
- Không commit/push/merge/deploy khi chưa được yêu cầu.
- Không `git add .`; stage từng file đã xem diff.
- Không đưa `.env*`, `venv/`, `node_modules/`, `.tmp/`, `backups/` lên Git.

Chi tiết: [GIT_WORKFLOW.md](GIT_WORKFLOW.md).

## 6. Ví dụ số liệu chuẩn (dùng cho test)

**Nhu cầu và mua:** 300 suất × (60 g + 10 g thịt) = 21 kg; dự phòng 1 kg; tồn phân bổ 5 kg; đang chờ về 4 kg → mua 13 kg.

**Nhận hàng:** đặt 13 kg, nhận 10 kg rồi 3 kg; nhận thêm 4 kg khi chỉ còn thiếu 3 kg → bị chặn.

**Số suất:**
- Lớp 30 học sinh: nhập −1 hoặc 31 suất đều bị chặn; null ≠ 0.
- Tổng suất 30 + 28 + 5 (nhân viên) = 63.

**Giá vốn:** giá vốn của ngày cũ không đổi khi nhập hàng với giá mới.
