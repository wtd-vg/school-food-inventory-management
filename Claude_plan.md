# Claude plan — Chiến lược thực thi Giai đoạn 2 và đề xuất USP

Soạn 29/09/2026 từ khảo sát code nhánh `docs/g2-lunch-plan` và [kế hoạch G2 đã duyệt](outputs/team-6/GiaiDoan2_KeHoach.md). Đây là **đề xuất chờ chủ dự án duyệt**, không thay kế hoạch đã duyệt, không đánh dấu task nào hoàn tất. Prompt thực thi cho từng task ở [Claude_prompt.md](Claude_prompt.md); trạng thái nghiệm thu ở [checklist](SchoolFood_Checklist_6_ThanhVien.xlsx).

---

## 1. Đánh giá nhanh

**Điểm mạnh.** Tài liệu thiết kế kỹ (architecture.md, thẻ task, 25 case AC23–AC47). Nền SF19 làm chuẩn: Decimal nghiêm ngặt, trigger PostgreSQL deferred bảo vệ sổ kho bất biến, test hai kết nối đồng thời. Đây là mẫu nên nhân bản cho mọi luồng chốt của G2.

**Khoảng trống thật trong code** (không phải trong tài liệu):

| Hạng mục | Tình trạng | Hệ quả với G2 |
| --- | --- | --- |
| Chốt nhập `post_receipt` + API/UI nhập (SF20–22) | Chưa có | G2.4 nhận hàng theo đơn không có chỗ bám |
| Xuất kho (SF25–30) | Chưa có model/service | G2.5 xuất theo ngày, chi phí ngày không làm được |
| Sổ kho | Hai nguồn: `StockTransaction` (nhập) và `InventoryLedger` (kiểm kê, báo cáo) | Báo cáo tồn/giá trị sai nguồn; G2.3 phân bổ tồn không tin được |
| Kiểm kê | Khóa không theo thứ tự id, `ValueError`→409, trả float, 500 khi chuỗi số sai | Rủi ro deadlock khi G2 thêm nhiều luồng khóa FoodItem |
| Test | 43/44 xanh; `test_reports_stock` đỏ; guard DB test chỉ đổi NAME | Không có lưới an toàn đáng tin trước khi thêm ~15 file mới |
| Frontend | 4 màn hình, điều hướng bằng state, CSS nhúng trong App.tsx | G2 thêm ~8 màn hình → App.tsx thành điểm nghẽn merge |

**Rủi ro lớn nhất:** đường găng thật là **G2.0 (nền kho)**, không phải G2.1. TV1, TV2, TV4 vừa là owner BASE01–04 vừa là owner backend của G2.1/2.2 → nếu làm song song đều tay, cả hai luồng cùng trễ.

---

## 2. Chiến lược

### 2.1 Hai luồng, một đường găng

```text
Luồng A (đường găng)  BASE05 → BASE01 → BASE02 → BASE03 → BASE04 ──┐
                                                                      ├─► G2.3 → G2.4 → G2.5
Luồng B (song song)   SF43 → SF44/46 → SF45/47 → SF48 → G2.2 ────────┘
```

- **Ưu tiên nhân lực:** TV2 và TV4 dành phần lớn thời gian cho BASE02–04; TV1 chốt contract SF43 (nhỏ, 1–2 ngày) rồi dồn vào BASE01. TV3/TV5 dựng UI nhập/xuất (SF21/27) và UI G2.1 bằng JSON mẫu trong lúc chờ API. TV6 làm BASE05 ngay từ đầu vì mọi người khác cần DB test an toàn.
- **Contract trước, code sau:** mỗi task "Chốt ..." của TV1 (SF43/49/55/61/67) phải ra: bảng model/field/constraint, sơ đồ trạng thái, API route + JSON mẫu request/response/lỗi, thứ tự khóa. FE làm được ngay với fixture.
- **Mỗi mốc là một lát cắt dọc chạy được:** model → service + test → API + test quyền → UI → nghiệm thu AC trên máy thứ hai.

### 2.2 Quyết định kỹ thuật nên chốt sớm (ghi vào architecture.md trước khi code)

