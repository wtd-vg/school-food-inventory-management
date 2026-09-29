# Claude prompt — Prompt thực thi Giai đoạn 2 cho Claude Code

Soạn 29/09/2026 từ khảo sát code nhánh `docs/g2-lunch-plan` và [kế hoạch G2 đã duyệt](outputs/team-6/GiaiDoan2_KeHoach.md). Đây là **đề xuất chờ chủ dự án duyệt**, không thay kế hoạch đã duyệt, không đánh dấu task nào hoàn tất. Mọi prompt đều buộc agent trình kế hoạch và dừng chờ duyệt trước khi sửa file. Chiến lược, quyết định kỹ thuật D1–D9 và lộ trình ở [Claude_plan.md](Claude_plan.md).

---

## 1. Cách dùng prompt

1. Mở Claude Code tại root repo (CLAUDE.md tự được nạp).
2. Dán **Prompt khởi động phiên**, sau đó dán **Prompt khung** + khối **đặc thù task**.
3. Agent trả kế hoạch và dừng. Đọc, sửa, trả lời "Duyệt" (hoặc yêu cầu chỉnh).
4. Sau khi xong, đối chiếu báo cáo bàn giao với SchoolFood_Checklist_6_ThanhVien.xlsx; reviewer tự chạy lại test, không tin báo cáo.

### 1.1 Prompt khởi động phiên

```text
Đọc CLAUDE.md, codex.md, architecture.md, task_on_progress.md và outputs/team-6/GiaiDoan2_KeHoach.md.
Chạy git status, git branch --show-current, git log --oneline -5 và báo lại: nhánh, commit, file đang thay đổi chưa commit.
Không sửa file nào trong bước này. Tóm tắt trong 10 dòng: hiện trạng liên quan tới task tôi sắp giao và mọi mâu thuẫn giữa tài liệu và code bạn thấy.
```

### 1.2 Prompt khung (dán trước mọi task)

```text
Bạn thực hiện task {MÃ TASK} — {TÊN} của dự án SchoolFood. Owner: {TVx}, reviewer: {TVy}.
Nguồn yêu cầu: thẻ {MÃ} trong outputs/team-6/SchoolFood_HuongDan_Task.md, case {ACxx} trong SchoolFood_Checklist_6_ThanhVien.xlsx (thư mục gốc), architecture.md.

QUY TRÌNH BẮT BUỘC
Giai đoạn A — Khảo sát và kế hoạch (KHÔNG sửa file):
  1. Kiểm tra git status/nhánh; nếu chưa ở nhánh feat/{MÃ}-..., đề xuất tạo nhánh từ dev1 mới nhất (chưa tạo).
  2. Đọc code liên quan bằng tìm kiếm; liệt kê điều đã có, điều còn thiếu, dependency đã/ chưa nghiệm thu.
  3. Trình kế hoạch gồm: vấn đề; phương án chọn và phương án loại (lý do); danh sách file tạo/sửa;
     model/field/constraint/migration và ảnh hưởng dữ liệu cũ; API contract (route, method, JSON mẫu
     request/response, lỗi 400/401/403/404/405/409); thứ tự khóa nếu có ghi kho; danh sách test sẽ viết
     (tên test ↔ tiêu chí/AC); bằng chứng sẽ thu; rủi ro và câu hỏi cần tôi quyết.
  4. DỪNG. Chờ tôi trả lời "Duyệt".
Giai đoạn B — Thực hiện trong đúng phạm vi đã duyệt. Viết test cùng lúc với code. Không thêm thư viện,
  không sửa migration đã merge, không sửa file ngoài danh sách; cần mở rộng thì dừng và trình bổ sung.
Giai đoạn C — Tự kiểm tra (chạy thật, không suy đoán):
  - python backend/manage.py check; makemigrations --check --dry-run
  - test apps.inventory trên PostgreSQL test tách biệt theo CLAUDE.md §4 (log → .tmp/)
  - nếu có UI: npm run build; chạy app, thao tác bằng manager và viewer; chụp ảnh ~1280px và ~375px
    vào outputs/team-6/evidence/{MÃ}_*.png; kiểm tra console không lỗi
  - xem git diff toàn bộ, bỏ mọi thay đổi ngoài phạm vi
Giai đoạn D — Bàn giao: kết quả; file thay đổi; cách thử tay từng bước; bảng expected/actual cho từng
  tiêu chí và AC; lệnh + exit code + số test; test chưa chạy được và lý do; lỗi sẵn có/phát sinh; việc còn lại.
  Không commit/push, không đánh dấu Excel thay reviewer.

RÀNG BUỘC KỸ THUẬT: Decimal dạng chuỗi trong JSON, từ chối float/bool/NaN; nháp không đổi tồn; chốt atomic,
khóa đầu phiếu rồi FoodItem theo id tăng; version → 409; created_by từ session; không lộ traceback.
```

