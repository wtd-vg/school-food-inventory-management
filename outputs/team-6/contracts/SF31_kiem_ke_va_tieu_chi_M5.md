# SF31 · Kiểm kê, sổ kho duy nhất và tiêu chí hoàn tất local

- **Người làm / review:** TV1 · Reviewer TV6
- **Ngày / nhánh:** 30/09/2026 · `feat/sf31-stocktake-contract` (xếp chồng trên `feat/sf25-issue-contract`)

> SF32/SF34 đã được code trước contract này. Mục 7 liệt kê những chỗ đã chỉnh để khớp contract; TV2/TV4 cần review.
> Kết quả: xử lý xong **BASE01** (hai sổ kho song song) ở mức code; còn cần TV6 nghiệm thu.

## 1. Quyết định

| Câu hỏi | Chốt |
| --- | --- |
| Sổ kho | **Chỉ `StockTransaction`** cho IN / OUT / ADJUST. `InventoryLedger` thành bảng *legacy*: không ghi thêm, không xoá, chỉ dùng để đối chiếu dữ liệu cũ. |
| Snapshot | Khi mở kiểm kê, mỗi dòng chụp `snapshot_qty`, `snapshot_cost`, `snapshot_version` của food, dưới khoá FoodItem theo id tăng dần. |
| Kiểm kê cũ | Lúc chốt, food nào có `stock_version` khác snapshot (tức có nhập/xuất/kiểm kê khác sau khi mở) → **409**. Không ghi đè tồn mới; người dùng lập lại phiếu kiểm kê. |
| Chưa đếm và 0 | `counted_qty = NULL` là chưa đếm (chặn chốt). `0` là đếm được 0 (hợp lệ). DB phân biệt được hai trạng thái. |
| Chênh lệch | `variance = counted − snapshot`. Khác 0 thì: tồn mới = số đếm, avg_cost giữ nguyên, `stock_version + 1`, ghi một bút toán ADJUST (giá = giá snapshot). Bằng 0 thì không ghi sổ, không đổi version. |
| Giá chênh lệch | `value_delta = round(variance × snapshot_cost, 2)` HALF_UP. Ví dụ −3 × 100000 = −300000.00. |
| Ngày | `StockTake.date` là ngày kiểm kê; bút toán ADJUST mang ngày này. Báo cáo lọc theo ngày chứng từ. |
| Người | `created_by` = người mở phiếu, `posted_by` = người chốt, `posted_at` = thời điểm chốt. |
| Xoá / huỷ | Bản local **không có** xoá hay huỷ phiếu đã chốt. Nháp được sửa số đếm. |

## 2. Model (migration `0010_stocktake_contract`)

| Bảng | Thay đổi |
| --- | --- |
| `StockTake` | Thêm `date`, `note`, `created_by`, `posted_by`, `posted_at`. CHECK `stocktake_status_posted_at_valid`. |
| `StockTakeItem` | UNIQUE(`stock_take`, `food`). CHECK snapshot ≥ 0. CHECK `stocktake_item_variance_consistent`: `(counted NULL ∧ variance = 0) ∨ (counted ≥ 0 ∧ variance = counted − snapshot)`. |
| `StockTransaction` | Thêm nguồn `stocktake_item` (OneToOne). Mở rộng CHECK đúng một nguồn / loại khớp nguồn. Thêm CHECK `stock_transaction_adjust_values`: lượng ≠ 0, giá trị cùng dấu với lượng. |

**Dữ liệu local cũ.** Migration tự điền:

- `date` = ngày tạo phiếu;
- `posted_at` = `updated_at` với phiếu đã chốt.

`created_by` và `posted_by` của phiếu cũ để NULL, vì dữ liệu cũ không lưu người thực hiện và **không bịa người**. Đã chạy thử migration trên dữ liệu giả lập có phiếu cũ.

**Lưu ý kỹ thuật.** Trong CHECK của PostgreSQL, `NULL` làm cả biểu thức thành NULL và **được cho qua**. Vì vậy nhánh "đã đếm" phải ghi rõ `counted_qty IS NOT NULL`. Test đã bắt được lỗi này.

## 3. Trigger (migration `0011_stocktake_integrity`)

