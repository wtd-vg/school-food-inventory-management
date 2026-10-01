# Contract Đợt 2 — nhu cầu, phân bổ, đơn đặt, nhận hàng, xuất theo ngày, chi phí, đóng ngày (SF55–SF72)

Chốt 01/10/2026. Schema: `models.py` (DemandRevision, DemandLine, PurchaseOrder, PurchaseOrderLine, StockAllocation,
LunchDayClose, ReceiptLine.po_line, Issue.lunch_day), migration 0019 (bảng) và 0020 (trigger bất biến).
Số liệu chuẩn CLAUDE.md §6. Thực đơn và số suất lấy từ menu_services / lunch.py (đợt 1).

## 1. Thứ tự khóa (mọi service, không ngoại lệ)
đầu chứng từ (Receipt/Issue/PurchaseOrder/DemandRevision, `select_for_update(of=("self",))`)
→ LunchDay → FoodItem theo id tăng → StockAllocation theo id tăng → PurchaseOrderLine theo id tăng.
Không `nowait`, không `except Exception`. Xung đột version/trạng thái → `Conflict` (409).

## 2. Định nghĩa số
- `servings(D)` = `LunchDay.planned_total` (tổng suất dự kiến đã CHỐT; chưa chốt dự kiến → không tính nhu cầu, 409).
- Thực đơn D = `menu_services.menu_for_date(D, take_snapshot=False)`; ngày nghỉ/không có món → 409.
- `required(food)` = Σ món Σ component `servings × quantity` (Decimal đủ chính xác), cộng các món cùng food,
  rồi mới `quantize(0.001, ROUND_HALF_UP)`; food đơn vị `piece` làm tròn LÊN số nguyên. 300 × (0.060 + 0.010) = 21.000.
- `reserved_stock(food, trừ ngày X)` = Σ StockAllocation reserved source=stock của food, lunch_day ≠ X.
- `allocatable(food, D)` = `food.quantity` − `reserved_stock(food, trừ D)` (không âm; âm → coi 0 và đánh dấu thiếu).
- `pending(po_line, D)` = `qty_ordered − qty_received − Σ allocation reserved source=po_line của dòng đó, ngày ≠ D`;
  chỉ tính đơn status `sent` hoặc `approved` có `expected_date ≤ D`.
- Khi duyệt: `need = required + reserve`; `from_stock = min(need, allocatable)`;
  `from_pending = min(need − from_stock, Σ pending)` lấy dần theo expected_date rồi id;
  `to_buy = need − from_stock − from_pending`. Ví dụ: 21 + 1 − 5 − 4 = 13.

## 3. Service (file mới, mỗi hàm `@transaction.atomic`, ghi audit trong view)
`demand_services.py`
- `calculate(day_date, user, reserves={food_id: (qty, reason)})` → DemandRevision **draft** (revision = max+1),
  lines required/reserve, `lunch_day_version` = version hiện tại, `menu_version`, `menu_items` (danh sách món).
  Đánh dấu stale các bản draft cũ của ngày (`stale_reason="Có bản tính mới"`).
- `approve(revision_id, user)`: khóa revision → LunchDay (version phải bằng `lunch_day_version`, khác → mark stale +
  409 "Số suất đã đổi, tính lại") → foods tăng → allocation cũ của ngày (reserved) → po_lines tăng.
  Bỏ giữ (released) mọi allocation reserved của ngày thuộc bản approved cũ, bản cũ → stale. Ghi from_stock/
  from_pending/to_buy vào lines (khi revision còn draft), tạo allocation stock (một dòng/food) và po_line (một dòng/
  po_line), rồi revision → approved (approved_by/at).
- `shortages(day_date)`: food có `quantity < reserved_stock tổng` → cảnh báo "kiểm kê thiếu, phân bổ không đủ".
- Khi số suất mở lại/chốt lại hoặc version thực đơn áp dụng cho ngày đổi: bản approved KHÔNG tự đổi; API trả
  `is_outdated=true` (so lunch_day.version/menu) để người dùng tính lại.

`purchase_services.py`
- `create_from_demand(revision_id, supplier_id, expected_date, user)` (revision approved, to_buy > 0): PurchaseOrder
  draft code `DH{yyyymmdd}-{n}`, mỗi line = to_buy; tạo allocation source po_line reserved cho ngày của revision
  (qty = to_buy). Không tạo trùng: một revision chỉ tạo một đơn (409 nếu đã có đơn chưa hủy).
- `create(supplier_id, expected_date, lines=[{food_id, qty_ordered, unit_price_est?}], user, note)` đơn tay.
- `approve(po_id, version)`, `mark_sent(po_id, version)`: draft→approved→sent, tăng version; sai version → 409.
- `cancel(po_id, version, reason)`: chỉ draft/approved; release allocation po_line của đơn.
- `close_remaining(po_id, version, reason)`: chỉ sent; release phần allocation po_line chưa nhận; status closed.
- `create_receipt(po_id, date, lines=[{po_line_id, quantity, unit_price}], user, note)`: phiếu nhập NHÁP, supplier =
  của đơn, ReceiptLine.po_line; quantity ≤ open (kiểm sớm, 409 nếu vượt). Đơn phải sent.