---

## 2. Prompt đặc thù từng task

Dán sau Prompt khung (mục 1.2). Các quyết định D1–D9 xem Claude_plan.md mục 2.2. Các ý "gợi ý" là điểm xuất phát cho agent, owner vẫn quyết trong kế hoạch.

### 2.0 Đợt 0 — Baseline

**P00 — Baseline môi trường (TV6, không sửa code)**

```text
Không sửa file mã nguồn. Dựng PostgreSQL test tạm theo CLAUDE.md §4, chạy check, makemigrations --check,
toàn bộ test apps.inventory, npm run build. Ghi log vào .tmp/baseline_<ngày>.log và viết
outputs/team-6/evidence/G2_Baseline.md: commit, lệnh, exit code, số test đạt/lỗi, warning (đặc biệt
RuntimeWarning timezone). So với task_on_progress.md, nêu khác biệt nếu có.
```

### 2.1 Luồng A — G2.0 nền kho

**BASE05 — DB test tách biệt và test xanh (TV6 / TV1)**

```text
Mục tiêu: không thể vô tình chạy test vào DB thật; bộ test hiện có xanh.
- settings.py: khi chạy test, bỏ qua DATABASE_URL hoặc từ chối chạy nếu host không phải
  localhost/127.0.0.1/db (đề xuất cả hai phương án, tôi chọn). Không đổi hành vi runserver.
- Đề xuất cách chạy test lặp lại được trên máy thứ hai (script PowerShell trong backend/ hoặc
  service test trong compose) — trình trước khi tạo file.
- test_reports_stock: theo quyết định D3, sửa test để so chuỗi "210.00" (không đổi API).
Kiểm tra: đặt DATABASE_URL giả trỏ host lạ → lệnh test phải từ chối/bỏ qua; 44/44 xanh; log.
```

**BASE01 — Thiết kế một sổ kho (TV1 / TV6)**

```text
Chỉ thiết kế + migration, chưa đổi service chốt. Căn cứ architecture.md §2 và §8.
- Đề xuất migration mới cho StockTransaction: mở OUT/ADJUST, thêm FK issue_line (chờ BASE03 tạo model
  Issue/IssueLine — đề xuất tạo model xuất ngay trong migration này hay tách) và stocktake_item;
  CHECK đúng một nguồn khác null; unique từng FK; cập nhật trigger 0006 theo loại (dấu quantity_delta,
  khớp nguồn, bất biến).
- Kế hoạch chuyển InventoryLedger: đếm dữ liệu hiện có, mapping từng field, trường thiếu (người thực hiện,
  ngày) xử lý thế nào — không bịa; migration dữ liệu có bước đối chiếu tổng quantity theo food.
- Định nghĩa helper khóa chung lock_foods(food_ids) theo id tăng.
Kiểm tra: test trigger bằng TransactionTestCase (OUT dương bị chặn, hai nguồn cùng lúc bị chặn, sửa/xóa
ledger bị chặn); migrate tiến/lùi trên DB test; đối chiếu tổng tồn trước/sau migration dữ liệu.
```

**BASE02 — Chốt nhập, giá bình quân, API/UI nhập (SF20/21/22) (TV2 / TV4, UI TV3)**