| # | Quyết định | Khuyến nghị | Chốt ở |
| --- | --- | --- | --- |
| D1 | Một sổ kho | `StockTransaction` IN/OUT/ADJUST, đúng một FK nguồn khác null (receipt_line / issue_line / stocktake_item), trigger theo loại; chuyển dữ liệu InventoryLedger bằng migration dữ liệu có đối chiếu, sau đó ngừng ghi InventoryLedger | BASE01 |
| D2 | Thứ tự khóa toàn hệ thống | Đầu chứng từ → (demand/order) → FoodItem theo id tăng → allocation theo id tăng. Mọi service chốt dùng chung helper `lock_foods(ids)` | BASE01, xác nhận lại SF55/61 |
| D3 | Kiểu JSON cho số | Decimal luôn là chuỗi (sửa test SF34 theo hướng này, không đổi API sang số) | BASE04 |
| D4 | Mẫu optimistic lock | Model có `version`; client gửi `version`; service `filter(pk, version).update(version=F+1)` hoặc select_for_update rồi so sánh → 409 kèm `current_version` | SF43 |
| D5 | Chống request lặp | Unique constraint theo nguồn (vd. một đơn có hiệu lực/`DemandRevision`) + trường `client_request_id` (UUID) unique trên chứng từ tạo từ form | SF55/61 |
| D6 | Tiện ích API dùng chung | Tạo `api_utils.py`: đọc JSON, parse Decimal/int/bool/date nghiêm ngặt, định dạng lỗi `{"message", "errors": {field: msg}}`, ánh xạ ValidationError/PermissionDenied/Conflict → 400/403/409. Tránh nhân bản validation ở ~10 view mới | SF44 (cần duyệt vì là module mới) |
| D7 | Ngày và múi giờ | Ngày nghiệp vụ là `DateField` (ngày ăn, ngày chứng từ); lọc theo `created_at` phải dùng datetime aware Asia/Ho_Chi_Minh | BASE04 |
| D8 | Điều hướng frontend | Tách CSS dùng chung ra `styles.css`; `App.tsx` dùng mảng cấu hình màn hình (id, label, component, quyền) để thêm màn hình không đụng nhau. Router chỉ khi được duyệt | SF45 |
| D9 | Đơn vị | `FoodItem.unit` chuẩn hóa về kg / l / cái bằng migration mapping có danh sách ngoại lệ cho người dùng xử lý, không đoán | SF49 |

### 2.3 Lộ trình theo đợt (ước lượng, không phải deadline)

| Đợt | Nội dung | Gate ra |
| --- | --- | --- |
| Đợt 0 (2–3 ngày) | P00 baseline, BASE05 DB test an toàn + sửa test đỏ | 44/44 xanh trên DB test riêng, có log |
| Đợt 1–2 | Luồng A: BASE01 → BASE02. Luồng B: SF43 → SF44, SF46; FE SF45/47 bằng fixture | BASE01/02 review; API lớp/suất chạy thật |
| Đợt 3 | BASE03, BASE04; SF45/47 nối API; SF48 | AC23–AC27 đạt; G2.0 được TV1 mở |
| Đợt 4 | G2.2 SF49–54 | AC28–AC32 |
| Đợt 5–6 | G2.3 SF55–60 (fixture nguồn đơn) | AC33–AC37 |
| Đợt 7–8 | G2.4 SF61–66 (+ test lại SF58 với đơn thật) | AC38–AC42 |
| Đợt 9–10 | G2.5 SF67–72 | AC43–AC47, hồi quy toàn bộ |

---

## 3. USP — khác biệt so với thị trường

### 3.1 Thị trường đang có gì

Khảo sát nhanh (chưa đầy đủ, cần kiểm chứng thêm bằng phỏng vấn trường): các phần mềm bán trú phổ biến tại Việt Nam như MISA EMIS, Nutri ALL, bantru.vn, Vietec, hocbantru tập trung vào **tính khẩu phần dinh dưỡng (chủ yếu mầm non), thực đơn, thu tiền ăn và sổ kiểm thực 3 bước** theo Quyết định 1246/QĐ-BYT. Nghĩa là dinh dưỡng và sổ kiểm thực là **mức tối thiểu để bán**, không còn là khác biệt.

Điểm SchoolFood đã mạnh hơn ngay trong thiết kế: sổ kho bất biến có trigger DB, giá vốn bình quân đúng chuẩn kế toán, chống tính đôi hàng đang chờ, truy nguồn từng con số. Nên định vị theo hướng **kiểm soát chi phí và minh bạch tiền ăn**, không cạnh tranh trực diện ở mảng dinh dưỡng.

### 3.2 Đề xuất (xếp theo tác động / công sức)

