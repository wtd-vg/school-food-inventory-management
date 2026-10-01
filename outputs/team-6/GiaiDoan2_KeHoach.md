# Giai đoạn 2 — Quản lý bữa trưa (SF43–SF72)

Kế hoạch cập nhật tài liệu đã được chủ dự án duyệt ngày 29/09/2026. Chưa phải nghiệm thu hoặc lệnh triển khai tất cả task. Thiết kế nghiệp vụ chuẩn ở [architecture.md](../../architecture.md); quy trình AI ở [CLAUDE.md](../../CLAUDE.md); kế hoạch tổng ở [plan_final.md](../../plan_final.md).

## Mục tiêu và giới hạn

Số suất lớp → thực đơn trưa → nhu cầu → đề xuất mua → đơn → nhận → xuất cho bếp → đối chiếu. Một trường/kho, một thực đơn và định mức chung; định lượng trước sơ chế, số suất tổng theo lớp. Manager nhập, viewer đọc. Chưa AI, nhiều bữa/khẩu phần, học sinh cá nhân, lô/hạn dùng, quy cách đóng gói tự động, gửi tin tự động, trả/hủy sau xuất. Mở rộng phải được duyệt riêng.

## G2.0 — Các điều kiện nền

| Mã | Owner / review | Liên quan | Điều kiện đạt |
| --- | --- | --- | --- |
| BASE01 | TV1 / TV6 | SF19,SF25,SF31,SF34 | Duyệt thiết kế một ledger; migration mới bảo toàn và đối chiếu dữ liệu; báo cáo đọc đủ nguồn |
| BASE02 | TV2 / TV4 | SF20,SF22,SF21,SF24 | Nhập chốt atomic, bình quân và version đúng, API/UI chạy thật |
| BASE03 | TV2 / TV4 | SF25–SF30 | Xuất chống âm kho, khóa đồng thời, ghi ledger và API/UI đạt |
| BASE04 | TV4 / TV2 | SF31–SF36 | Kiểm kê snapshot/version, báo cáo chung đối chiếu đúng |
| BASE05 | TV6 / TV1 | SF18,SF36 | DB test tách biệt; test nền, build và demo trên máy thứ hai có bằng chứng |

Chưa tự đánh dấu các điều kiện này đạt. Excel có ô xác nhận riêng cho năm điều kiện và bằng chứng; chỉ TV1 mở G2.0 khi review đủ. Có thể làm G2.1/2 song song việc hoàn thiện kho, nhưng task G2.3–5 bị chặn nếu nền kho chưa đạt. Approval kế hoạch khác approval nghiệm thu.

## Thứ tự tích hợp

G2.1 SF43–48 → G2.2 SF49–54 → G2.3 SF55–60 (+ G2.0) → G2.4 SF61–66 → G2.5 SF67–72.

Trong mỗi mốc, contract/model đi trước; frontend có thể dựng từ JSON mẫu nhưng không đánh dấu hoàn tất khi chưa nối API thật. SF58 phụ thuộc contract đơn tương lai; dùng fixture để test tính toán, nghiệm thu nguồn đơn thật tại SF66. SF69 nối API SF70 trước nghiệm thu SF71/72.

Ước lượng khởi đầu: nền 1–2 tuần, lớp 1 tuần, mỗi mốc còn lại 1–2 tuần; tổng 6–11 tuần nếu team có lịch làm đều. Đây không phải deadline; điền ngày thật sau khi team chốt năng lực và lỗi nền. Không ép chia đều số giờ chỉ vì mỗi người có 5 task.

## Phân công

| Người | Vai trò | Review |
| --- | --- | --- |
| TV1 | Contract, model, migration, tích hợp | TV6 |
| TV2 | Nghiệp vụ backend, Decimal, transaction | TV4 |
| TV3 | UI chính và App.tsx | TV5 |
| TV4 | API, quyền, validation, tests | TV2 |
| TV5 | UI bổ sung và kiểm thử sử dụng | TV3 |
| TV6 | Fixture, nghiệm thu độc lập, bàn giao | TV1 |

TV1 điều phối models/migrations, TV4 urls.py, TV3 App.tsx. Module mới chỉ tạo khi bắt đầu task. Reviewer không phải owner; test nghiệp vụ là trách nhiệm cả người triển khai, không dồn hết cho TV6.

## Danh mục task