```text
Hiện thực post_receipt(receipt_id, user) đúng 7 bước contract trong architecture.md §8.
- avg_cost mới = (qty_cũ×avg_cũ + qty_nhập×giá) / (qty_cũ+qty_nhập), ROUND_HALF_UP 2 số; kiểm tra tràn.
- API: POST /api/receipts/ (nháp), GET list/detail, PATCH nháp, POST /api/receipts/<id>/post/.
- UI ReceiptPage: tạo nháp nhiều dòng, xem, chốt; viewer chỉ xem.
Kiểm tra: ví dụ Gạo 50×90000 và Thịt 10×120000 → ledger 4500000.00/1200000.00; chốt 2 lần → 409;
hai kết nối chốt cùng phiếu → một thành công; lỗi dòng 2 → rollback toàn bộ; food inactive → 400.
```

**BASE03 — Xuất kho chống âm (SF25–30) (TV2 / TV4, UI TV3)**

```text
Model Issue/IssueLine (nháp/chốt), post_issue: khóa đầu phiếu → lock_foods; từ chối âm kho; ledger OUT
với unit_cost = avg_cost tại lúc chốt, value_delta âm (hoặc theo quy ước báo cáo đã chốt ở BASE01);
avg_cost không đổi khi xuất. API + UI tương tự nhập.
Kiểm tra: tồn 10 xuất 11 → 400 và không đổi gì; hai phiếu xuất 6 và 6 đồng thời trên tồn 10 → một
thành công; giá vốn xuất cũ không đổi sau khi nhập giá mới.
```

**BASE04 — Kiểm kê và báo cáo trên sổ chung (SF31–36) (TV4 / TV2)**

```text
- post_stocktake ghi StockTransaction ADJUST (không InventoryLedger), khóa theo lock_foods, lưu
  người/thời điểm chốt (migration), lỗi xung đột dùng exception riêng → 409, lock bận → 409.
- update_stocktake_item: chuỗi số sai/float/NaN → 400; trả Decimal dạng chuỗi.
- create_stocktake: validate food_ids là list số nguyên dương, tồn tại.
- reports_stock / reports_transactions đọc StockTransaction; lọc ngày theo DateField hoặc datetime
  aware (D7). Sửa is_active nhận đúng kiểu bool (không bool("false")) ở các API danh mục — liệt kê chỗ sửa.
Kiểm tra: không còn RuntimeWarning; báo cáo tồn khớp tổng ledger theo food sau chuỗi nhập–xuất–kiểm kê;
snapshot cũ → 409.
```

### 2.2 G2.1 — Lớp và số suất

**SF43 — Chốt dữ liệu lớp và suất trưa (TV1 / TV6)**

```text
Gợi ý model (chốt trong kế hoạch):
- SchoolClass: code unique, name, enrollment PositiveInteger, is_active, timestamps. Không xóa, chỉ ngừng.
- LunchDay: date unique, staff_planned/staff_actual (null = chưa nhập), trạng thái dự kiến và thực tế
  tách riêng (draft/locked), version, locked_by/at cho từng loại.
- ClassMealCount: lunch_day, school_class, enrollment_snapshot, planned, actual (null ≠ 0);
  unique(lunch_day, school_class); CHECK 0 ≤ planned ≤ enrollment_snapshot, tương tự actual.
- LunchDayEvent (lịch sử khóa/mở lại): loại, lý do bắt buộc khi mở lại, user, thời điểm, snapshot JSON.
Câu hỏi cần tôi trả lời: giờ chốt vận hành; snapshot sĩ số lấy khi tạo dòng hay khi chốt.
Đầu ra: cập nhật architecture.md (bảng field, trạng thái, JSON mẫu cho SF44/46), models + migration mới.
Kiểm tra: lớp 30 HS chặn -1 và 31 ở cả model.full_clean và DB CHECK; null khác 0; đổi sĩ số lớp
không đổi snapshot của ngày đã chốt.
```

**SF44 — API lớp học (TV2 / TV4)**