| # | Tính năng | Vì sao khác biệt | Dựa trên | Công sức | Khi nào |
| --- | --- | --- | --- | --- | --- |
| U1 | **Ngân sách suất ăn**: nhập mức thu tiền ăn/suất; khi lập thực đơn và đề xuất mua hiện chi phí dự kiến/suất theo giá bình quân và cảnh báo vượt; khi đóng ngày so thực tế | Trả lời câu hỏi mà hiệu trưởng/kế toán quan tâm nhất: "tiền ăn có đủ và có dùng đúng không" | avg_cost, DemandRevision, chi phí ngày SF68 | Thấp–vừa | Ngay sau G2 (hoặc xin mở rộng nhỏ trong SF55/SF69) |
| U2 | **Cổng minh bạch cho phụ huynh / Ban đại diện CMHS**: link chỉ đọc, thực đơn đã chốt, chi phí/suất theo ngày, chứng từ nhập (tên NCC, lượng, giá), chênh lệch có giải thích | Sổ kho không sửa âm thầm được → số liệu công khai có sức nặng; khác biệt rõ với phần mềm chỉ phục vụ nội bộ | Ledger bất biến, SF69/70 | Vừa (role mới, trang public, kiểm soát dữ liệu nhạy cảm) | G3 |
| U3 | **Đối chiếu "Cần – Đã xuất – Suất thực tế"** theo món/lớp, xu hướng chênh lệch, báo cáo suất báo trước vs thực tế | Phát hiện nấu dư, lãng phí, thất thoát sớm — có số, không cảm tính | SF68/SF70 | Thấp | G3 |
| U4 | **Thẻ điểm nhà cung cấp + cảnh báo giá**: tỷ lệ giao đủ/đúng hạn, hàng bị từ chối, giá so bình quân 30 ngày | Hỗ trợ chọn NCC, thương lượng giá, bằng chứng khi đổi NCC | PO/Receipt G2.4 | Thấp | G3 |
| U5 | **Kiểm thực 3 bước tự điền từ luồng kho**: bước 1 gắn phiếu nhận hàng (cảm quan, nguồn gốc, ảnh phiếu giao), bước 2–3 gắn phiếu xuất/ngày ăn, đếm giờ lưu mẫu | Đối thủ có sổ, nhưng nhập tay tách rời; ở đây là sản phẩm phụ của thao tác kho → không nhập hai lần | Receipt/Issue/LunchDay | Vừa | G3–G4 (cần để bán được, dù không phải USP chính) |
| U6 | Dự báo số suất theo thống kê đơn giản (trung bình theo thứ trong tuần, ngày lễ) | Giảm nấu dư mà không cần AI | ClassMealCount lịch sử | Thấp | G4 |
| U7 | Nhận hàng trên điện thoại tại cổng bếp (PWA, chụp ảnh chứng từ) | Thao tác tại chỗ, có bằng chứng | SF65 | Vừa | G4 |

**Khuyến nghị:** giữ nguyên phạm vi G2 đã duyệt. Trình chủ dự án một "móc" nhỏ duy nhất cho G2: thêm cấu hình **mức thu tiền ăn/suất** và hiển thị chi phí/suất so mức thu trong SF69 (U1). Mọi mục khác đưa vào backlog G3, ưu tiên U1 → U3 → U4 → U2 → U5. Trước khi làm U2, cần phỏng vấn 2–3 trường (hiệu phó phụ trách bán trú, kế toán, bếp trưởng) để xác nhận nhu cầu công khai và mức dữ liệu được phép công bố.

Nguồn tham khảo thị trường: [MISA EMIS — top phần mềm dinh dưỡng mầm non](https://emis.misa.vn/emis-kindergarten/top-05-cac-phan-mem-quan-ly-dinh-duong-mam-non/), [Nutri ALL — sổ kiểm thực 3 bước](https://vikinutri.com/tin-tuc/khong-con-mat-thoi-gian-ghi-chep-so-kiem-thuc-3-buoc-voi-phan-mem-nutri-all), [bantru.vn](https://bantru.vn/), [Vietec — phân hệ bán trú](https://vietec.com.vn/chi-tiet-tin/14/tham-dinh-phan-he-phan-mem-quan-ly-cong-tac-ban-tru-trong-cac-co-so-giao-duc-mam-non), [Quyết định 1246/QĐ-BYT](https://thuvienphapluat.vn/van-ban/The-thao-Y-te/Quyet-dinh-1246-QD-BYT-che-do-kiem-thuc-ba-buoc-luu-mau-thuc-an-kinh-doanh-dich-vu-an-uong-2017-345320.aspx).

---

## 4. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
| --- | --- |
| G2.0 kéo dài, chặn G2.3–5 | Ưu tiên nhân lực TV2/TV4 cho BASE; G2.3 chốt contract + test bằng fixture trong lúc chờ |
| Deadlock khi nhiều luồng chốt cùng khóa FoodItem | D2 + helper lock_foods dùng chung + test hai kết nối cho mỗi service chốt |
| Merge conflict ở models.py / urls.py / App.tsx | Chủ file điều phối, mỗi task thêm khối riêng có comment mã task; D8 cho App.tsx |
| Migration dữ liệu InventoryLedger làm sai tồn | Chạy trên bản sao DB, đối chiếu tổng theo food trước/sau, có migration lùi |
| Agent AI làm quá phạm vi hoặc báo "đã test" không thật | Prompt khung bắt dừng chờ duyệt; reviewer tự chạy lại test; bàn giao phải có exit code + log |
| Mở rộng phạm vi vì USP | USP vào backlog G3; chỉ một móc nhỏ U1 nếu chủ dự án duyệt |