| Mã | Mốc | Làm / review | Task | Cần xong trước |
| --- | --- | --- | --- | --- |
| SF43 | G2.1 | TV1 / TV6 | Chốt dữ liệu lớp và suất trưa | Kế hoạch G2 được duyệt |
| SF44 | G2.1 | TV2 / TV4 | API lớp học | SF43 |
| SF45 | G2.1 | TV3 / TV5 | Giao diện lớp học | SF44 |
| SF46 | G2.1 | TV4 / TV2 | API suất ăn theo ngày | SF43, SF44 |
| SF47 | G2.1 | TV5 / TV3 | Bảng nhập suất toàn trường | SF45, SF46 |
| SF48 | G2.1 | TV6 / TV1 | Nghiệm thu lớp và suất | SF45, SF46, SF47 |
| SF49 | G2.2 | TV1 / TV6 | Chốt model món và thực đơn | SF48 |
| SF50 | G2.2 | TV2 / TV4 | API món và công thức | SF49 |
| SF51 | G2.2 | TV3 / TV5 | Giao diện công thức món | SF50 |
| SF52 | G2.2 | TV4 / TV2 | API thực đơn trưa | SF49, SF50 |
| SF53 | G2.2 | TV5 / TV3 | Giao diện thực đơn tuần | SF51, SF52 |
| SF54 | G2.2 | TV6 / TV1 | Nghiệm thu món và thực đơn | SF51, SF52, SF53 |
| SF55 | G2.3 | TV1 / TV6 | Chốt nhu cầu và phân bổ tồn | SF54 |
| SF56 | G2.3 | TV2 / TV4 | Bộ tính nguyên liệu | SF55 |
| SF57 | G2.3 | TV3 / TV5 | Màn hình nhu cầu | SF56 |
| SF58 | G2.3 | TV4 / TV2 | API đề xuất mua và giữ hàng | SF55, SF56 |
| SF59 | G2.3 | TV5 / TV3 | Điều chỉnh và chênh lệch đề xuất | SF57, SF58 |
| SF60 | G2.3 | TV6 / TV1 | Nghiệm thu nhu cầu và chống trùng | SF57, SF58, SF59 |
| SF61 | G2.4 | TV1 / TV6 | Chốt model và trạng thái đơn đặt | SF60 |
| SF62 | G2.4 | TV2 / TV4 | Nghiệp vụ đặt hàng | SF61 |
| SF63 | G2.4 | TV3 / TV5 | Giao diện đơn đặt | SF62 |
| SF64 | G2.4 | TV4 / TV2 | API đơn và phiếu nhập liên kết | SF61, SF62 |
| SF65 | G2.4 | TV5 / TV3 | Giao diện nhận hàng theo đơn | SF63, SF64 |
| SF66 | G2.4 | TV6 / TV1 | Nghiệm thu đặt và nhận hàng | SF63, SF64, SF65 |
| SF67 | G2.5 | TV1 / TV6 | Chốt xuất theo ngày và đóng ngày | SF66 |
| SF68 | G2.5 | TV2 / TV4 | Nghiệp vụ xuất và chi phí ngày | SF67 |
| SF69 | G2.5 | TV3 / TV5 | Tổng quan bữa trưa | SF68 |
| SF70 | G2.5 | TV4 / TV2 | API báo cáo ngày và test tích hợp | SF67, SF68 |
| SF71 | G2.5 | TV5 / TV3 | Hoàn thiện UX và hướng dẫn sử dụng | SF69, SF70 |
| SF72 | G2.5 | TV6 / TV1 | Nghiệm thu toàn bộ bữa trưa | SF69, SF70, SF71 |

## Nghiệm thu và dữ liệu chuẩn

Mỗi mốc có 5 case AC23–AC47 trong Excel. Ví dụ xuyên suốt: 300 suất, hai món dùng 60 g và 10 g thịt/suất → 21 kg; thêm 1 kg dự phòng, trừ 5 kg tồn phân bổ và 4 kg đang chờ → 13 kg mua thêm. Đặt 13, nhận 10 rồi 3; nháp không tăng kho, chốt mỗi lần chỉ tăng một lần. Khi 4 kg đang chờ về, chuyển nguồn phân bổ, không cộng cả nguồn cũ lẫn mới. Giá vốn ngày cũ không đổi khi nhập giá mới.

Điều kiện đóng task: output đúng, reviewer độc lập đạt, evidence có thật, dependencies đã nghiệm thu và gate đã mở. Điều kiện đóng mốc: task đạt và case nghiệm thu của mốc đạt. Excel quản lý trạng thái; thẻ Markdown quản lý yêu cầu. Không tự điền kết quả test tương lai.

## Những việc cần xác nhận khi mở task

- SF43: giờ chốt vận hành thực tế của trường và cách tiếp nhận thay đổi sau giờ đó.
- SF49/50: mapping đơn vị FoodItem đang có sang đơn vị chuẩn, không tự đoán dữ liệu cũ.
- SF55: chính sách ưu tiên ngày ăn khi giữ tồn, cách giải phóng khi đổi/hủy, thứ tự khóa chung.
- SF61: quy trình xác nhận nhà cung cấp đã nhận/đồng ý điều chỉnh; bản đầu người dùng xác nhận thủ công.
- SF67: cách giải thích chênh lệch và đóng ngày; trả kho/hủy sau xuất chưa thuộc G2.

Đây là đầu vào của task contract, không phải lý do chặn việc viết bộ tài liệu đã được duyệt. SF37–SF42 chỉ nghiệm thu triển khai sau SF72 và quyết định tài khoản/chi phí; giữ lại công việc cũ có bằng chứng, không giả định đã deploy.