| Trigger | Chặn |
| --- | --- |
| `sf31_stocktake_complete`, `sf31_stocktake_items_complete`, `sf31_stocktake_ledger_complete` (deferred) | Phiếu kiểm kê rỗng; nháp có bút toán; phiếu đã chốt còn dòng chưa đếm, thiếu hoặc lệch bút toán ADJUST, hoặc dòng chênh lệch 0 lại có bút toán. |
| `sf31_protect_stocktake`, `sf31_protect_item` | Sửa hoặc xoá phiếu kiểm kê đã chốt và các dòng của nó. |
| `stock_ledger_guard` | Thêm nguồn kiểm kê: không thêm bút toán vào phiếu đã chốt. Sổ kho chỉ được thêm, không sửa hay xoá. |

## 4. Hàm và API

| Hàm | Hành vi |
| --- | --- |
| `create_stocktake(food_ids, user, date=None, note="")` | Kiểm tra id nguyên dương, không trùng, tồn tại. Khoá food theo id rồi chụp snapshot. |
| `update_stocktake_item(item_id, counted_qty)` | Nhận chuỗi, int hoặc Decimal. `float` được đổi qua `str()`. Chặn bool, NaN, âm, quá 3 số lẻ. Phiếu đã chốt → 409. |
| `post_stocktake(stocktake_id, user)` | Làm theo đúng thứ tự ở mục 1. Lỗi `StaleStocktake` (409) khi version đổi; `InventoryConflict` (409) khi chốt lặp. |

**Payload** (Decimal luôn là chuỗi):

```http
POST /api/stocktakes/                 {"food_ids": [1], "note": "Kiểm kê cuối tuần"}
→ 201 {"id": 3, "date": "2026-09-30", "status": "draft", "posted_at": null,
       "items": [{"id": 5, "food_id": 1, "snapshot_qty": "80.000", "snapshot_cost": "100000.00",
                  "snapshot_version": 3, "counted_qty": null, "variance": "0.000"}]}
PATCH /api/stocktake-items/5/         {"counted_qty": "77"}
→ 200 {"id": 5, "counted_qty": "77.000", "variance": "-3.000"}
POST /api/stocktakes/3/post/
→ 200 (cùng dạng, status "posted")
```

**Mã lỗi:**

| Mã | Khi nào |
| --- | --- |
| 400 | Dữ liệu sai; chưa đếm đủ; PATCH có field lạ. |
| 404 | Không có phiếu hoặc dòng. |
| 409 | Chốt lặp; sửa phiếu đã chốt; tồn đã đổi sau snapshot. |

## 5. Báo cáo đọc sổ kho duy nhất

- `GET /api/reports/stock/`: `transaction_count` đếm trên `StockTransaction`. `stock_value` làm tròn HALF_UP.
- `GET /api/reports/transactions/?food=&from=&to=`: đọc `StockTransaction`, lọc theo **ngày chứng từ**, sắp theo ngày rồi id.
  - Giữ các field cũ (`transaction_type`, `quantity_change`, `cost`, `reference`, `created_at`) nên ReportPage không cần sửa.
  - Thêm `value_delta`, `date`, `source`.
  - `from`/`to` sai định dạng → 400.
- `python manage.py sf31_ledger_audit [--strict]`: đối chiếu tồn của từng food với tổng `quantity_delta`, in số dòng legacy trong `InventoryLedger`.
  - Chỉ đọc; không tự tạo bút toán bù.
  - Food bị lệch được xử lý bằng một phiếu kiểm kê có lý do.

## 6. Chênh lệch không đồng nghĩa gian lận (để cả team thống nhất cách nói)

Chênh lệch kiểm kê chỉ cho biết **số trong hệ thống khác số đếm thực tế**. Nguyên nhân thường gặp:

- cân sai hoặc làm tròn;
- hao hụt tự nhiên (rau héo, nước bay hơi, rã đông);
- nhập hoặc xuất chưa kịp lập phiếu;
- đếm nhầm đơn vị.

Vì vậy:

- Giao diện và báo cáo **không** dùng các chữ "mất", "thất thoát", "gian lận". Dùng "chênh lệch kiểm kê" kèm ghi chú.
- Chênh lệch lớn thì kiểm tra lại chứng từ và đếm lại **trước khi** chốt.
- Đã chốt thì chênh lệch được giữ nguyên làm lịch sử. Muốn sửa thì lập phiếu kiểm kê mới, không sửa phiếu cũ.

