# plan_final — kế hoạch, hiện trạng và lỗi mở của SchoolFood

Cập nhật **01/10/2026** tại `origin/dev1@6f0bdc7`. Đây là **nguồn kế hoạch duy nhất**, thay cho ROADMAP.md, issue.md, AGENT_HANDOFF.md, task_on_progress.md, Claude_plan.md và Claude_prompt.md. Các file cũ đã được chuyển ra `E:\schoolfood-archive\`, không còn trong repo.

Các file còn lại trong repo:
- Quy trình làm việc và lệnh: [CLAUDE.md](CLAUDE.md).
- Thiết kế dữ liệu: [architecture.md](architecture.md).
- Yêu cầu từng SF: [thẻ task](outputs/team-6/SchoolFood_HuongDan_Task.md).
- Trạng thái nghiệm thu: [Excel checklist](SchoolFood_Checklist.xlsx).

Khi mâu thuẫn, thứ tự ưu tiên: yêu cầu trực tiếp của chủ dự án → **§1 file này** → CLAUDE.md → architecture.md → thẻ task → Excel.

> **Agent đọc thế nào:** bắt buộc §1–§3, rồi mục của việc được giao. Không suy ra "đã có" từ tài liệu; luôn kiểm tra code trên `origin/dev1`.

---

## 1. Quyết định đã chốt

| # | Quyết định | Hệ quả |
| --- | --- | --- |
| R1 | **Phạm vi:** G2 (SF43–SF72), deploy M6 (SF37–SF42), G3 (U1, U3, U4, U5). Từ 01/10 thêm: danh sách học sinh + email phụ huynh và **email thực đơn tự động** (thay U2 cổng phụ huynh). | Vẫn ngoài phạm vi: lô/hạn dùng, AI, nhiều bữa/khẩu phần, hồ sơ học sinh ngoài họ tên/lớp/email phụ huynh, trả/hủy sau xuất. Không dùng Zalo OA (xác thực quá lâu). |
| R2 | SF25/31/43 đã merge (#21/#22/#24); hai migration 0008 nối tại 0012. | Không xóa migration 0008, không chạy lại kế hoạch hợp nhất cũ. |
| R3 | Không có dữ liệu thật trước deploy; production (EC2) hiện chưa có user. | Mọi tái lập DB phải xác nhận đúng đích và phạm vi; không `down -v` / `--fake` mù. |
| R4 | 6 thành viên, mỗi người có agent AI. | Chủ file chung: models/migrations → TV1, `urls.py` → TV4, router/`App.tsx` → TV3. Hẹn thứ tự merge khi đụng file chung. |
| R5 | Frontend "Bếp Nhà Trường" **đã xong** (PR #29–#32): react-router, design tokens, CSS Modules. | Màn mới dùng component có sẵn theo [frontend/UI_GUIDE.md](frontend/UI_GUIDE.md); mẫu gốc ở `design/*.html`. Không thêm UI kit. |
| R6 | Demo ≠ nghiệm thu. | Excel chỉ cập nhật bằng bằng chứng, bởi đúng owner/reviewer. |
| R7 | **Deploy:** EC2 t4g.small (Sydney) + Docker Compose + Cloudflare Tunnel tại `schoolfoodusth.store` (SF38, PR #33). | PostgreSQL chạy trong container, không publish cổng. Lệnh `npm run ec2:*` trong `package.json`. |
| R8 | Nhánh `SF21+SF27` không merge. | Logic nhập/xuất đã dựng lại trên UI mới. |
| R9 | **Vai trò (01/10):** **Quản lý** làm mọi nghiệp vụ; **Hiệu trưởng** giám sát (xem tất cả, quản lý tài khoản, xem nhật ký, không nhập/xuất); **bỏ viewer**; không có tài khoản phụ huynh. | Đổi decorator quyền, frontend `canWrite`. Xem §4 PR1. |
| R10 | **Thực đơn cố định (01/10):** mỗi thứ T2–T6 một thực đơn, lặp hằng tuần; nghỉ T7/CN + ngày lễ do admin đánh dấu; sửa thì áp dụng từ ngày chọn, ngày cũ giữ bản chụp. | Thay mô hình "thực đơn tuần lập mới" của SF52. Xem §4 PR2. |
| R11 | **Phụ huynh nhận email thực đơn hôm nay** — *từ 01/10 chiều (SF74): không tự gửi 6h30; Quản lý bấm "Gửi thư cho phụ huynh" sau khi tải ảnh, thư gồm thực đơn + ảnh suất ăn thực tế (nhúng inline); `MENU_AUTO_SEND=true` để bật lại tự gửi* (đổi từ Zalo ZNS ngày 01/10 vì xác thực OA quá lâu). Gửi qua SMTP: Gmail App Password trước, SES khi cần. Email được mã hóa, che khi hiển thị, lưu xác nhận đồng ý, có link hủy nhận, xóa hẳn khi bé nghỉ. | Thêm dependency `cryptography`; gửi mail dùng sẵn Django. Xem §4 PR3. |
| R12 | **Bảo mật:** khóa đăng nhập sai (backend + Cloudflare), mật khẩu ≥ 10 ký tự, phiên 30 phút không thao tác / tối đa 12 giờ, audit log có màn xem, Cloudflare Access cho `/admin`. | Xem §4. |
| R13 | **Ảnh suất ăn thực tế (SF73, 01/10):** Quản lý chụp/tải 1–5 ảnh mỗi ngày ăn ở trang Hôm nay; Hiệu trưởng chỉ xem. Lưu trên ổ EC2 (volume `media_data`), không công khai, nén ≤ 1600px JPEG, bỏ EXIF/GPS. Sau đăng nhập mở thẳng **Hôm nay**. | Thêm dependency `Pillow`; `backup.sh` sao lưu cả ảnh. Chưa gửi ảnh cho phụ huynh. |
| R14 | **Dữ liệu mẫu trên production (01/10):** chủ dự án yêu cầu nạp `seed_sample --production`, giữ dữ liệu đã nhập. | Email phụ huynh mẫu đuôi `.invalid`, không bao giờ gửi qua SMTP; không tạo tài khoản demo. |

### 1.1 Đề xuất

| # | Đề xuất | Trạng thái |
| --- | --- | --- |
| P1 | Helper validate dùng chung (JSON object, bool, Decimal chuỗi, ngày) | **Duyệt**, làm trong PR1 (`http_input.py`) |
| P2 | Exception `Conflict` chung | Chờ duyệt |
| P3 | GitHub Actions: PG17 + check + test + build trên mọi PR | Chờ duyệt |
| P4 | Xóa bảng `InventoryLedger` (legacy) | Chờ duyệt, phải kiểm kê dữ liệu trước |
| P5 | gunicorn production | **Đã làm** (SF38) |
| P6 | S3 lưu ảnh chứng từ/kiểm thực (U5) | Ảnh suất ăn (R13) dùng ổ EC2; S3 vẫn chờ duyệt cho U5 |
| P7 | U1 mức thu/suất đưa lên sớm | Chờ duyệt |

---

## 2. Hiện trạng (`dev1@6f0bdc7`, 01/10/2026)

| Khu vực | Đã có | Còn thiếu / lỗi |
| --- | --- | --- |
| Kho: nhập, xuất, kiểm kê | Model/service/API, một sổ `StockTransaction` IN/OUT/ADJUST, lock/version/actor, trigger | ISSUE-004/005/006/007/008 |
| Báo cáo | Tồn kho, sổ giao dịch (đọc `StockTransaction`) | Báo cáo ngày (SF70) |
| Lớp / ngày ăn (SF43–46) | Model + `lunch.py`; API `lunch-days/<date>/counts\|lock\|reopen` | ISSUE-002 (`grade`); UI nhập suất SF45/47 |
| Món / công thức (SF49–50) | Dish, RecipeComponent, API một phần | ISSUE-003 precision; thực đơn cố định (PR2) |
| Nhu cầu → đặt → nhận → xuất ngày (SF55–SF70) | — | Chưa làm |
| Auth | Session/CSRF, manager/viewer | Toàn bộ §4 PR1; ISSUE-009 |
| Frontend | Shell + router, Kho (tồn, nhập, xuất, kiểm kê, danh mục), Món, Lớp, NCC, Báo cáo, Đăng nhập | Màn của PR1–3, màn G2 còn lại |
| Deploy | Dockerfile, `compose.prod.yaml`, nginx, Cloudflare Tunnel, settings production, guard test DB | Backup định kỳ, CSP, Cloudflare Access (PR4); EC2 đang cần mở SSH để deploy bản mới |
| Test | 99 test đạt trên PG17 riêng (01/10, `6f0bdc7`); **267 test đạt** trên nhánh `feat/SF73-meal-photos-sample-data` (01/10 chiều, gồm G2, ảnh, dữ liệu mẫu) | — |
| Ảnh suất ăn (SF73) | Model `MealPhoto` (0021), API `lunch-days/<date>/photos/`, `meal-photos/<id>/(image/)`, khu ảnh ở trang Hôm nay; bằng chứng `outputs/team-6/evidence/SF73_*.png` | Gửi ảnh cho phụ huynh (chưa duyệt) |
| Dữ liệu mẫu | `seed_sample`: 20 nguyên liệu, 11 món, thực đơn T2–T6, 6 lớp, 30 học sinh, 10 ngày ăn đã đóng | — |
| Video giới thiệu (SF76, 02/10) | Thẻ "Xem video giới thiệu" ở trang đăng nhập mở khung phát trang tĩnh `/gioi-thieu/` (GSAP 3.12.5, Tone.js 14.8.49 tự host, font app); nginx cho nhúng cùng origin riêng đường dẫn này; thử trên nginx 1.27 + CSP thật: phát được, console không vi phạm CSP; bằng chứng `outputs/team-6/evidence/SF76_*.png` | Thuyết minh tiếng Anh, chưa có bản tiếng Việt |
| Trang đăng nhập mới (SF77, 02/10) | Nền WebGL tự viết (vòng kính mờ bẻ sáng/tách màu giữa phiến pastel, màu từ `tokens.css`, tự hạ chất lượng trên máy yếu, khung tĩnh khi giảm chuyển động, nền CSS khi không có WebGL); thẻ chia đôi form + ô cửa; video đổi sang teaser 1 phút (`/gioi-thieu/`, CSP riêng cho blob của Tone.js); thử nginx 1.27 + CSP thật: console sạch, 165 FPS trên RTX 3050; bằng chứng `SF77_*.png` | Chưa đo trên máy cấu hình yếu thật |
| Làm mới giao diện app (SF78 PR1–3, 02/10) | PR1: token + component dùng chung (bảng trong thẻ nổi, Badge chấm trạng thái, tab màu nhấn, tiêu đề Baloo, StatTile/StatGrid); PR2: khung app màu phẳng (bỏ gradient theo yêu cầu chủ dự án), mục đang chọn màu đào, hiệu ứng chuyển khu; PR3: Hôm nay có ô số liệu, thanh tiến trình 7 bước ngang, thẻ "Việc tiếp theo", thẻ thực đơn, lưới chi tiết bước (`todaySteps.ts` tách logic, không đổi). Bằng chứng `SF78_*.png` (Quản lý + Hiệu trưởng, 1280/375) | PR4 (màn danh sách), PR5 (chuyển động) chờ chủ dự án xem PR1–3 |

"Có code", "test đạt" và "đã nghiệm thu" là ba trạng thái khác nhau.

---

## 3. Luật chung cho mọi agent (bổ sung CLAUDE.md §5)

1. Nhánh gốc là `origin/dev1` đã fetch và ghi SHA. Không tự pull/rebase/stash/reset workspace bẩn.
2. **Một sổ kho:** mọi thay đổi tồn đi qua `StockTransaction`. **Cấm ghi `InventoryLedger`.**
3. **Thứ tự khóa:** đầu chứng từ (`select_for_update(of=("self",))`) → `LunchDay`/`DemandRevision`/`PurchaseOrder` → `FoodItem` theo id tăng dần → `StockAllocation` theo id tăng dần → `PurchaseOrderLine` theo id tăng dần.
4. Không dùng `nowait`, không `except Exception`. Bắt đúng `DoesNotExist` → 404; xung đột version/trạng thái → 409.
5. **Decimal:** chuỗi trong JSON; từ chối float/bool/NaN/Infinity; dùng `quantize(ROUND_HALF_UP)`, không dùng `round()`.
6. **Migration:** không sửa migration đã merge; số mới theo §7; đổi schema phải có kế hoạch chuyển dữ liệu.
7. **Test cùng code:** service chốt nào cũng có test rollback. Trigger/đồng thời dùng `TransactionTestCase` trên PG riêng.
8. Không xóa test của người khác; không tự merge PR của mình (trừ khi chủ dự án yêu cầu).
9. **Bảo mật:**
   - Không ghi mật khẩu, token hay SĐT rõ vào log, audit, tài liệu.
   - Mọi API ghi phải qua decorator quyền và CSRF.
   - Mọi thao tác ghi gọi `audit.record` (sau PR1).
10. **Bàn giao:** lệnh đã chạy, commit, exit code, expected/actual, việc chưa chạy được. Log để ở `.tmp/`.

---

## 4. Việc đang làm: Security + vai trò + thực đơn cố định + email phụ huynh (4 PR, theo thứ tự)

Phần backend được chia cho 4 người theo **§10** (mã BE-xx); frontend do TV3/TV5 làm. Bốn khối PR1–PR4 dưới đây là phạm vi và thứ tự merge. Mỗi task BE-xx là một PR riêng về `dev1`.

### PR1 — `feat/SEC01-roles-auth-audit`

- **Vai trò:**
  - `get_user_role()` trả `manager` | `principal` | `None`; superuser có cả hai vai trò.
  - Tài khoản không có vai trò → 403 khi đăng nhập.
  - Decorator: đọc cho cả hai vai trò, ghi chỉ manager; thêm `principal_required`.
  - Migration `0014_roles_security` tạo group.
- **Chống dò mật khẩu:**
  - Bảng `LoginThrottle` (khóa bằng `select_for_update`).
  - Sai 5 lần / 15 phút theo username, hoặc 20 lần / 15 phút theo IP → 429 + `Retry-After`. Thông báo chung, không lộ username tồn tại.
  - IP lấy từ `X-Real-IP` (nginx lấy từ `CF-Connecting-IP`), chỉ khi `TRUST_PROXY_IP=true`.
- **Mật khẩu và phiên:**
  - Validator: ≥ 10 ký tự, mật khẩu phổ biến, giống username, toàn số.
  - `SESSION_COOKIE_AGE=1800` + `SESSION_SAVE_EVERY_REQUEST`.
  - Middleware giới hạn tuyệt đối 12 giờ.
  - Đặt lại mật khẩu hoặc khóa tài khoản → hủy các phiên khác.
- **Audit log:**
  - Model `AuditLog`, append-only bằng trigger.
  - `audit.record()` gọi tường minh trong cùng transaction; không ghi mật khẩu/SĐT.
  - API `GET /api/audit-logs/` (principal, có lọc, 50 dòng/trang).
- **Quản lý tài khoản (principal):**
  - `GET/POST /api/users/`, `PATCH /api/users/<id>/`, `POST /api/users/<id>/reset-password/`.
  - Chặn: tự khóa/hạ quyền mình, bỏ principal cuối cùng, sửa superuser.
- **Sửa issue:**
  - `http_input.py` (P1) đóng ISSUE-004/005/006/008.
  - `/api/hello/` chỉ trả `{"ok": true}`.
- **Test** (`test_security.py`, `enforce_csrf_checks=True`), đóng ISSUE-009:
  - 401 / 403 / CSRF;
  - khóa đăng nhập theo username và theo IP;
  - hết hạn phiên;
  - hủy phiên khác;
  - audit append-only;
  - probe đầu vào sai.
- **Frontend:**
  - Vai trò Quản lý/Hiệu trưởng; nút ghi khóa với Hiệu trưởng.
  - Màn `/tai-khoan`, `/nhat-ky`.
  - Login báo 429; hết phiên → `/dang-nhap`.
- **Tài liệu:** cập nhật architecture.md (vai trò, security) và §5 file này.

### PR2 — `feat/SF49-SF52-fixed-menu`

- **Model:**
  - `RecipeComponent.quantity` → `Decimal(14,6)`, CHECK > 0 (đóng ISSUE-003; kiểm tra dữ liệu 0 trước).
  - `MenuVersion(effective_from)` + `MenuVersionItem(weekday 0–4, dish)`, bất biến.
  - `SchoolHoliday`.
  - `DayMenuSnapshot(date, items JSON)`, bất biến.
- **Quy tắc:**
  - Ngày D là T7/CN hoặc lễ → nghỉ.
  - D đã có snapshot → dùng snapshot; chưa có → dùng version mới nhất có `effective_from ≤ D`.
  - Sửa thực đơn = version mới với `effective_from ≥ ngày mai`, mỗi thứ ≥ 1 món, món phải có công thức.
- **API:**
  - `GET /api/menu/week/?date=`;
  - `GET/POST /api/menu/versions/`;
  - `GET/POST /api/holidays/`, `DELETE /api/holidays/<id>/`;
  - `GET /api/dishes/<id>/`.
- **Test:** 60 g → 0.060000 kg; 0,4 g giữ đúng; chặn kg ↔ lít; version đúng ngày; snapshot không đổi khi sửa công thức; Hiệu trưởng ghi → 403.
- **Frontend:** tab "Thực đơn tuần" trong `/mon-an` (lưới T2–T6, sửa thực đơn cố định, lịch sử, ngày nghỉ).

### PR3 — `feat/SEC02-students-email`

- **Kênh gửi:** email qua SMTP có sẵn của Django (`django.core.mail`), **không thêm thư viện gửi mail**.
  - Bắt đầu bằng Gmail + App Password (`smtp.gmail.com:587`, TLS).
  - Giới hạn khoảng 500 người nhận/ngày (Workspace khoảng 2.000). Vượt thì đổi biến môi trường sang AWS SES SMTP, không sửa code.
- **Mã hóa:**
  - `cryptography` (MultiFernet) với khóa `FIELD_ENCRYPTION_KEYS`.
  - `email_hash` = HMAC (`CONTACT_HASH_KEY`); `email_hint` = "ng•••@gmail.com".
- **Model:**
  - `Student(class, full_name)`;
  - `ParentContact` (email mã hóa, tối đa 2/bé, có `consent_at`, `unsubscribed_at`);
  - `NotificationLog` (unique ngày + email_hash).
- **API:**
  - CRUD `/api/students/`; DELETE = bé nghỉ → xóa hẳn.
  - `POST /api/students/import/` (CSV, có dry-run, lưu toàn bộ hoặc không lưu gì).
  - `POST /api/parent-contacts/<id>/reveal/` (ghi audit).
  - `GET /api/notifications/`, `POST /api/notifications/send/`.
  - Công khai: `POST /api/unsubscribe/<token>/` (token ký số); trang SPA `/huy-nhan/:token` gọi API này.
- **Gửi tin:**
  - `EMAIL_MODE=dry_run|smtp`.
  - Lệnh `send_daily_menu`: bỏ qua ngày nghỉ → snapshot → mỗi email 1 thư/ngày (thư riêng từng người, không To/CC chung); advisory lock chống chạy trùng.
  - Service `scheduler` trong compose chạy lúc 06:30 Asia/Ho_Chi_Minh, chạy bù nếu khởi động lại trễ.
- **Frontend:** trong `/lop-hoc`:
  - tab "Học sinh": che email, nút hiện, import CSV;
  - tab "Thư thực đơn": nhật ký, gửi lại, gửi thử tới chính mình.

### PR4 — `feat/SEC03-deploy-hardening`

- **nginx:**
  - `X-Real-IP` lấy từ `CF-Connecting-IP`;
  - CSP, `X-Frame-Options DENY`, `Permissions-Policy` cho SPA;
  - rate-limit `/api/auth/login/`.
- **Biến môi trường:** khóa mã hóa và `EMAIL_*` trong `.env.prod.example`; lệnh `ec2:genkeys` chỉ in hướng dẫn, không in khóa.
- **Backup:** `deploy/backup.sh` (pg_dump, giữ 14 ngày) + cron 2h sáng. Khóa mã hóa phải cất ngoài server.
- **`docs/SECURITY.md`** — các bước chủ dự án tự làm:
  - Cloudflare Access cho `/admin`;
  - rule rate-limit Cloudflare;
  - xoay tunnel token đã lộ;
  - Security Group SSH chỉ cho My IP;
  - `check --deploy`;
  - tạo Gmail gửi thư (bật xác minh 2 bước → App Password → điền `EMAIL_HOST_PASSWORD` vào `.env.prod`); khi cần thì chuyển sang SES;
  - mẫu phiếu đồng ý nhận email của phụ huynh.

**Kiểm tra mỗi PR:**
- Lệnh: `check`, `makemigrations --check`, toàn bộ test trên PG riêng, `npm run build`.
- Thao tác thật bằng tài khoản Quản lý và Hiệu trưởng.
- Ảnh 1280px / 375px lưu `outputs/team-6/evidence/SEC_*.png`.

**Rủi ro:**
- Gmail giới hạn khoảng 500 người nhận/ngày và có thể đưa thư vào Spam. Cần đổi sang SES nếu trường đông hoặc thư hay vào Spam.
- Mất khóa mã hóa = mất email phụ huynh.
- CSP có thể chặn tài nguyên chưa lường trước.
- Đụng file chung của TV1/TV4.

---

## 5. Lỗi đang mở

Phát hiện trong audit 30/09 (`7df9bcf`), đã đối chiếu lại tại `6f0bdc7`. Owner là đề xuất.

| ID | Ưu tiên | Vấn đề | Tái hiện | Điều kiện đóng | Xử lý |
| --- | --- | --- | --- | --- | --- |
| ISSUE-001 | P1 | DB từng migrate tại `f00048d` không nâng cấp được: `relation "inventory_issue" already exists` ở `0008_issue_contract` | Migrate `f00048d` rồi migrate bản mới trên cùng DB | DB sạch và DB nâng cấp đều chạy; ledger đối chiếu đạt; không `--fake` mù, không xóa 0008 | **BE-01** (TV1) |
| ISSUE-002 | P1 | API lớp: `enrolled` đã có, **`grade` vẫn bị bỏ qua** khi POST/PATCH/GET | POST `{"grade":"5"}` → DB `null` | Tạo/sửa/đọc đúng; sai kiểu → 400; snapshot ngày cũ không đổi | **BE-12** (TV4) |
| ISSUE-003 | P1 | Công thức 0,4 g lưu thành 0 kg (cột 3 số lẻ) | POST dish component `0.4 g` | 0,4 g giữ đúng hoặc 400 rõ ràng | **BE-03 + BE-06** (TV1, TV2) |
| ISSUE-004 | P1 | POST `/api/issues/` với ngày `2026-99-99` hoặc lượng `0.0004` → 500 | Probe | 400 JSON; không để lại đầu phiếu mồ côi; tồn không đổi | **BE-09** (TV4) |
| ISSUE-005 | P2 | Body `[]` → 500 ở classes/dishes/login | Probe | 400 JSON, có test từng endpoint | **BE-09** (TV4) |
| ISSUE-006 | P2 | `{"is_active":"false"}` → lưu true (`bool(...)` ở 5 chỗ) | Probe category | Chỉ nhận boolean JSON; sai → 400 | **BE-09** (TV4) |
| ISSUE-007 | P2 | Phiếu hiển thị `0.00` nhưng sổ ghi `0.01` (view dùng `round()`, service dùng HALF_UP) | 0.500 × 0.01, tạo → chốt → GET | draft/detail/ledger/report khớp; không sửa ledger cũ | **BE-05** (TV2) |
| ISSUE-008 | P2 | API nhập nhận float JSON | POST quantity `0.1` (số) → 201 | float/bool/NaN bị chặn tại biên HTTP | **BE-09** (TV4) |
| ISSUE-009 | P1 | Mất bộ hồi quy auth/CSRF SF13 (PR #15) | Không có test nào dùng `enforce_csrf_checks` | Bộ test chạy với CSRF bật thật | **BE-16** (TV6) |
| ISSUE-011 | P1 | API ngày ăn SF46 (`recipe_views.py` `lunch_day_*`): GET tự tạo ngày (đọc mà ghi); PUT không kiểm tra kiểu/giới hạn suất, `class_id` sai bị bỏ qua im lặng, tăng version kể cả khi không đổi gì; `except Exception` trả lỗi DB thô; dùng group `viewer` để chặn | Đọc code 01/10; PUT `planned: 31` cho lớp 30 HS → 400 với thông điệp IntegrityError | GET không ghi; PUT validate từng dòng → 400 có field; lớp không thuộc ngày → 400; lỗi DB không lộ; quyền theo decorator | **BE-12** (TV4) |
| ~~ISSUE-010~~ | — | Cấu hình production lỏng, test không chặn host lạ | — | **Đã đóng** bởi SF38 (#33): settings bắt buộc env khi `DEBUG=False`, guard host test | — |

Sau mỗi PR sửa lỗi: cập nhật bảng này kèm SHA và kết quả test mới.

---

## 6. Lộ trình còn lại (sau §4)

### 6.1 G2 — chuỗi một ngày ăn (thứ tự theo phụ thuộc)

| Bước | Task | Nội dung | Owner đề xuất |
| --- | --- | --- | --- |
| A | Đợt 1 (§10) | Security, thực đơn cố định, thông báo phụ huynh, ISSUE-001…011 | TV1, TV2, TV4, TV6 |
| B | SF44–SF47 | Hoàn thiện API lớp/suất, UI nhập suất (null ≠ 0, version, quyền) | TV4 + TV3/TV5 |
| C | SF53–SF54 | Nghiệm thu thực đơn (sau PR2) | TV6 |
| D | SF55–SF60 | DemandRevision, StockAllocation, tính nhu cầu (300 × 70 g = 21 kg), đề xuất mua 13 kg | TV1 contract, TV2 service, TV4 API, TV5 UI |
| E | SF61–SF66 | PurchaseOrder; nhận theo đơn (10 + 3; nhận thêm 4 bị chặn) | TV1, TV2, TV4, TV3/TV5 |
| F | SF67–SF72 | Xuất theo ngày, chi phí ngày, đóng ngày, báo cáo ngày, màn Hôm nay | TV1, TV2, TV4, TV3 |

**Kịch bản tích hợp** (dùng số chuẩn CLAUDE.md §6):
1. 10 lớp + 5 suất nhân viên = 300 suất; chốt dự kiến.
2. Thực đơn: thịt kho 60 g + canh 10 g thịt.
3. Nhu cầu 21 kg; dự phòng 1 kg; tồn phân bổ 5 kg; đang chờ về 4 kg → mua 13 kg.
4. Đặt đơn; nhận 4 kg (đơn cũ) rồi 10 kg + 3 kg; nhận thêm 4 kg bị chặn.
5. Xuất bếp.
6. Xem chi phí/suất.
7. Hiệu trưởng xem được mọi màn nhưng không ghi được.
8. `sf31_ledger_audit --strict` đạt.

**Hoàn thiện sau demo:**
- test hai kết nối cho mọi đường chốt;
- revision (mở lại suất → tính lại nhu cầu);
- hủy/đóng phần còn lại của đơn;
- idempotency `client_request_id`;
- kiểm kê thiếu làm phân bổ thiếu;
- nghiệm thu SF48/54/60/66/72 trên máy thứ hai.

### 6.2 Deploy (M6)

- **Đã có:** SF38 (EC2 + Tunnel).
- **Còn lại:**
  - SF39–SF42: diễn tập khôi phục từ backup, ghi bằng chứng;
  - giám sát;
  - hướng dẫn vận hành (SF71).
- Migrate production luôn qua `npm run ec2:migrate` (có backup trước).

### 6.3 G3

| Mã | Tính năng | Ghi chú |
| --- | --- | --- |
| U1 | Mức thu/suất có hiệu lực theo ngày; chi phí dự kiến/thực tế/suất; cảnh báo vượt | Tiền Decimal(14,2), cấu hình có lịch sử |
| U3 | Báo cáo "Cần – Đã xuất – Suất thực tế" theo food/ngày/tuần | Không tự kết luận thất thoát |
| U4 | Thẻ điểm NCC: giao đủ/đúng hạn, cảnh báo giá so bình quân 30 ngày | Nằm trong màn NCC |
| U5 | Kiểm thực 3 bước (QĐ 1246/QĐ-BYT), sổ append-only, ảnh (P6) | Phải phỏng vấn bếp và trường xác nhận mẫu trước |

Mã task mới (SF73+) do TV1 cấp, bổ sung vào thẻ task và Excel trước khi làm.

---

## 7. Đặt chỗ số migration

| Số | Nội dung |
| --- | --- |
| 0001–0013 | Đã merge (hai nhánh 0008, nối tại 0012) |
| 0014 | PR1: group vai trò, LoginThrottle, AuditLog (+ trigger) |
| 0015–0016 | PR2: RecipeComponent precision, MenuVersion/Item, SchoolHoliday, DayMenuSnapshot (+ trigger) |
| 0017–0018 | PR3: Student, ParentContact (email mã hóa), NotificationLog |
| 0019–0020 | SF55: DemandRevision, StockAllocation (+ trigger) |
| 0021–0022 | SF61: PurchaseOrder(Line), ReceiptLine.po_line (+ trigger) |
| 0023–0024 | SF67: xuất theo ngày ăn, đóng ngày (+ trigger) |
| 0025+ | U1, idempotency, P4, G3 |

Thực tế đã merge: G2 dùng gọn 0019–0020 (DemandRevision, PurchaseOrder, StockAllocation, LunchDayClose + trigger); **0021 = SF73 MealPhoto**. Migration mới tiếp theo bắt đầu từ 0022.

Ai cần chen số thì báo TV1. Không đổi tên migration đã merge.

---

## 8. Mẫu brief giao cho agent

```text
Làm <SFxx/ISSUE-xxx> trên origin/dev1@<SHA>.
Đọc CLAUDE.md, plan_final.md §1–§3 và mục liên quan, thẻ <SFxx> trong outputs/team-6/SchoolFood_HuongDan_Task.md,
contract outputs/team-6/contracts/<...> (nếu có), và code liên quan.
Nhánh: feat/SFxx-<ten-ngan> từ origin/dev1.
Mục tiêu: <hành vi trước/sau, ví dụ cụ thể>. Ngoài phạm vi: <...>.
API: <route, method, JSON mẫu, mã lỗi>. Test bắt buộc: <case, số chuẩn CLAUDE.md §6>.
Quy trình: khảo sát → trình kế hoạch → CHỜ DUYỆT → làm → tự kiểm tra (check, makemigrations --check, test trên DB riêng, npm run build) → báo cáo.
Không commit/push khi chưa được bảo. Không sửa migration đã merge. Không ghi InventoryLedger.
Cập nhật plan_final.md §2/§5 bằng bằng chứng thật; không tự nghiệm thu thay reviewer.
```

---

## 9. Rủi ro chính

| Rủi ro | Cách giảm |
| --- | --- |
| Xung đột `models.py` / `urls.py` / migration | Chủ file merge; đặt số theo §7; mỗi task một khối có comment mã task |
| Deadlock giữa các luồng chốt mới | Thứ tự khóa §3 + test hai kết nối |
| Agent báo test giả, vượt phạm vi | Reviewer tự chạy lại; CI (P3) |
| Lộ dữ liệu phụ huynh | Mã hóa + che email + audit + xóa khi nghỉ; khóa cất riêng |
| Chi phí AWS / thư vào Spam | Tắt EC2 khi không dùng; AWS Budgets; `EMAIL_MODE=dry_run` tới khi trường duyệt; chuyển SES + SPF/DKIM cho tên miền nếu thư vào Spam |
| Mất dữ liệu production | Backup trước migrate, cron hằng ngày, diễn tập restore |

---

## 10. Phân công backend (4 người)

| Người | Vai trò | Sở hữu | Task đợt 1 |
| --- | --- | --- | --- |
| **TV1** | Dữ liệu & migration | `models.py`, `migrations/`, trigger, `crypto_fields.py` | BE-01 → BE-04 |
| **TV2** | Nghiệp vụ (service) | `services.py`, `recipe_services.py`, `menu_services.py`, `notifications.py`, `mailer.py` | BE-05 → BE-08 |
| **TV4** | API & quyền | `http_input.py`, `auth_views.py`, `user_views.py`, `meal_views.py`, `menu_views.py`, `urls.py`, `settings.py` (phần auth) | BE-09 → BE-13 |
| **TV6** | Audit, test, vận hành | `audit.py`, `audit_views.py`, `student_views.py`, `test_security.py`, `seed_demo`, `deploy/` | BE-14 → BE-18 |

Frontend (TV3/TV5) làm màn của PR1–PR3 khi API tương ứng đã merge; trước đó dựng bằng JSON mẫu ghi trong task.

### 10.1 Lịch và phụ thuộc (đợt 1 ≈ 8 ngày làm việc)

| Ngày | TV1 | TV2 | TV4 | TV6 |
| --- | --- | --- | --- | --- |
| N1 | **BE-02** (0014, merge sớm nhất) | BE-05 | **BE-09** (merge sớm, mọi view sau dùng) | BE-18 seed; khung BE-16 |
| N2 | BE-01 | BE-06 | BE-10 (cần BE-02) | BE-15 (cần BE-02) |
| N3 | **BE-03** (0015–0016) | BE-06 | BE-10, BE-11 | BE-15, BE-16 |
| N4 | BE-04 (0017–0018) | **BE-07** (cần BE-03) | BE-11, BE-12 | BE-16 |
| N5 | BE-01 (hoàn tất), review | BE-07 | **BE-13** (cần BE-07) | **BE-14** (cần BE-04) |
| N6 | Nháp contract SF55 | **BE-08** (cần BE-04, BE-07) | BE-13 | BE-14 |
| N7 | Nháp contract SF61/67 | BE-08 | Sửa review, nối FE | **BE-17** |
| N8 | Review tích hợp | Sửa lỗi | Chạy toàn bộ test | Kịch bản đầu-cuối, ảnh evidence |

**Thứ tự merge:** BE-02 → BE-09 → BE-10/15 → BE-03 → BE-05/06/07 → BE-11/12/13 → BE-04 → BE-08/14 → BE-16/17.

`urls.py` và `views.py` có nhiều người sửa. TV4 merge `urls.py`; mỗi task thêm một khối route có comment mã task. TV6 chỉ chèn `audit.record` vào `views.py` **sau khi BE-09 đã merge**.

### 10.2 Quy ước chung cho mọi task BE

- **Lỗi API thống nhất:** `{"message": "<câu tiếng Việt>", "errors": {"<field>": "<lý do>"}}`. Frontend `lib/http.ts` đã đọc `message`.
- **Input:** chỉ đọc qua `http_input.py` (BE-09). Không `json.loads` trực tiếp trong view mới, không `bool(x)`, không `Decimal(str(x))`.
- **Quyền:** chỉ qua decorator (BE-10). Không kiểm tra `groups.filter(name="viewer")` rải rác.
- **Ghi dữ liệu:** trong `transaction.atomic`, cùng lúc `audit.record(...)` (sau khi BE-15 merge).
- **Mỗi PR:**
  - chạy `check`, `makemigrations --check`, toàn bộ test trên PG riêng (CLAUDE.md §4);
  - log ở `.tmp/`;
  - mô tả PR ghi lệnh, exit code và các case đã thử.

---

### TV1 — Dữ liệu & migration

#### BE-01 · ISSUE-001: nâng cấp DB cũ (P1, 2 ngày)

- **Yêu cầu:** DB từng migrate tại `f00048d` phải lên được bản mới mà không sửa migration đã merge, không `--fake` mù.
- **Đầu ra:**
  - `management/commands/sf_legacy_db_check.py`, có `--dry-run` (mặc định) và `--apply`;
  - mục "Nâng cấp DB cũ" trong README;
  - test trên DB dựng từ `f00048d`.
- **Logic:**
  1. Đọc `django_migrations` (app `inventory`) và `information_schema.tables`.
  2. Nhận diện "legacy": đã áp `0008_dish_schoolclass_issue_issueline_recipecomponent` bản cũ, chưa áp `0008_issue_contract`, và bảng `inventory_issue`/`inventory_issueline` đang tồn tại.
  3. Đếm dòng hai bảng đó:
     - `= 0` → `--apply` xóa hai bảng rỗng trong một transaction, in các bước, hướng dẫn chạy `migrate`;
     - `> 0` → dừng, in số dòng, yêu cầu kế hoạch chuyển dữ liệu riêng. **Không tự xóa dữ liệu.**
  4. Sau `migrate`: chạy `sf31_ledger_audit --strict` và `makemigrations --check`.
- **Xong khi:** DB sạch và DB legacy (rỗng) đều migrate tới head; trigger còn đủ (so `\df` với DB sạch); ledger audit đạt; DB legacy có dữ liệu bị từ chối rõ ràng.

#### BE-02 · Migration 0014: vai trò, LoginThrottle, AuditLog (1 ngày, **ưu tiên số 1**)

- **Yêu cầu:** model cho PR1, merge trước để TV4/TV6 dựng tiếp.
- **Đầu ra:** model trong `models.py`, `0014_roles_security.py`, test ràng buộc.
- **Model:**
  - `LoginThrottle`:
    - `scope` CharField(10, choices `user` | `ip`);
    - `key_hash` CharField(64) = sha256 hex của `scope:giá_trị_viết_thường`. **Không lưu username/IP rõ**;
    - `failures` PositiveIntegerField(default 0);
    - `window_start` DateTimeField;
    - `locked_until` DateTimeField(null).
    - Unique (`scope`, `key_hash`).
  - `AuditLog`:
    - `actor` FK User **PROTECT**, null. Tài khoản chỉ khóa, không xóa; SET_NULL sẽ đụng trigger;
    - `actor_username` CharField(150);
    - `action` CharField(40);
    - `entity_type` CharField(40);
    - `entity_id` CharField(40, blank);
    - `summary` CharField(255);
    - `changes` JSONField(default dict);
    - `ip` GenericIPAddressField(null);
    - `user_agent` CharField(200, blank);
    - `created_at` auto_now_add.
    - Index (`created_at`), (`actor`, `created_at`), (`entity_type`, `entity_id`).
- **Logic migration:**
  - `RunPython` tạo group `manager`, `principal` bằng `get_or_create` (idempotent, reverse noop).
  - `RunSQL` tạo function + trigger `BEFORE UPDATE OR DELETE ON inventory_auditlog` raise exception, theo mẫu trigger sổ kho ở `0006`/`0009`.
- **Xong khi:** UPDATE/DELETE `AuditLog` bằng SQL thô bị chặn (test `TransactionTestCase`); migrate tiến/lùi trên DB sạch.

#### BE-03 · Migration 0015–0016: thực đơn cố định (SF49, 1,5 ngày)

- **Yêu cầu:** schema cho R10, đóng phần DB của ISSUE-003.
- **Đầu ra:** model, `0015_menu.py` (schema), `0016_menu_integrity.py` (trigger/constraint), test.
- **Model:**
  - `RecipeComponent.quantity` → `DecimalField(14, 6)` + CheckConstraint `quantity > 0`. Trước khi đổi: có dòng `= 0` thì migration **dừng và in danh sách**, không tự sửa.
  - `MenuVersion`: `effective_from` DateField unique, `note`, `created_by` FK PROTECT, `created_at`.
  - `MenuVersionItem`:
    - `version` FK CASCADE;
    - `weekday` PositiveSmallIntegerField (0 = T2 … 4 = T6, CHECK 0–4);
    - `dish` FK PROTECT;
    - `position` PositiveSmallIntegerField.
    - Unique (`version`, `weekday`, `dish`).
  - `SchoolHoliday`: `date` unique, `name` CharField(120), `created_by`, `created_at`.
  - `DayMenuSnapshot`: `date` unique, `menu_version` FK PROTECT, `items` JSONField, `created_at`.
- **Trigger (0016):**
  - `MenuVersion`/`MenuVersionItem`: chặn UPDATE/DELETE khi `effective_from <= current_date` (version đã có hiệu lực là lịch sử).
  - `DayMenuSnapshot`: chặn mọi UPDATE/DELETE.
- **Xong khi:** lưu được 0.0004 kg; quantity = 0 bị DB chặn; sửa version đã hiệu lực bị chặn; snapshot bất biến.

#### BE-04 · Mã hóa + migration 0017–0018: học sinh, email phụ huynh, nhật ký gửi (1,5 ngày)

- **Yêu cầu:** lưu email phụ huynh dạng mã hóa (R11).
- **Đầu ra:**
  - `crypto_fields.py`;
  - `cryptography` (ghim phiên bản) trong `requirements.txt`;
  - settings đọc khóa;
  - model, migration, test.
- **`crypto_fields.py`:**
  - `encrypt(text) -> str` và `decrypt(token) -> str`: dùng `MultiFernet` với `FIELD_ENCRYPTION_KEYS` (danh sách phân cách bằng dấu phẩy, khóa đầu dùng để mã hóa).
  - `contact_hash(email) -> str`: `hmac.new(CONTACT_HASH_KEY, email, sha256).hexdigest()`.
  - `normalize_email(raw) -> str`:
    - strip, viết thường;
    - kiểm bằng `django.core.validators.validate_email`;
    - dài ≤ 254;
    - sai → `ValueError`.
    - Không tự bỏ dấu chấm của Gmail, vì sẽ đổi danh tính người nhận.
  - `email_hint(email) -> "ng•••@gmail.com"`: giữ 2 ký tự đầu và tên miền.
  - Khi `DEBUG=False` mà thiếu khóa → `ImproperlyConfigured`. Ở DEBUG cho dùng khóa dev cố định nhưng **in cảnh báo**.
- **Model:**
  - `Student`: `school_class` FK PROTECT, `full_name` CharField(120), `is_active`, `created_at`, `updated_at`.
  - `ParentContact`:
    - `student` FK **CASCADE** (xóa bé thì xóa email);
    - `email_encrypted` TextField, `email_hash` CharField(64) db_index, `email_hint` CharField(80);
    - `consent_at` DateTimeField, `consent_note` CharField(200);
    - `unsubscribed_at` DateTimeField(null);
    - `created_by`.
    - Unique (`student`, `email_hash`). Tối đa 2 email/bé: service kiểm, trigger dự phòng.
  - `NotificationLog`:
    - `date`, `email_hash`, `student_count`;
    - `status` (`dry_run` | `sent` | `failed` | `skipped`);
    - `error` CharField(300), `attempts`, `created_at`, `updated_at`.
    - Unique (`date`, `email_hash`).
- **Xong khi:**
  - DB không chứa email rõ (test quét cột tìm ký tự `@`);
  - mã hóa → giải mã đúng;
  - xoay khóa (thêm khóa mới lên đầu) vẫn đọc được bản cũ.

#### Đợt 2 của TV1

Contract + migration SF55 (0019–0020), SF61 (0021–0022), SF67 (0023–0024). Xem §10.6.

---

### TV2 — Nghiệp vụ

#### BE-05 · ISSUE-007: làm tròn tiền thống nhất (0,5 ngày)

- **Yêu cầu:** giá trị trên phiếu nháp, chi tiết, đã chốt, sổ kho và báo cáo phải khớp.
- **Đầu ra:**
  - `line_value(qty, price)` và `money(d)` trong `services.py` (`quantize(Decimal("0.01"), ROUND_HALF_UP)`);
  - `views.py` bỏ mọi `round(...)`, dùng hai hàm này;
  - test ca 0.500 × 0.01 = **0.01** và phiếu nhiều dòng.
- **Logic:**
  - Tổng phiếu = Σ `line_value` từng dòng (làm tròn từng dòng rồi mới cộng), giống cách `post_receipt` ghi `value_delta`.
  - Kiểm tra `post_receipt`/`post_issue` dùng đúng cùng hàm.
  - **Không sửa ledger cũ.**

#### BE-06 · ISSUE-003 + SF50: quy đổi đơn vị và công thức (1,5 ngày)

- **Yêu cầu:** định lượng mỗi suất lưu chính xác theo đơn vị chuẩn của mặt hàng.
- **Đầu ra:**
  - `recipe_services.py` có `convert_to_base(food_unit, qty_str, input_unit) -> Decimal` và `replace_components(dish, components, user)`;
  - `recipe_views.py` gọi service;
  - test.
- **Logic quy đổi:**
  - Bảng hệ số `{"kg": {"kg": 1, "g": "0.001"}, "lit": {"lit": 1, "ml": "0.001"}, "piece": {"piece": 1}}`.
  - Đơn vị ngoài bảng của food → `ValueError` (400). Đây là cách chặn kg ↔ lít.
  - Nhân Decimal chính xác. Kết quả **quá 6 chữ số lẻ** → 400 "Định lượng quá nhỏ", không làm tròn âm thầm.
  - Kết quả = 0 hoặc âm → 400.
- **Logic thay công thức:**
  - Trong atomic: khóa `Dish` (`select_for_update`), kiểm tra không trùng `food_id`, xóa component cũ rồi tạo lại.
  - Món đã nằm trong `DayMenuSnapshot` vẫn sửa được, vì snapshot giữ bản cũ.
- **Test bắt buộc:**
  - 60 g → `0.060000` kg;
  - 0,4 g → `0.000400` kg;
  - 0,0004 g → 400;
  - g cho food đơn vị lít → 400;
  - trùng food → 400;
  - chuỗi `"NaN"` / số float → 400.

#### BE-07 · SF52: `menu_services.py` — thực đơn cố định (2 ngày, cần BE-03)

- **Yêu cầu:** R10.
- **Đầu ra:** `menu_services.py` + `test_menus.py`.
- **Các hàm và logic:**
  - `day_status(d)`: `d.weekday() >= 5` → `"weekend"`; có `SchoolHoliday` → `"holiday"`; còn lại `"menu"`.
  - `version_for(d)`: `MenuVersion.objects.filter(effective_from__lte=d).order_by("-effective_from").first()`. Không có → `None` (frontend hiện "chưa lập thực đơn").
  - `build_items(version, weekday)`: danh sách món theo `position`, mỗi món kèm components (food_id, food_name, unit, quantity dạng chuỗi 6 số lẻ). Dùng **công thức hiện hành** tại thời điểm gọi.
  - `menu_for_date(d)`:
    - ngày nghỉ → `{status, dishes: []}`;
    - có snapshot → `items` của snapshot, `source = "snapshot"`;
    - còn lại → `build_items(version_for(d), d.weekday())`, `source = "version"`.
  - `snapshot_day(d)`:
    - chỉ cho ngày `menu` và `d <= hôm nay` (giờ Asia/Ho_Chi_Minh);
    - `get_or_create(date=d, defaults=...)` trong atomic, gọi lại không tạo bản thứ hai;
    - trả snapshot.
  - `week(d)`: 7 ngày từ thứ Hai của tuần chứa d; ngày ≤ hôm nay chưa có snapshot thì gọi `snapshot_day` (lười).
  - `create_menu_version(effective_from, days, note, user)`:
    - `effective_from >= ngày mai`, ngược lại 400;
    - `days` đủ khóa `"0"`…`"4"`, mỗi khóa ≥ 1 dish_id, không trùng;
    - món phải `is_active` và có ≥ 1 component;
    - trùng `effective_from` với version tương lai → 409 (xóa version tương lai đó rồi tạo lại).
  - `delete_future_version(id)`: chỉ cho `effective_from > hôm nay`.
  - Ngày nghỉ: `add_holiday(date, name, user)` với ngày ≥ hôm nay; `delete_holiday(id)` chỉ cho ngày tương lai.
- **Test bắt buộc:**
  - version A từ 01/10, B từ 15/10 → ngày 14/10 ra A, 15/10 ra B;
  - snapshot 10/10 rồi sửa công thức → 10/10 không đổi;
  - T7 → weekend; ngày lễ → holiday;
  - tạo version lùi ngày → 400; thiếu thứ → 400.

#### BE-08 · Email thực đơn 6h30: `notifications.py`, `mailer.py`, `send_daily_menu`, `run_scheduler` (2 ngày, cần BE-04, BE-07)

- **Yêu cầu:**
  - R11; mặc định `EMAIL_MODE=dry_run`.
  - Gửi qua SMTP có sẵn của Django, **không thêm thư viện**.
- **Cấu hình** (`settings.py`, đọc từ env):
  - `EMAIL_BACKEND` = SMTP;
  - `EMAIL_HOST` (mặc định `smtp.gmail.com`), `EMAIL_PORT=587`, `EMAIL_USE_TLS=True`;
  - `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` (App Password; chủ dự án tự điền trên server);
  - `DEFAULT_FROM_EMAIL="SchoolFood <...>"`, `EMAIL_TIMEOUT=10`;
  - `EMAIL_DAILY_LIMIT` (mặc định 450, chừa biên dưới giới hạn khoảng 500/ngày của Gmail);
  - `PUBLIC_BASE_URL` để tạo link.
  - Đổi sang SES chỉ cần đổi `EMAIL_HOST`/user/password.
- **Đầu ra:**
  - `mailer.py`: dựng nội dung thư;
  - `notifications.py`: service;
  - `templates/email/daily_menu.txt` và `.html`;
  - `management/commands/send_daily_menu.py`, `run_scheduler.py`;
  - `notification_views.py`:
    - `GET /api/notifications/?date=`;
    - `POST /api/notifications/send/` (manager);
    - `POST /api/notifications/test/` (gửi thử tới email người đang đăng nhập);
  - API công khai `POST /api/unsubscribe/<token>/` (trang SPA `/huy-nhan/:token` do FE-07 làm);
  - test dùng `locmem` email backend của Django.
- **Nội dung thư:**
  - Tiêu đề `Thực đơn bữa trưa {Thứ}, dd/mm/yyyy`.
  - Thân thư gồm:
    - tên trường;
    - danh sách món (tên món, không kèm định lượng);
    - dòng "Áp dụng cho bé: <tên các bé>" (chỉ tên bé của chính phụ huynh đó);
    - link "Hủy nhận email".
  - Có bản text + HTML (`EmailMultiAlternatives`); HTML dùng inline style đơn giản.
  - Link trong thân thư: `{PUBLIC_BASE_URL}/huy-nhan/<token>` (trang SPA).
  - Header `List-Unsubscribe: <{PUBLIC_BASE_URL}/api/unsubscribe/<token>/>` và `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Gmail POST thẳng vào API.
  - nginx đã chuyển `/api/` về Django, nên không cần thêm location.
- **Logic `send_daily_menu(d, user=None)`:**
  1. `pg_advisory_xact_lock(<hằng số cố định>)` trong atomic ngắn, chống hai tiến trình chạy cùng lúc.
  2. `day_status(d) != "menu"` → ghi log tổng `skipped` (`email_hash = "*"`) rồi dừng.
  3. Gọi `snapshot_day(d)`.
  4. Người nhận: `ParentContact` của `Student.is_active` có `consent_at` khác null và `unsubscribed_at` null.
     - Gom theo `email_hash`: mỗi email **1 thư/ngày**, liệt kê mọi bé của phụ huynh đó; `student_count` = số bé.
  5. Mỗi email: `NotificationLog.get_or_create(date, email_hash)`.
     - Đã `sent` / `dry_run` → bỏ qua (idempotent).
     - `dry_run` → đặt status `dry_run`, không gửi.
     - `smtp`:
       - gửi **một thư riêng mỗi người nhận**, tuyệt đối không To/CC/BCC chung;
       - mở **một** kết nối SMTP (`get_connection()`) dùng cho cả đợt;
       - thành công → `sent`;
       - lỗi `SMTPException`/`OSError` → `failed` + `error` (cắt 300 ký tự, **không chứa địa chỉ email**), `attempts += 1`;
       - sai mật khẩu/App Password (`SMTPAuthenticationError`) → dừng cả đợt và báo rõ trong log.
  6. Đếm số đã gửi trong ngày. Chạm `EMAIL_DAILY_LIMIT` → dừng, phần còn lại để `failed` với lý do "vượt hạn mức ngày".
  7. Gửi **ngoài** transaction DB. Trả thống kê `{sent, dry_run, failed, skipped}`.
- **Link hủy nhận:**
  - Token = `django.core.signing.dumps({"c": contact_id}, salt="unsubscribe")`, không hết hạn.
  - `POST /api/unsubscribe/<token>/` đặt `unsubscribed_at`. Gọi lại vẫn trả 200 (idempotent).
  - Token sai → 400 JSON. Response không chứa email.
  - Trang SPA hiện nút "Xác nhận hủy nhận". Không tự hủy khi chỉ mở link, vì trình quét link của hộp thư có thể mở link thay người dùng.
  - Ghi audit `email_unsubscribe` (không có actor).
  - Route này **không** qua decorator đăng nhập và được miễn CSRF vì dùng token ký. Phải khai báo trong `EXPECTED_PERMS` của BE-16.
- **`run_scheduler`:**
  - Vòng lặp 60 s. Giờ VN ≥ 06:30 và hôm nay chưa có log tổng → gọi `send_daily_menu(today)`. Container khởi động lại lúc 8h vẫn gửi bù.
  - Bắt `SIGTERM` để dừng gọn. Không cần thư viện lịch.
- **Test bắt buộc:**
  - dry-run tạo log và không có thư trong `mail.outbox`;
  - smtp (locmem) gửi đúng 1 thư/người;
  - chạy 2 lần không gửi thêm;
  - một email có 2 bé → 1 thư liệt kê cả 2 tên;
  - không đồng ý hoặc đã hủy nhận → không gửi;
  - T7/ngày lễ → `skipped`;
  - thư không chứa địa chỉ của người khác;
  - link hủy nhận hoạt động; token giả → 400;
  - vượt hạn mức → dừng đúng chỗ.

#### Đợt 2 của TV2

SF56 nhu cầu, SF58 đề xuất + giữ hàng, SF62 nhận theo đơn, SF68 xuất theo ngày + chi phí (§10.6).

---

### TV4 — API & quyền

#### BE-09 · `http_input.py`: đóng ISSUE-004/005/006/008 (1,5 ngày, **merge sớm**)

- **Yêu cầu:** đầu vào sai luôn trả 400 JSON, không bao giờ 500, không ghi gì.
- **Đầu ra:** `http_input.py`, áp dụng cho `views.py`, `class_views.py`, `recipe_views.py`, `auth_views.py`; test probe.
- **Module gồm:**
  - `class InputError(Exception)`: có `message` và `errors: dict`.
  - Decorator `@json_api`: `InputError` → 400; `ObjectDoesNotExist` → 404; `InventoryConflict`/`LunchVersionConflict` → 409. **Không bắt `Exception`.**
  - `read_object(request) -> dict`: body rỗng, JSON hỏng hoặc không phải object → `InputError`.
  - `req_str(d, key, max_len, required=True)`: phải `isinstance(str)`, strip, kiểm độ dài.
  - `opt_bool(d, key)`: chỉ `True`/`False` (`type(v) is bool`).
  - `req_int(d, key, min, max)`: `type(v) is int`, loại bool.
  - `req_decimal(d, key, max_digits, dp, positive=True)`:
    - phải là chuỗi khớp `^-?\d+(\.\d+)?$` (từ chối float, bool, `"NaN"`, `"1e3"`);
    - số lẻ > dp → lỗi, **không làm tròn**;
    - phần nguyên vượt `max_digits - dp` → lỗi.
  - `req_date(d, key)`: chuỗi → `date.fromisoformat`, bắt `ValueError`.
- **Áp dụng:**
  - Thay mọi `json.loads`, `bool(...)`, `Decimal(str(...))` trong 4 file.
  - Giữ hành vi đúng hiện có: test cũ phải xanh nguyên vẹn.
- **Test probe:**
  - body `[]` / `null` / `"x"` vào classes, dishes, login, receipts, issues → 400;
  - `{"is_active":"false"}` → 400;
  - quantity là số `0.1` → 400;
  - ngày `2026-99-99` → 400;
  - quantity `"0.0004"` (dp 3) → 400;
  - sau mỗi ca đếm bảng, khẳng định không có dòng mới.

#### BE-10 · Vai trò, khóa đăng nhập, phiên (2 ngày, cần BE-02)

- **Yêu cầu:** R9, R12.
- **Đầu ra:** `auth_views.py` (sửa), `throttle.py`, `session_security.py` (middleware), `settings.py` (validators, session), test.
- **Vai trò:**
  - `get_user_role(user)`: superuser → `"manager"`; group `manager` → `"manager"`; group `principal` → `"principal"`; còn lại `None`.
  - `can_manage_users(user)` = superuser hoặc principal.
  - `/api/auth/me/` và login trả `{id, username, full_name, role, can_write, can_manage_users, can_view_audit}`.
  - Login user có `role None` → 403 "Tài khoản chưa được phân quyền".
- **Decorator:**
  - Giữ tên `inventory_permission_required`: chưa đăng nhập 401; GET/HEAD/OPTIONS cho mọi vai trò; method ghi chỉ cho `manager`.
  - `principal_required`: cần `can_manage_users`, ngược lại 403.
  - Xóa các chỗ kiểm `groups.filter(name="viewer")`.
- **`throttle.py`:**
  - `check(scope, value)` → `None` hoặc số giây còn bị khóa.
  - `fail(scope, value)`:
    - trong atomic, `select_for_update().get_or_create`;
    - nếu `now - window_start > 15'` → `failures = 0`, `window_start = now`;
    - `failures += 1`; chạm ngưỡng (user 5, ip 20) → `locked_until = now + 15'`, `failures = 0`.
  - `reset(scope, value)`.
- **Luồng login:**
  1. Đọc body bằng `read_object`.
  2. `check(user)`, `check(ip)`: đang khóa → 429 + `Retry-After`, thông báo chung "Đăng nhập tạm khóa, thử lại sau N phút", audit `login_locked`.
  3. `authenticate` thất bại → `fail(user)`, `fail(ip)`, audit `login_failed`, 401 thông báo chung.
  4. Thành công → `reset(user)`, `login()`, `session["auth_at"] = now.timestamp()`, audit `login`.
- **IP:** `X-Real-IP` nếu `TRUST_PROXY_IP=true`, ngược lại `REMOTE_ADDR`.
- **Phiên:**
  - `SESSION_COOKIE_AGE = 1800`, `SESSION_SAVE_EVERY_REQUEST = True`.
  - Middleware đặt **sau** `AuthenticationMiddleware`: user đã đăng nhập mà `now - auth_at > 12h` (hoặc thiếu `auth_at`) → `logout(request)`. Request đó nhận 401 từ decorator.
- **Mật khẩu:** `AUTH_PASSWORD_VALIDATORS` gồm `UserAttributeSimilarity`, `MinimumLength(10)`, `CommonPassword`, `Numeric`.
- **Test** (giả lập thời gian bằng `unittest.mock.patch("django.utils.timezone.now")`, không thêm thư viện):
  - sai 5 lần → 429; sau 15 phút thử lại được;
  - 20 lần sai từ một IP với các username khác nhau → 429;
  - phiên quá 12 h → 401;
  - principal POST nghiệp vụ → 403;
  - user không vai trò → 403.

#### BE-11 · API quản lý tài khoản (1,5 ngày, cần BE-10)

- **Đầu ra:** `user_views.py`, route `/api/users/…`, test.
- **API** (`principal_required`, CSRF):
  - `GET /api/users/` → `{results: [{id, username, full_name, role, is_active, is_superuser, last_login}]}`.
  - `POST /api/users/` với `{username, full_name, role: "manager"|"principal", password}`:
    - chạy `validate_password(password, user)`;
    - username trùng → 409;
    - `set_password`, gán đúng 1 group.
  - `PATCH /api/users/<id>/` với `{full_name?, role?, is_active?}`.
  - `POST /api/users/<id>/reset-password/` với `{password}`.
- **Luật chặn:**
  - đích là superuser → 403;
  - tự khóa hoặc tự đổi vai trò mình → 409;
  - thao tác làm số principal đang hoạt động về 0 → 409 (đếm trong atomic với `select_for_update` các user principal).
- **Phiên:**
  - Khóa tài khoản → xóa các `Session` của user đó (duyệt theo `_auth_user_id`; ít user nên chấp nhận O(n)).
  - Reset mật khẩu → phiên cũ tự mất hiệu lực nhờ session auth hash.
  - Không trả mật khẩu trong response.
- **Audit:** `user_create`, `user_update` (changes trước → sau, bỏ password), `user_lock`, `user_reset_password`.

#### BE-12 · ISSUE-002 + ISSUE-011: API lớp và ngày ăn SF46 (1,5 ngày)

- **Lớp:**
  - POST/PATCH/GET có `grade` (int 1–12 hoặc null) và `enrolled` (int 0–200), đọc bằng `req_int`.
  - PATCH thiếu field thì giữ nguyên. Đổi sĩ số không đổi `enrolled_snapshot` của ngày đã mở.
- **Ngày ăn** (chuyển sang `meal_views.py`, giữ đường dẫn):
  - `GET /api/lunch-days/<date>/counts/` **chỉ đọc**; ngày chưa mở → `{"status": "not_open", ...}`.
  - Thêm `POST /api/lunch-days/<date>/open/` (manager), gọi `open_lunch_day`.
  - PUT:
    - validate `version` int;
    - `staff_*` int 0–1000 hoặc null;
    - mỗi dòng: `class_id` phải thuộc ngày (sai → 400, `errors["lines[i].class_id"]`); `planned`/`actual` là int 0..`enrolled_snapshot` hoặc null;
    - đã chốt mà vẫn gửi field của loại đó → 409;
    - chỉ tăng version khi thực sự có thay đổi.
  - Lock/reopen: bỏ `except Exception`; `ValidationError` của service → 400 kèm message tiếng Việt.
  - Response lỗi theo §10.2.
- **Test:**
  - lớp 30 HS: −1 và 31 → 400; `null` ≠ 0;
  - version cũ → 409;
  - GET không tạo dòng nào;
  - principal PUT → 403.

#### BE-13 · API thực đơn (SF52, 1,5 ngày, cần BE-07)

- **Đầu ra:** `menu_views.py`, route, test API.
- **API:**
  - `GET /api/menu/week/?date=YYYY-MM-DD` → `{week_start, days: [{date, weekday, status, source, dishes: [{id, name, components: [...]}]}]}`.
  - `GET /api/menu/today/`.
  - `GET /api/menu/versions/` (kèm `days`).
  - `POST /api/menu/versions/` → 201.
  - `DELETE /api/menu/versions/<id>/` (chỉ version tương lai).
  - `GET /api/holidays/?year=`, `POST /api/holidays/`, `DELETE /api/holidays/<id>/`.
  - `GET /api/dishes/<id>/`; `PATCH /api/dishes/<id>/` có `components` thì gọi `replace_components`.
- **Logic:**
  - View chỉ parse input (BE-09), gọi service BE-06/07, ánh xạ lỗi, ghi audit (`menu_version_create`, `holiday_create`…).
  - Đọc: manager + principal. Ghi: manager.

---

### TV6 — Audit, test, vận hành

#### BE-14 · API học sinh + import CSV + xem email (2 ngày, cần BE-04)

- **Đầu ra:** `student_views.py`, `student_services.py`, route, test.
- **API:**
  - `GET /api/students/?class=<id>` → `{results: [{id, full_name, class_id, contacts: [{id, email_hint, consent_at, unsubscribed_at}]}]}`. **Không bao giờ trả email đầy đủ ở đây.**
  - `POST /api/students/` với body `{full_name, class_id, contacts: [{email, consent: true}]}`.
  - `PATCH /api/students/<id>/`.
  - `DELETE /api/students/<id>/` = bé nghỉ học → xóa hẳn (CASCADE email). Audit chỉ ghi `student_delete` + id + mã lớp, **không tên, không email**.
  - `POST /api/parent-contacts/<id>/reveal/` (manager) → `{email}`, ghi audit `contact_reveal`.
  - `POST /api/students/import/?dry_run=1`: multipart, ≤ 1 MB, UTF-8 có hoặc không BOM.
- **Logic import:**
  - Cột: `ho_ten, ma_lop, email_1, email_2, da_dong_y`; `da_dong_y` là `co` / `khong`.
  - Đọc bằng `csv.DictReader`. Mỗi dòng kiểm:
    - họ tên không rỗng, ≤ 120 ký tự;
    - lớp tồn tại và đang hoạt động;
    - email qua `normalize_email`;
    - không trùng (họ tên + lớp) trong file và trong DB.
  - Kết quả `{rows: [{line, status: "ok"|"error", errors}], summary}`.
  - `dry_run=1` → chỉ trả kết quả.
  - Không dry-run:
    - có bất kỳ lỗi → 400, không ghi gì;
    - không lỗi → ghi tất cả trong một atomic.
  - `da_dong_y = khong` → tạo học sinh nhưng **không lưu email**.
  - Ghi audit `student_import` kèm số dòng.
- **Test:**
  - DB chỉ chứa ciphertext;
  - principal reveal → 403;
  - CSV có 1 dòng lỗi → không ghi dòng nào;
  - xóa bé → `ParentContact` biến mất.

#### BE-15 · Audit log (1,5 ngày, cần BE-02)

- **Đầu ra:**
  - `audit.py`;
  - `audit_views.py` (`GET /api/audit-logs/`);
  - chèn `audit.record` vào `views.py`, `class_views.py`, `recipe_views.py` (sau khi BE-09 merge);
  - test.
- **`audit.record(request, action, entity_type, entity_id="", summary="", before=None, after=None)`:**
  - `changes = {k: [before[k], after[k]]}`, chỉ khóa thay đổi.
  - Khóa nhạy cảm (`password`, `email`, `token`, `*_encrypted`) → `"***"`.
  - Lấy actor, IP (cùng hàm của BE-10) và `user_agent[:200]` từ request.
  - Gọi **bên trong** atomic của thao tác: thao tác rollback thì audit cũng rollback. Riêng login thất bại ghi ngoài atomic.
- **Action:**
  - `login`, `login_failed`, `login_locked`, `logout`;
  - `category_*`, `food_*`, `supplier_*` (create/update/delete);
  - `receipt_create`, `receipt_post`, `issue_create`, `issue_post`;
  - `stocktake_create`, `stocktake_count`, `stocktake_post`;
  - `class_*`, `dish_*`, `lunch_counts_update`, `lunch_lock`, `lunch_reopen`;
  - action của BE-11/13/14 do người làm task đó gọi.
- **API:**
  - principal (hoặc superuser);
  - lọc `actor`, `action`, `entity_type`, `from`, `to` (ngày VN), `page` (50 dòng);
  - trả `{results, page, total_pages}`, sắp `-created_at`.
- **Test:**
  - mỗi nhóm action có ≥ 1 ca;
  - rollback không để lại audit;
  - không có mật khẩu/SĐT trong `changes`;
  - manager GET → 403.

#### BE-16 · ISSUE-009: bộ hồi quy bảo mật `test_security.py` (song song cả đợt)

- **Yêu cầu:** test tích hợp độc lập với người viết code, dùng `Client(enforce_csrf_checks=True)`.
- **Ma trận:**
  - Mọi endpoint ghi: anonymous → 401; principal → 403; manager thiếu CSRF → 403; manager đúng → 2xx.
  - Mọi endpoint đọc: anonymous → 401; manager/principal → 200.
  - Users/audit: manager → 403.
  - Method sai → 405.
- **Cách làm:**
  - Duyệt route từ `get_resolver()`. Test **fail nếu có route chưa khai trong bảng `EXPECTED_PERMS`**, để không ai quên khai quyền cho API mới.
  - Ca phiên: logout xong dùng cookie cũ → 401; khóa tài khoản → phiên cũ 401; reset mật khẩu → phiên cũ 401; quá 12 h → 401.

#### BE-17 · PR4 vận hành (1,5 ngày)

- **Đầu ra:**
  - `deploy/nginx.conf`:
    - `proxy_set_header X-Real-IP $http_cf_connecting_ip;`
    - CSP như §4 PR4, `X-Frame-Options DENY`, `Permissions-Policy` ở `location /` và `/assets/`;
    - `limit_req_zone` 10 r/phút cho `/api/auth/login/`.
  - `compose.prod.yaml`: service `scheduler` (image backend, lệnh `python manage.py run_scheduler`, `restart: unless-stopped`).
  - `.env.prod.example`: thêm biến của BE-04/BE-08/BE-10.
  - `deploy/backup.sh`: `pg_dump | gzip` vào `backups/`, xóa file cũ hơn 14 ngày.
  - `package.json`: thêm `ec2:install-backup-cron`, `ec2:check-deploy`.
  - `docs/SECURITY.md` cho các bước chủ dự án tự làm:
    - Cloudflare Access cho `/admin`;
    - rule rate-limit trên Cloudflare;
    - xoay tunnel token;
    - Security Group SSH chỉ My IP;
    - tạo Gmail gửi thư + App Password, khi cần chuyển SES;
    - mẫu phiếu đồng ý phụ huynh.
- **Kiểm tra:**
  - build production local, mở app không có lỗi CSP trong console;
  - `check --deploy` sạch;
  - chạy backup → restore vào DB tạm, đếm bảng khớp.

#### BE-18 · `seed_demo --scenario security` (0,5 ngày, N1)

- User `demo_manager`, `demo_principal`; mật khẩu đọc từ `.env` (`DEMO_*_PASSWORD`), không in ra.
- 3 lớp; món "Thịt kho" (60 g thịt/suất) và "Canh bí thịt bằm" (10 g thịt/suất); version thực đơn T2–T6.
- 5 học sinh với email **giả** (`phuhuynh1@example.test`…), đã đồng ý; `EMAIL_MODE=dry_run`.
- Chạy lại được (`get_or_create`); từ chối chạy khi `DEBUG=False`.

---

### 10.6 Đợt 2 — chuỗi G2 một ngày ăn (sau đợt 1)

Mỗi bước: TV1 chốt contract + migration → TV2 viết service → TV4 viết API → TV6 viết test độc lập và nghiệm thu. Số liệu theo CLAUDE.md §6.

| Bước | TV1 (contract/migration) | TV2 (service, logic chính) | TV4 (API) | TV6 (test/nghiệm thu) |
| --- | --- | --- | --- | --- |
| **SF55–58** Nhu cầu & đề xuất | `DemandRevision(lunch_day, version, status, created_by)` + `DemandLine(food, required_qty, reserve_qty, reserve_reason)`; `StockAllocation(food, lunch_day, qty, source=stock\|po_line, status=reserved\|consumed\|released)` | **Nhu cầu** = Σ món Σ component `quantity_per_serving × planned_total`, gom theo food, làm tròn 3 số lẻ HALF_UP **sau khi cộng** (300 × 0.070 = 21.000 kg). **Đề xuất mua** = max(0, nhu cầu + dự phòng − tồn còn phân bổ được − hàng chờ về trước ngày dùng) = 21 + 1 − 5 − 4 = 13. Tồn còn phân bổ = `quantity` − Σ allocation `reserved` của ngày khác. Khóa theo §3 | `GET /api/lunch-days/<d>/demand/`, `POST .../demand/recalculate/`, `POST .../proposal/approve/` (sai version → 409) | Ca 21 kg / 13 kg; mở lại số suất → revision mới, đề xuất cũ thành lỗi thời; hai kết nối duyệt cùng lúc |
| **SF61–66** Đơn đặt & nhận hàng | `PurchaseOrder(supplier, status draft\|sent\|closed\|cancelled)`, `PurchaseOrderLine(food, qty_ordered, qty_received)`, `ReceiptLine.po_line` FK null; trigger chặn `qty_received > qty_ordered` | Tạo đơn từ đề xuất. Nhận hàng = phiếu nhập có `po_line`; khi `post_receipt` cộng `qty_received` (khóa POLine theo id) và chuyển allocation `po_line` → `stock`. Nhận vượt → 409 (đặt 13: nhận 10 rồi 3; thêm 4 bị chặn) | CRUD đơn, `POST /api/purchase-orders/<id>/send/`, phiếu nhập có `po_line_id` | Ca 10 + 3 + 4; nháp không tăng tồn; chốt hai lần không cộng đôi |
| **SF67–70** Xuất theo ngày & chi phí | `Issue.lunch_day` FK null; `LunchDayClose(lunch_day, closed_by, note)`; trigger chặn sửa ngày đã đóng | Xuất bếp theo nhu cầu: allocation `reserved` → `consumed`. **Chi phí ngày** = Σ `value_delta` của OUT gắn ngày; **chi phí/suất** = chi phí / `actual_total` (HALF_UP 2 số lẻ). Giá vốn ngày cũ không đổi khi nhập giá mới. Chỉ đóng ngày khi đã chốt thực tế | `GET /api/lunch-days/<d>/cost/`, `POST .../close/`, `GET /api/reports/daily/?from=&to=` | Kịch bản §6.1 từ đầu tới cuối trên máy thứ hai; `sf31_ledger_audit --strict` |

**Cổng mở đợt 2:** BE-01 → BE-18 đã merge, test xanh, ISSUE-001…011 đóng (trừ ca cần chủ dự án quyết định riêng).