- Mở rộng `services.post_receipt`: với dòng có po_line: khóa theo §1, `qty_received += quantity`; nếu vượt
  `qty_ordered` → 409 "Nhận vượt số đặt" (trigger cũng chặn); chuyển allocation reserved source=po_line của dòng
  đó (theo lunch_day date tăng, id tăng) sang stock: giảm/tách dòng po_line, tạo dòng stock cùng lunch_day/
  demand_line với lượng đã về — không giữ cả hai nguồn cho cùng lượng. Đủ số đặt mọi dòng → đơn closed tự động
  (close_reason "Đã nhận đủ").

`day_services.py`
- `create_day_issue(day_date, user)`: phiếu xuất NHÁP `lunch_day`=ngày, mỗi food của bản approved: lượng =
  max(0, required + reserve − đã xuất (Σ IssueLine posted của ngày)); không còn gì → 409.
- Mở rộng `services.post_issue`: phiếu có lunch_day → được dùng tồn đã giữ cho CHÍNH ngày đó: kiểm
  `quantity − reserved_stock(trừ ngày đó) ≥ xuất`, sau khi trừ tồn thì allocation stock reserved của ngày/food
  → consumed theo lượng xuất (tách dòng nếu xuất một phần). Phiếu không có lunch_day: kiểm
  `quantity − reserved_stock(tất cả) ≥ xuất`, thiếu → 409 "Phần tồn này đã giữ cho ngày ăn …".
- `day_cost(day_date)`: cost = −Σ value_delta OUT của IssueLine thuộc Issue posted lunch_day=ngày;
  `actual_total` null/0 → cost_per_serving null + reason; ngược lại cost/actual (ROUND_HALF_UP 2 số lẻ).
- `close_day(day_date, note, user)`: cần actual đã chốt, mọi Issue của ngày đã posted, chưa có close hiệu lực.
  `summary` = mỗi food {required, issued, variance=issued−required}; có variance ≠ 0 thì note bắt buộc (400).
  `reopen_close(day_date, reason, user)`: ghi reopened_*.
- `daily_report(from, to)`: mỗi ngày {date, planned_total, actual_total, cost, cost_per_serving, closed}.

## 4. API (views mới `demand_views.py`, `purchase_views.py`, `day_views.py`; quyền như đợt 1: đọc Quản lý +
Hiệu trưởng, ghi Quản lý; khai thêm vào `EXPECTED_PERMS` của test_security.py)
- `GET /api/lunch-days/<date>/demand/` → {day, servings, revisions: [...], current (approved hoặc draft mới nhất)
  với lines (food, unit, required, reserve, from_stock, from_pending, to_buy, allocatable, pending), is_outdated,
  shortages}.
- `POST /api/lunch-days/<date>/demand/calculate/` {reserves: [{food_id, qty, reason}]} → 201 revision.
- `POST /api/demand-revisions/<id>/approve/` → 200.
- `GET/POST /api/purchase-orders/`, `GET /api/purchase-orders/<id>/`,
  `POST /api/purchase-orders/from-demand/` {revision_id, supplier_id, expected_date},
  `POST /api/purchase-orders/<id>/approve|send|cancel|close/` {version, reason?},
  `POST /api/purchase-orders/<id>/receipts/` {date, note, lines: [{po_line_id, quantity, unit_price}]} → phiếu nhập nháp
  (chốt bằng `/api/receipts/<id>/post/` như cũ).
- `POST /api/lunch-days/<date>/issue/` → phiếu xuất nháp theo ngày; `GET /api/lunch-days/<date>/cost/`;
  `POST /api/lunch-days/<date>/close/` {note}; `POST /api/lunch-days/<date>/reopen-close/` {reason};
  `GET /api/reports/daily/?from=&to=`.
Mọi Decimal là chuỗi; lỗi {message, errors}; audit action: demand_calculate, demand_approve, po_create, po_approve,
po_send, po_cancel, po_close, po_receipt_create, day_issue_create, day_close, day_reopen_close.

## 5. Kịch bản nghiệm thu (test bắt buộc)
1. 300 suất (10 lớp + 5 nhân viên, chốt dự kiến) × thịt kho 60 g + canh 10 g → required thịt 21.000 kg.
2. Dự phòng 1 kg (có lý do), tồn 5 kg, đơn cũ sent 4 kg kịp ngày → duyệt: from_stock 5, from_pending 4, to_buy 13.
3. Tạo đơn từ đề xuất 13 kg → approve → send. Nhận 4 kg đơn cũ: allocation po_line 4 → stock 4 (tổng giữ vẫn 22).
   Nhận 10 rồi 3 của đơn mới; nhận thêm 4 → 409; đơn tự closed. Nháp không tăng tồn; chốt 2 lần không cộng đôi.
4. Phiếu xuất khác (không lunch_day) không lấy được phần đã giữ (409). Xuất cho ngày → allocation consumed.
5. Chi phí ngày = Σ OUT; chi phí/suất theo actual_total; nhập giá mới sau đó không đổi chi phí ngày cũ.
6. Đóng ngày: thiếu chốt thực tế → 409; có chênh lệch không ghi chú → 400; đóng xong không tạo phiếu xuất cho ngày (409);
   mở lại có lý do, lịch sử còn.
7. Đồng thời (TransactionTestCase, 2 luồng/2 kết nối): hai người duyệt cùng revision → một thành công, một 409;
   hai phiếu nhận cùng dòng đơn vượt tổng → một bị chặn; không deadlock.
8. `sf31_ledger_audit --strict` đạt sau kịch bản.