## 7. Code của người khác đã chỉnh để khớp contract (cần owner review)

| File · hàm | Owner | Thay đổi |
| --- | --- | --- |
| `services.py` · `create_stocktake`, `update_stocktake_item`, `post_stocktake` | TV2 (SF32) | Viết lại theo mục 1 và 4: nhận `user`; khoá theo id; bỏ `nowait` + `except Exception`; ghi ADJUST vào `StockTransaction`; version chỉ tăng khi tồn đổi; không ghi `InventoryLedger`. |
| `services.py` · `post_receipt` | TV2 (SF20) | Nhận `user` (người chốt ghi vào sổ kho); khoá food `order_by("id")`; **giá bình quân làm tròn HALF_UP** (trước dùng `round()`, kiểu ngân hàng: 100.005 → 100.00); bỏ ghi `InventoryLedger`. |
| `services.py` · `post_issue` | TV2 (SF26) | Bỏ ghi `InventoryLedger` tạm giữ ở SF25. |
| `views.py` · stocktake APIs | TV4 (SF32 API) | Truyền `request.user`; trả chi tiết phiếu; Decimal dạng chuỗi (trước trả `float`); 409 theo kiểu exception. |
| `views.py` · `reports_stock`, `reports_transactions` | TV4 (SF34) | Đọc `StockTransaction` như mục 5. |
| `views.py` · `receipt_post` | TV4 (SF22) | Truyền `request.user`. |

## 8. Tiêu chí hoàn tất bản local (M5 / MVP)

M5 chỉ được đánh dấu xong khi **đủ tất cả** các điều kiện dưới đây. Mỗi dòng phải có bằng chứng trong Excel. Không tính xong chỉ vì build pass.

| # | Tiêu chí | Cách kiểm | Người xác nhận |
| --- | --- | --- | --- |
| 1 | `check`, `makemigrations --check`, **toàn bộ** `test apps.inventory` đạt trên PostgreSQL test riêng | Log lệnh | TV4 |
| 2 | Bộ số chuẩn chạy **từ UI** đúng như sau: nhập 50×90000 và 50×110000 → xuất 20 → kiểm kê đếm 77. Kết quả phải là tồn 77, avg 100000, value 7700000, sổ IN 50+50 / OUT −20 / ADJUST −3 | Ảnh UI + API (AC08, AC11, AC15, AC18) | TV6 |
| 3 | Kiểm kê cũ bị từ chối, tồn mới không bị ghi đè | AC16 | TV2 |
| 4 | 0 khác chưa đếm; âm bị chặn; chênh lệch 0 không ghi sổ; chốt lặp 409 | AC17 | TV5 |
| 5 | Hai người chốt xuất cùng lúc không làm âm kho | AC14 | TV5 |
| 6 | `sf31_ledger_audit --strict` đạt trên DB demo sạch; DB cũ có lệch thì có biên bản xử lý | Log | TV1 |
| 7 | Viewer không ghi được bất kỳ chứng từ nào; POST thiếu CSRF bị từ chối | AC04, AC20 | TV4 |
| 8 | Dừng/chạy lại Compose không `-v` vẫn còn dữ liệu và chứng từ | AC19 | TV6 |
| 9 | Chạy lại toàn luồng trên **máy thứ hai** theo README | AC20 | TV6 |

Còn thiếu cho M5 tại thời điểm viết:

- UI kiểm kê (SF35);
- nghiệm thu từ UI (SF33, SF36);
- khôi phục test auth/CSRF bị xoá ở PR #15.

## 9. Bằng chứng

- `makemigrations --check` → không đổi.
- `python manage.py test apps.inventory` → **73/73 OK** (PostgreSQL 16).
- Test mới trong `test_stocktakes_sf31.py` (11 test):
  - AC08/AC11 (điều kiện trước), AC15, AC16, AC17;
  - DB: phiếu rỗng, ràng buộc dòng, nháp có bút toán, chỉ đọc sau chốt;
  - **AC18 qua API báo cáo**, lệnh đối chiếu, contract API kiểm kê (201 / chuỗi Decimal / 400 / 409 / 404).
- Migration 0010/0011 hoàn tác được. Đã chạy thử trên dữ liệu cũ có phiếu đã chốt và `InventoryLedger`.
