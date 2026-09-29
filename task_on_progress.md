# Tiến độ SchoolFood

Cập nhật 29/09/2026. Khảo sát code nền `94c733a` trên dev1; thay đổi tài liệu trên `docs/g2-lunch-plan`. Không đồng nghĩa remote đã được fetch mới hoặc task đã nghiệm thu.

## Đã xác nhận bằng đọc code

- Có auth/danh mục, SF19 model/trigger/service nháp/test, kiểm kê/API báo cáo/ReportPage.
- Chưa thấy post_receipt, model/service xuất và bộ API/UI nhập–xuất đầy đủ trong bản khảo sát.
- Hai nguồn ledger đang tách: StockTransaction (SF19) và InventoryLedger (kiểm kê/báo cáo).
- Có cấu hình deploy/backup, chưa xác nhận môi trường deploy hoặc restore thực tế.

## Đợt tài liệu G2 đã được duyệt

- [x] Khảo sát code và thống nhất phạm vi toàn bộ SF43–SF72.
- [x] Soạn README, architecture, codex, AGENTS và đồng bộ quy chuẩn Git.
- [x] Soạn kế hoạch G2, thẻ task và case AC23–AC47.
- [x] Kiểm tra workbook và kỹ thuật; unit test có 1 lỗi sẵn có cần xử lý ở nền, không đánh dấu cả bộ đạt.
- [ ] Reviewer của team kiểm tra bộ tài liệu; chưa tự đánh dấu thay TV6.

## Mở việc tiếp theo

TV1 chuẩn bị kế hoạch triển khai SF43; song song review BASE01–05 ở G2.0. Chỉ mở G2.3–5 khi nền kho được nghiệm thu. Chi tiết [kế hoạch](outputs/team-6/GiaiDoan2_KeHoach.md), [task](outputs/team-6/SchoolFood_HuongDan_Task.md), [checklist](SchoolFood_Checklist_6_ThanhVien.xlsx).

Task mới đang “Chưa làm”; deadline/tên thành viên thật chờ team điền. Không chuyển các SF cũ thành hoàn tất chỉ dựa vào việc có code hoặc báo cáo lịch sử.

## Kiểm chứng

Check, migration check, TypeScript và Vite build đạt. Unit test PostgreSQL riêng: **43/44 đạt**; test_reports_stock mong số 210.0 nhưng API trả chuỗi "210.00". Có cảnh báo timezone ở lọc báo cáo. SF34/BASE04 cần chốt contract và xử lý, chưa sửa code trong lượt tài liệu.

Kết quả, giới hạn và ảnh checklist tại [báo cáo kiểm tra](outputs/team-6/evidence/G2_Documentation_QA.md). Không dùng các kiểm tra này để xác nhận SF43–SF72 đã triển khai.
