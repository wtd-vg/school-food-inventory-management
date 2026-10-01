# plan_final — kế hoạch, hiện trạng và lỗi mở của SchoolFood

Cập nhật **01/10/2026** tại `origin/dev1@6f0bdc7`. Đây là **nguồn kế hoạch duy nhất**, thay cho ROADMAP.md, issue.md, AGENT_HANDOFF.md, task_on_progress.md, Claude_plan.md và Claude_prompt.md. Các file cũ đã được chuyển ra `E:\schoolfood-archive\`, không còn trong repo.

Các file còn lại trong repo:
- Quy trình làm việc và lệnh: [CLAUDE.md](CLAUDE.md).
- Thiết kế dữ liệu: [architecture.md](architecture.md).
- Yêu cầu từng SF: [thẻ task](outputs/team-6/SchoolFood_HuongDan_Task.md).
- Trạng thái nghiệm thu: [Excel checklist](outputs/team-6/SchoolFood_Checklist_6_ThanhVien.xlsx).

Khi mâu thuẫn, thứ tự ưu tiên: yêu cầu trực tiếp của chủ dự án → **§1 file này** → CLAUDE.md → architecture.md → thẻ task → Excel.

> **Agent đọc thế nào:** bắt buộc §1–§3, rồi mục của việc được giao. Không suy ra "đã có" từ tài liệu; luôn kiểm tra code trên `origin/dev1`.

---

## 1. Quyết định đã chốt

| # | Quyết định | Hệ quả |
| --- | --- | --- |
| R1 | **Phạm vi:** G2 (SF43–SF72), deploy M6 (SF37–SF42), G3 (U1, U3, U4, U5). Từ 01/10 thêm: danh sách học sinh + SĐT phụ huynh và **tin Zalo ZNS tự động** (thay U2 cổng phụ huynh). | Vẫn ngoài phạm vi: lô/hạn dùng, AI, nhiều bữa/khẩu phần, hồ sơ học sinh ngoài họ tên/lớp/SĐT, trả/hủy sau xuất. |
| R2 | SF25/31/43 đã merge (#21/#22/#24); hai migration 0008 nối tại 0012. | Không xóa migration 0008, không chạy lại kế hoạch hợp nhất cũ. |
| R3 | Không có dữ liệu thật trước deploy; production (EC2) hiện chưa có user. | Mọi tái lập DB phải xác nhận đúng đích và phạm vi; không `down -v` / `--fake` mù. |
| R4 | 6 thành viên, mỗi người có agent AI. | Chủ file chung: models/migrations → TV1, `urls.py` → TV4, router/`App.tsx` → TV3. Hẹn thứ tự merge khi đụng file chung. |
| R5 | Frontend "Bếp Nhà Trường" **đã xong** (PR #29–#32): react-router, design tokens, CSS Modules. | Màn mới dùng component có sẵn theo [frontend/UI_GUIDE.md](frontend/UI_GUIDE.md); mẫu gốc ở `design/*.html`. Không thêm UI kit. |
| R6 | Demo ≠ nghiệm thu. | Excel chỉ cập nhật bằng bằng chứng, bởi đúng owner/reviewer. |
| R7 | **Deploy:** EC2 t4g.small (Sydney) + Docker Compose + Cloudflare Tunnel tại `schoolfoodusth.store` (SF38, PR #33). | PostgreSQL chạy trong container, không publish cổng. Lệnh `npm run ec2:*` trong `package.json`. |
| R8 | Nhánh `SF21+SF27` không merge. | Logic nhập/xuất đã dựng lại trên UI mới. |
| R9 | **Vai trò (01/10):** **Quản lý** làm mọi nghiệp vụ; **Hiệu trưởng** giám sát (xem tất cả, quản lý tài khoản, xem nhật ký, không nhập/xuất); **bỏ viewer**; không có tài khoản phụ huynh. | Đổi decorator quyền, frontend `canWrite`. Xem §4 PR1. |
| R10 | **Thực đơn cố định (01/10):** mỗi thứ T2–T6 một thực đơn, lặp hằng tuần; nghỉ T7/CN + ngày lễ do admin đánh dấu; sửa thì áp dụng từ ngày chọn, ngày cũ giữ bản chụp. | Thay mô hình "thực đơn tuần lập mới" của SF52. Xem §4 PR2. |
| R11 | **Phụ huynh nhận tin Zalo ZNS lúc 6h30.** Trường chưa có OA nên chạy chế độ giả lập. SĐT được mã hóa, che số, lưu xác nhận đồng ý, xóa hẳn khi bé nghỉ. | Thêm dependency `cryptography`. Xem §4 PR3. |
| R12 | **Bảo mật:** khóa đăng nhập sai (backend + Cloudflare), mật khẩu ≥ 10 ký tự, phiên 30 phút không thao tác / tối đa 12 giờ, audit log có màn xem, Cloudflare Access cho `/admin`. | Xem §4. |

### 1.1 Đề xuất

| # | Đề xuất | Trạng thái |
| --- | --- | --- |
| P1 | Helper validate dùng chung (JSON object, bool, Decimal chuỗi, ngày) | **Duyệt**, làm trong PR1 (`http_input.py`) |
| P2 | Exception `Conflict` chung | Chờ duyệt |
| P3 | GitHub Actions: PG17 + check + test + build trên mọi PR | Chờ duyệt |
| P4 | Xóa bảng `InventoryLedger` (legacy) | Chờ duyệt, phải kiểm kê dữ liệu trước |
| P5 | gunicorn production | **Đã làm** (SF38) |
| P6 | S3 lưu ảnh chứng từ/kiểm thực (U5) | Chờ duyệt |
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
| Test | 99 test đạt trên PG17 riêng (01/10, `6f0bdc7`) | Thiếu hồi quy auth/CSRF; test đồng thời G2 |

"Có code", "test đạt" và "đã nghiệm thu" là ba trạng thái khác nhau.

---

## 3. Luật chung cho mọi agent (bổ sung CLAUDE.md §5)

1. Nhánh gốc là `origin/dev1` đã fetch và ghi SHA. Không tự pull/rebase/stash/reset workspace bẩn.
2. **Một sổ kho:** mọi thay đổi tồn đi qua `StockTransaction`. **Cấm ghi `InventoryLedger`.**
3. **Thứ tự khóa:** đầu chứng từ (`select_for_update(of=("self",))`) → `LunchDay`/`DemandRevision`/`PurchaseOrder` → `FoodItem` theo id tăng dần → `StockAllocation` theo id tăng dần → `PurchaseOrderLine` theo id tăng dần.
4. Không dùng `nowait`, không `except Exception`. Bắt đúng `DoesNotExist` → 404; xung đột version/trạng thái → 409.
5. **Decimal:** chuỗi trong JSON; từ chối float/bool/NaN/Infinity; dùng `quantize(ROUND_HALF_UP)`, không dùng `round()`.
6. **Migration:** không sửa migration đã merge; số mới theo §6; đổi schema phải có kế hoạch chuyển dữ liệu.
7. **Test cùng code:** service chốt nào cũng có test rollback. Trigger/đồng thời dùng `TransactionTestCase` trên PG riêng.
8. Không xóa test của người khác; không tự merge PR của mình (trừ khi chủ dự án yêu cầu).
9. **Bảo mật:**
   - Không ghi mật khẩu, token hay SĐT rõ vào log, audit, tài liệu.
   - Mọi API ghi phải qua decorator quyền và CSRF.
   - Mọi thao tác ghi gọi `audit.record` (sau PR1).
10. **Bàn giao:** lệnh đã chạy, commit, exit code, expected/actual, việc chưa chạy được. Log để ở `.tmp/`.

---

## 4. Việc đang làm: Security + vai trò + thực đơn cố định + Zalo (4 PR, theo thứ tự)

Người thực hiện: Claude theo yêu cầu chủ dự án. SF49 (TV1) và SF52 (TV4) được làm trong PR2 nên phải báo team trước. Mỗi PR mở về `dev1`.

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

### PR3 — `feat/SEC02-students-zns`

- **Mã hóa:**
  - `cryptography` (MultiFernet) với khóa `FIELD_ENCRYPTION_KEY`.
  - `phone_hash` = HMAC (`PHONE_HASH_KEY`); `phone_hint` = "09•••••123".
- **Model:**
  - `Student(class, full_name)`;
  - `ParentContact` (tối đa 2/bé, có `consent_at`);
  - `NotificationLog` (unique ngày + SĐT);
  - `ZaloToken` (mã hóa).
- **API:**
  - CRUD `/api/students/`; DELETE = bé nghỉ → xóa hẳn.
  - `POST /api/students/import/` (CSV, có dry-run, lưu toàn bộ hoặc không lưu gì).
  - `POST /api/parent-contacts/<id>/reveal/` (ghi audit).
  - `GET /api/notifications/`, `POST /api/notifications/send/`.
- **Gửi tin:**
  - `ZNS_MODE=dry_run|live`.
  - Lệnh `send_daily_menu`: bỏ qua ngày nghỉ → snapshot → mỗi SĐT 1 tin/ngày; advisory lock chống chạy trùng.
  - Service `scheduler` trong compose chạy lúc 06:30 Asia/Ho_Chi_Minh, chạy bù nếu khởi động lại trễ.
- **Frontend:** tab "Học sinh" (che số, nút hiện số, import CSV) và tab "Tin Zalo" (nhật ký, gửi lại) trong `/lop-hoc`.

### PR4 — `feat/SEC03-deploy-hardening`

- **nginx:**
  - `X-Real-IP` lấy từ `CF-Connecting-IP`;
  - CSP, `X-Frame-Options DENY`, `Permissions-Policy` cho SPA;
  - rate-limit `/api/auth/login/`.
- **Biến môi trường:** khóa mã hóa/ZNS trong `.env.prod.example`; lệnh `ec2:genkeys` chỉ in hướng dẫn, không in khóa.
- **Backup:** `deploy/backup.sh` (pg_dump, giữ 14 ngày) + cron 2h sáng. Khóa mã hóa phải cất ngoài server.
- **`docs/SECURITY.md`** — các bước chủ dự án tự làm:
  - Cloudflare Access cho `/admin`;
  - rule rate-limit Cloudflare;
  - xoay tunnel token đã lộ;
  - Security Group SSH chỉ cho My IP;
  - `check --deploy`;
  - đăng ký Zalo OA + template ZNS;
  - mẫu phiếu đồng ý phụ huynh.

**Kiểm tra mỗi PR:**
- Lệnh: `check`, `makemigrations --check`, toàn bộ test trên PG riêng, `npm run build`.
- Thao tác thật bằng tài khoản Quản lý và Hiệu trưởng.
- Ảnh 1280px / 375px lưu `outputs/team-6/evidence/SEC_*.png`.

**Rủi ro:**
- ZNS thật cần OA đã xác thực và template được duyệt.
- Mất khóa mã hóa = mất SĐT.
- CSP có thể chặn tài nguyên chưa lường trước.
- Đụng file chung của TV1/TV4.

---

## 5. Lỗi đang mở

Phát hiện trong audit 30/09 (`7df9bcf`), đã đối chiếu lại tại `6f0bdc7`. Owner là đề xuất.

| ID | Ưu tiên | Vấn đề | Tái hiện | Điều kiện đóng | Xử lý |
| --- | --- | --- | --- | --- | --- |
| ISSUE-001 | P1 | DB từng migrate tại `f00048d` không nâng cấp được: `relation "inventory_issue" already exists` ở `0008_issue_contract` | Migrate `f00048d` rồi migrate bản mới trên cùng DB | DB sạch và DB nâng cấp đều chạy; ledger đối chiếu đạt; không `--fake` mù, không xóa 0008 | TV1/TV6 |
| ISSUE-002 | P1 | API lớp: `enrolled` đã có, **`grade` vẫn bị bỏ qua** khi POST/PATCH/GET | POST `{"grade":"5"}` → DB `null` | Tạo/sửa/đọc đúng; sai kiểu → 400; snapshot ngày cũ không đổi | TV2/TV4 |
| ISSUE-003 | P1 | Công thức 0,4 g lưu thành 0 kg (cột 3 số lẻ) | POST dish component `0.4 g` | 0,4 g giữ đúng hoặc 400 rõ ràng | **PR2** |
| ISSUE-004 | P1 | POST `/api/issues/` với ngày `2026-99-99` hoặc lượng `0.0004` → 500 | Probe | 400 JSON; không để lại đầu phiếu mồ côi; tồn không đổi | **PR1** |
| ISSUE-005 | P2 | Body `[]` → 500 ở classes/dishes/login | Probe | 400 JSON, có test từng endpoint | **PR1** |
| ISSUE-006 | P2 | `{"is_active":"false"}` → lưu true (`bool(...)` ở 5 chỗ) | Probe category | Chỉ nhận boolean JSON; sai → 400 | **PR1** |
| ISSUE-007 | P2 | Phiếu hiển thị `0.00` nhưng sổ ghi `0.01` (view dùng `round()`, service dùng HALF_UP) | 0.500 × 0.01, tạo → chốt → GET | draft/detail/ledger/report khớp; không sửa ledger cũ | TV2/TV4 |
| ISSUE-008 | P2 | API nhập nhận float JSON | POST quantity `0.1` (số) → 201 | float/bool/NaN bị chặn tại biên HTTP | **PR1** |
| ISSUE-009 | P1 | Mất bộ hồi quy auth/CSRF SF13 (PR #15) | Không có test nào dùng `enforce_csrf_checks` | Bộ test chạy với CSRF bật thật | **PR1** |
| ~~ISSUE-010~~ | — | Cấu hình production lỏng, test không chặn host lạ | — | **Đã đóng** bởi SF38 (#33): settings bắt buộc env khi `DEBUG=False`, guard host test | — |

Sau mỗi PR sửa lỗi: cập nhật bảng này kèm SHA và kết quả test mới.

---

## 6. Lộ trình còn lại (sau §4)

### 6.1 G2 — chuỗi một ngày ăn (thứ tự theo phụ thuộc)

| Bước | Task | Nội dung | Owner đề xuất |
| --- | --- | --- | --- |
| A | ISSUE-001/002/007 | Nâng cấp DB cũ, `grade` lớp, làm tròn | TV1/TV6, TV2/TV4 |
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
| 0017–0018 | PR3: Student, ParentContact, NotificationLog, ZaloToken |
| 0019–0020 | SF55: DemandRevision, StockAllocation (+ trigger) |
| 0021–0022 | SF61: PurchaseOrder(Line), ReceiptLine.po_line (+ trigger) |
| 0023–0024 | SF67: xuất theo ngày ăn, đóng ngày (+ trigger) |
| 0025+ | U1, idempotency, P4, G3 |

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
| Lộ dữ liệu phụ huynh | Mã hóa + che số + audit + xóa khi nghỉ; khóa cất riêng |
| Chi phí AWS / ZNS | Tắt EC2 khi không dùng; AWS Budgets; ZNS dry-run tới khi trường duyệt chi phí |
| Mất dữ liệu production | Backup trước migrate, cron hằng ngày, diễn tập restore |