```text
Tạo class_views.py; route /api/classes/ (GET, POST), /api/classes/<id>/ (GET, PATCH). Không DELETE (405).
Ngừng dùng = PATCH is_active=false; lớp đã có ClassMealCount không được đổi code (đề xuất quy tắc).
Nếu duyệt D6, tạo api_utils.py và chỉ dùng cho view mới (không refactor view cũ trong task này).
Kiểm tra: manager tạo/sửa; viewer GET được, POST/PATCH 403; anonymous 401; thiếu CSRF 403 (dùng
Client(enforce_csrf_checks=True)); mã trùng 400; sĩ số "30.5", -1, true → 400.
```

**SF45 — Giao diện lớp học (TV3 / TV5)**

```text
ClassPage.tsx: danh sách, tạo/sửa, ngừng dùng; trạng thái tải/rỗng/lỗi; lỗi hiện đúng trường từ API.
Trình phương án D8 (tách CSS dùng chung, cấu hình menu trong App.tsx) trước khi sửa App.tsx.
Kiểm tra UI thật: tạo lớp → reload vẫn còn; đăng nhập viewer → không thấy nút ghi; ảnh 1280/375px.
```

**SF46 — API suất ăn theo ngày (TV4 / TV2)**

```text
meal_services.py + meal_views.py. Gợi ý route:
GET/PUT /api/lunch-days/<date>/counts/ (body: version, staff_planned|actual, lines[{class_id, planned|actual}])
POST /api/lunch-days/<date>/lock/ {kind: planned|actual, version}
POST /api/lunch-days/<date>/reopen/ {kind, reason, version}
Chốt: mọi lớp active phải có số (0 hợp lệ, null chặn); lưu snapshot sĩ số; tạo LunchDayEvent.
Kiểm tra: thiếu lớp → 400 liệt kê lớp thiếu; version cũ → 409; hai request đồng thời cùng version →
một 200 một 409 (TransactionTestCase); mở lại không có lý do → 400; dự kiến và thực tế độc lập.
```

**SF47 — Bảng nhập suất toàn trường (TV5 / TV3)**

```text
MealCountPage.tsx: chọn ngày; bảng lớp × (dự kiến, thực tế); suất nhân viên; tổng tự tính; nút chốt/mở lại
(lý do); cảnh báo lớp còn thiếu; phân biệt ô trống (chưa nhập) với 0 (nghỉ ăn). Khi 409, báo dữ liệu đã
đổi và cho tải lại, không mất phần đang nhập.
Kiểm tra UI thật: 30 + 28 + 5 = 63; lớp C trống → chặn chốt; C = 0 → chốt được; ảnh 1280/375px.
```

**SF48 — Nghiệm thu lớp và suất (TV6 / TV1)**

```text
test_meals.py: fixture 3 lớp; test độc lập cho AC23–AC27 (tên test chứa mã AC); chạy trên máy thứ hai
theo README. Ghi actual vào evidence, không sửa code nghiệp vụ; lỗi phát hiện → lập danh sách giao lại owner.
```

### 2.3 G2.2 — Món và thực đơn

**SF49 — Chốt model món và thực đơn (TV1 / TV6)**

```text
Dish, RecipeLine(dish, food, qty_per_serving Decimal(14,6) theo đơn vị nhập, input_unit), LunchPlan
(date unique, trạng thái draft/locked/holiday, revision), LunchPlanDish, PlanRecipeSnapshot (food,
qty quy về đơn vị kho, đơn vị) tạo khi chốt. Kế hoạch mapping FoodItem.unit hiện có → kg/l/cái: xuất
danh sách giá trị unit đang có trong DB, bảng mapping đề xuất, giá trị không map được để người dùng xử lý.
Kiểm tra: unique(dish, food); sửa RecipeLine sau khi chốt không đổi snapshot.
```

**SF50 — API món và công thức (TV2 / TV4)** — `recipe_services.py`, `recipe_views.py`. Quy đổi g→kg, ml→l chia 1000, không quy đổi khối lượng↔thể tích. Kiểm tra: 60 g → 0.060000 kg; âm/NaN/đơn vị lạ/kg→l → 400; công thức rỗng hoặc food lặp → 400, không lưu dở.

