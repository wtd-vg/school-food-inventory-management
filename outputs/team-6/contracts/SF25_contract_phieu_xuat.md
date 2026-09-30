# SF25 · Contract phiếu xuất và sổ kho OUT

Người làm TV1 · Reviewer TV6 · Ngày 30/09/2026 · Nhánh `feat/sf25-issue-contract`

> Phụ thuộc chính thức SF24 chưa nghiệm thu. Contract này được chốt muộn hơn code SF26/SF28 đã merge,
> nên phần 6 liệt kê những chỗ đã chỉnh để code hiện có khớp contract. TV2/TV4 review lại các chỗ đó.

## 1. Quyết định

| Câu hỏi | Chốt |
| --- | --- |
| Tên model | Giữ `Issue`/`IssueLine` như code SF26/SF28 (thẻ task ghi StockIssue; đổi tên không mang lại gì, chỉ tốn migration). |
| Sổ kho | **Một sổ duy nhất `StockTransaction`** cho IN/OUT/ADJUST. OUT trỏ đúng một `IssueLine` (OneToOne). Không ghi sổ riêng cho xuất. |
| Giá vốn xuất | Client **không gửi**. `IssueLine.unit_cost` = 0 khi nháp; `post_issue` chụp `FoodItem.avg_cost` tại lúc chốt và ghi cùng giá vào bút toán. Không tính lại lịch sử khi avg_cost đổi sau này. |
| Dấu | OUT: `quantity_delta < 0`, `value_delta = −round(quantity × unit_cost, 2)` (≤ 0). Báo cáo muốn hiển thị "giá trị xuất" dương thì đổi dấu khi hiển thị. |
| Âm kho | Cấm ở hai tầng: service kiểm tra đủ tồn cho **mọi dòng** trước khi ghi; DB có CHECK `food_quantity_nonnegative`. |
| Food ngừng dùng | **Được** xuất nếu còn tồn (để dùng nốt hàng trong kho). Nhập thì vẫn chặn như SF20. |
| Người chốt | `post_issue(issue_id, user)`: `Issue.created_by` là người lập, `StockTransaction.created_by` là người chốt. |

## 2. Model (migration `0008_issue_contract`)

```
Issue        code UNIQUE, date, note, status draft|posted, created_by, posted_at (editable=False)
             CHECK issue_status_posted_at_valid: draft ⇔ posted_at NULL
IssueLine    issue, food, quantity (3 số lẻ), unit_cost (2 số lẻ, editable=False)
             UNIQUE(issue, food) · CHECK 0 < quantity < 1e11 · CHECK 0 ≤ unit_cost < 1e12
StockTransaction  + issue_line OneToOne NULL · receipt_line đổi thành NULL · + created_at
             CHECK stock_transaction_one_source       đúng một nguồn
             CHECK stock_transaction_type_matches_source  IN ⇔ receipt_line, OUT ⇔ issue_line
             CHECK stock_transaction_in_values / _out_values   dấu và giới hạn (loại cả NaN)
FoodItem     CHECK food_quantity_nonnegative (0 ≤ quantity < 1e11), food_avg_cost_nonnegative
```

## 3. Bất biến ở PostgreSQL (migration `0009_issue_integrity`)

| Trigger | Chặn |
| --- | --- |
| `sf25_issue_complete`, `sf25_issue_lines_complete`, `sf25_issue_ledger_complete` (deferred, lúc COMMIT) | phiếu xuất rỗng; nháp có bút toán; phiếu đã chốt thiếu/lệch bút toán OUT (food, lượng âm, giá vốn, thành tiền, ngày) |
| `sf25_protect_issue`, `sf25_protect_line` | sửa/xoá phiếu đã chốt hoặc dòng của nó (khoá đầu phiếu theo id tăng dần) |
| `stock_ledger_guard` (thay `sf19_protect_ledger`) | sửa/xoá bút toán; thêm bút toán vào chứng từ đã chốt — áp dụng cho cả phiếu nhập và phiếu xuất |
| `sf19_ledger_complete` | giữ nguyên logic SF19, thêm `WHEN (NEW.receipt_line_id IS NOT NULL)` để không chạy với bút toán xuất |