**SF51 — Giao diện công thức (TV3 / TV5)** — RecipePage.tsx; thêm/xóa dòng; báo trùng food ngay trên form; lỗi server không xóa dữ liệu đang nhập. Ảnh + thử viewer.

**SF52 — API thực đơn trưa (TV4 / TV2)** — `menu_services.py`, `menu_views.py`: lập, sao chép tuần (tạo nháp độc lập), chốt (chỉ món có công thức), đánh dấu nghỉ, tạo revision điều chỉnh giữ bản cũ. Kiểm tra: sửa công thức sau chốt không đổi lượng snapshot; ngày thiếu món không chốt được; version → 409.

**SF53 — Giao diện thực đơn tuần (TV5 / TV3)** — MenuPage.tsx dạng lịch tuần; phân biệt "chưa lập" / "nghỉ ăn" / "đã chốt" bằng nhãn chữ (không chỉ màu); xem revision đã chốt.

**SF54 — Nghiệm thu (TV6 / TV1)** — `test_menus.py`, AC28–AC32; fixture thịt kho 60 g + canh 10 g = 0.070 kg/suất, cộng theo food không theo món.

### 2.4 G2.3 — Nhu cầu và phân bổ (chỉ bắt đầu SF56 khi G2.0 đã mở)

**SF55 — Chốt nhu cầu và phân bổ (TV1 / TV6)**

```text
DemandRevision (tham chiếu version số suất + revision thực đơn, basis planned|actual, reserve + lý do,
computed_at, bất biến), DemandLine (food, required, contributions JSON theo món), StockAllocation
(demand_line, nguồn stock | purchase_order_line, qty>0, trạng thái active/released/consumed).
Chốt: chính sách ưu tiên ngày ăn khi tranh tồn; giải phóng khi đổi/hủy; thứ tự khóa chung D2 (ghi rõ);
cách tính "tồn khả dụng = quantity − tổng allocation active nguồn stock". Chốt D5 (chống trùng).
Kiểm tra bằng fixture: 300×0.070 + 1 − 5 − 4 = 13 kg; nhận 4 kg đang chờ chuyển allocation sang stock,
không thành 8 kg.
```

**SF56 — Bộ tính nguyên liệu (TV2 / TV4)** — `demand_services.py`: hàm thuần (không ghi DB) nhận snapshot + số suất → dòng nhu cầu có phần đóng góp từng món; quy đổi → cộng → làm tròn cuối 0.001, "cái" làm tròn lên. Test tham số hóa, kết quả tái lập, 0 suất không lỗi.

**SF57 — Màn hình nhu cầu (TV3 / TV5)** — DemandPage.tsx hiển thị phép tính từng food (suất × định lượng theo món, dự phòng, tồn phân bổ, đang chờ, cần mua) và phiên bản nguồn; mock theo contract, ghi rõ "chưa nối API" cho tới SF58.

**SF58 — API đề xuất mua và giữ hàng (TV4 / TV2)** — `demand_views.py`, `allocation_services.py`: tính nháp (không giữ), duyệt (atomic, kiểm tra version nguồn, tạo allocation). Kiểm tra: hai kế hoạch đồng thời không giữ cùng một kg; tồn `quantity` không giảm khi giữ; nguồn đổi version → 409; kiểm kê thiếu làm allocation "không đủ".

**SF59 — Điều chỉnh và chênh lệch (TV5 / TV3)** — dự phòng có lý do; so sánh hai revision (300 → 280 suất hiện chênh lệch); đề xuất mua không âm.

**SF60 — Nghiệm thu (TV6 / TV1)** — `test_demand.py`, AC33–AC37: nhiều ngày tranh tồn, giao muộn, hủy phân bổ, request đồng thời. Ghi rõ phần dùng fixture sẽ test lại ở SF66.

### 2.5 G2.4 — Đặt và nhận hàng