Hai migration có chiều hoàn tác (đã chạy thử `migrate inventory 0007` rồi migrate lại).

## 4. Hàm chốt: `post_issue(issue_id, user)`

1. View kiểm tra manager + CSRF (SF13), lấy `user` từ session.
2. `select_for_update(of=("self",))` khoá phiếu. Không còn draft → `InventoryConflict` (409).
3. Đọc dòng; khoá `FoodItem` **`order_by("id")`** — cùng thứ tự với nhập kho để tránh deadlock.
4. Kiểm tra đủ tồn cho **tất cả** dòng trước khi ghi. Thiếu → `InventoryConflict` kèm tên food, tồn còn và lượng yêu cầu.
5. Mỗi dòng: chụp `unit_cost = avg_cost`, trừ tồn, `stock_version + 1`, **giữ nguyên avg_cost** (kể cả khi tồn về 0), ghi một bút toán OUT.
6. `status = posted`, `posted_at = now()`. COMMIT → trigger kiểm tra toàn phiếu; sai bất kỳ điểm nào thì rollback hết.

`InventoryConflict` kế thừa `ValidationError` (code cũ bắt `ValidationError` vẫn chạy).

## 5. Payload và mã lỗi (giữ nguyên API SF28)

```http
POST /api/issues/
{"date": "2026-09-30", "note": "Bữa trưa", "lines": [{"food_id": 1, "quantity": "20.000"}]}
→ 201 {"id": 7, "code": "XK2026…", "status": "DRAFT", "total_value": "0.00",
       "lines": [{"id": 9, "food_id": 1, "quantity": "20.000", "unit_cost": "0.00"}]}

POST /api/issues/7/post/
→ 200 {"id": 7, "status": "POSTED", "posted_at": "…", "total_value": "2000000.00"}
```

| Tình huống | HTTP |
| --- | --- |
| JSON/field sai, số ≤ 0, food không tồn tại, trùng food, lines rỗng | 400 |
| chưa đăng nhập / viewer ghi | 401 / 403 |
| phiếu không tồn tại | 404 |
| chốt lại phiếu đã chốt, thiếu tồn, xung đột khoá | 409 |
| PATCH/DELETE phiếu | 405 |

Client không được gửi `unit_cost`; nếu có, API bỏ qua (SF28 hiện không đọc field này).

## 6. Code của người khác đã chỉnh để khớp contract (cần owner review)

| File | Owner | Thay đổi |
| --- | --- | --- |
| `services.py` · `post_issue` | TV2 (SF26) | Nhận `user`; khoá food `order_by("id")`; bỏ `nowait` + `except Exception`; lỗi xung đột dùng `InventoryConflict`; **ghi `StockTransaction` OUT**; làm tròn HALF_UP. Vẫn ghi `InventoryLedger` tạm để báo cáo cũ chạy — SF31 bỏ. |
| `views.py` · `issue_post` | TV4 (SF28) | Truyền `request.user`; 409 theo kiểu exception thay vì dò chữ trong message; 404 khi không có phiếu. |

## 7. Bằng chứng

- `python manage.py makemigrations --check --dry-run` → No changes detected (trước đó thiếu migration Issue).
- `python manage.py test apps.inventory` → **62/62 OK** trên PostgreSQL 16 (trước: 49 test, 9 lỗi `relation "inventory_issue" does not exist`).
- Test mới `test_issues_sf25.py` (13 test, `TransactionTestCase`): AC11 (100 → 80, −2000000.00), AC12 (thiếu một dòng rollback cả phiếu), AC13 (chốt lặp, xuất hết giữ avg), **AC14 (hai kết nối cùng chốt 8 từ tồn 10 → một thành công, còn 2, một bút toán OUT)**, phiếu rỗng, nháp có bút toán, bút toán lệch, chỉ đọc sau chốt, một nguồn/đúng loại, không âm kho.

## 8. Việc tiếp theo

- TV2/TV4 review mục 6; TV6 review migration, nhất là trigger deferred.
- Nhánh `feat/Nguyen_Dat` đang có migration `0008_dish_schoolclass_issue_issueline_…` tạo lại Issue: **phải bỏ** phần Issue và sinh lại migration sau khi nhánh này merge.