**SF61 — Chốt model đơn (TV1 / TV6)** — PurchaseOrder (supplier, need_by, trạng thái draft→approved→sent→partially_received→completed/cancelled/closed_short, version, created_by, approved_by, lý do hủy/đóng thiếu), PurchaseOrderLine (food unique trong đơn, qty_ordered, qty_received tính từ receipt posted, giá dự kiến); `ReceiptLine.purchase_order_line` nullable (migration mới). Sơ đồ trạng thái + thứ tự khóa order → receipt → foods → allocation.

**SF62 — Nghiệp vụ đặt hàng (TV2 / TV4)** — `purchase_services.py`: tạo từ phần thiếu của DemandRevision, duyệt kiểm tra lại, hủy giải phóng allocation nguồn đơn, chống lặp (D5). Kiểm tra: duyệt hai lần cùng nhu cầu → một đơn hiệu lực.

**SF63 — Giao diện đơn (TV3 / TV5)** — danh sách/chi tiết, duyệt, bản in (ngày cần giao, food, lượng, đơn vị) bằng CSS print, nút "Xác nhận đã gửi" riêng — tạo đơn không tự thành đã gửi.

**SF64 — API đơn và phiếu nhập liên kết (TV4 / TV2)** — tạo phiếu nhập nháp từ đơn; post_receipt mở rộng: trong cùng transaction cập nhật qty_received, trạng thái đơn, chuyển allocation nguồn đơn → stock. Kiểm tra: nháp không tăng đã nhận; lỗi giữa chừng rollback cả kho/đơn/phân bổ; nhận vượt → 400.

**SF65 — Giao diện nhận hàng theo đơn (TV5 / TV3)** — hiện đặt/đã nhận/còn thiếu; nhận 10 còn 3; nhận thêm 3 hoàn tất; nhập 4 khi còn 3 bị chặn cả ở UI và API.

**SF66 — Nghiệm thu (TV6 / TV1)** — `test_purchases.py`, AC38–AC42, E2E nhu cầu → đơn → nhận; chạy lại test SF58 với đơn thật.

### 2.6 G2.5 — Xuất theo ngày, chi phí, đóng ngày

**SF67 — Chốt xuất theo ngày và đóng ngày (TV1 / TV6)** — Issue gắn `lunch_day` (nullable cho xuất khác), nhiều phiếu bổ sung; điều kiện đóng ngày; bảng giải thích chênh lệch (lý do bắt buộc); mở lại có lịch sử. Nêu rõ: xuất = cấp cho bếp, không phải lượng đã ăn.

**SF68 — Nghiệp vụ xuất và chi phí ngày (TV2 / TV4)** — `meal_report_services.py`: nháp xuất = max(0, nhu cầu thực tế − đã xuất), dùng post_issue chung, tiêu thụ allocation. Chi phí ngày = tổng |value_delta| OUT của ngày; chi phí/suất = chi phí / suất thực tế, 0 suất → null + lý do. Kiểm tra: đã xuất 10, cần 13 → đề xuất 3; nhập giá mới hôm sau không đổi chi phí ngày cũ.

**SF69 — Tổng quan bữa trưa (TV3 / TV5)** — LunchDashboardPage.tsx: suất dự kiến/thực tế, cần/đã xuất theo food, chi phí, link tới từng chứng từ nguồn (mỗi con số bấm được).

**SF70 — API báo cáo ngày + test tích hợp (TV4 / TV2)** — `meal_report_views.py`, `test_lunch_flow.py`: ngày chưa chốt trả trạng thái rõ ràng; viewer không đóng ngày; request lặp; concurrency; lỗi không để dữ liệu nửa vời.

**SF71 — Hoàn thiện UX + hướng dẫn (TV5 / TV3)** — mobile, mất kết nối, retry không tạo phiếu lặp (dùng client_request_id); hướng dẫn manager/viewer có ảnh thật.

**SF72 — Nghiệm thu toàn bộ (TV6 / TV1)** — dữ liệu nhiều ngày, đối chiếu tay, AC43–AC47 và hồi quy mọi AC G2 + nền kho.
