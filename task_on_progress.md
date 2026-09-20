# Task on progress

Last updated: 2026-09-20

## Mục tiêu duy nhất

Để mọi thành viên tự chạy và giải thích được:

```text
React → Django → PostgreSQL
```

## Đã làm

- SF07: đã chuẩn bị contract Category, phạm vi file của TV1–TV6 và thứ tự branch/merge trong `architecture.md`. Chưa nghiệm thu SF07 vì chưa có xác nhận đủ sáu người qua M0 và TV2/TV3/TV6 đã đọc thống nhất.
- Kiểm tra ngày 20/09/2026: Django `manage.py check`, TypeScript và Vite build (`--configLoader runner`) đều đạt. Máy hiện tại chưa có lệnh Docker, chưa xác nhận Compose và test tích hợp PostgreSQL.

- Soạn bộ tài liệu hiện hành cho TV1 leader và TV2–TV6 trong `outputs/team-6/`.
- Có hướng dẫn chung và thẻ hướng dẫn SF01–SF42 dạng Markdown (`.md`), checklist Excel với 22 case nghiệm thu.
- 36 task thuộc bản local, 6 task deploy/domain để sau. Mỗi người bắt đầu bằng một task M0.
- Chưa đánh dấu task nào của team hoàn tất; tên thật và hạn dự kiến chờ team điền. Code ứng dụng không đổi trong lượt tài liệu.
- Đã chuyển hai hướng dẫn từ Word sang Markdown theo yêu cầu, giữ đủ 42 task và cập nhật liên kết. Hai bản Word vừa tạo được chuyển vào `.tmp/team-pack/retired-docx/` để tránh trùng trong thư mục tài liệu hiện hành; có thể khôi phục nếu cần.
- Checklist Excel giữ nguyên: đã kiểm tra cả 3 sheet; thử công thức tiến độ với đủ/thiếu review, bằng chứng và task phụ thuộc rồi khôi phục trạng thái ban đầu. Kiểm tra công thức bằng Artifact Tool, chưa xác nhận tính lại trong Microsoft Excel. Ghi chú “thẻ SF trong Word” ở sheet Team là tên định dạng cũ; tra thẻ trong file Markdown hiện hành.

- Tạo Docker Compose với ba service: `db`, `backend`, `frontend`.
- Tạo API mẫu `GET /api/hello/`.
- Tạo một trang React gọi API mẫu.
- Tạo một test Django cho API mẫu.
- Bỏ các phần làm quá sớm: auth, Swagger, DRF, UI library, router, CI, Render, Neon và production hardening.
- Viết lại README để giải thích từng file và vòng đời một request.

## Cần xác nhận

- [ ] Cài Docker Desktop.
- [ ] Chạy `docker compose up --build`.
- [ ] Chạy migration.
- [ ] Mở trang React và thấy PostgreSQL đã kết nối.
- [ ] Chạy test Django.
- [ ] Mỗi thành viên giải thích được vòng request trong README.

## Sau khi hoàn thành

Nghiệm thu SF07, sau đó mở SF08 để TV2 làm feature nhỏ đầu tiên: `Category`.

## SF07 Đang chờ xác nhận

- [x] Ghi ví dụ `GET /api/categories/`: `results`, `id`, `code`, `name`, `is_active`; thống nhất thứ tự và danh sách rỗng.
- [x] Chốt M1 chỉ đọc; dữ liệu thử tạo bằng Django shell trong SF08.
- [x] Phân file và thứ tự: SF08 trước, SF09/SF10 có thể song song, tiếp SF11 rồi SF12.
- [ ] Có bằng chứng SF01–SF06: từng người tự chạy và giải thích được skeleton.
- [ ] TV2 và TV3 đọc contract, giải thích được ví dụ response; TV6 review SF07.
- [x] Chủ dự án duyệt đưa skeleton, checklist và cập nhật SF07 lên `dev1`; hướng dẫn team clone/pull và mở PR về `dev1` đã cập nhật.

Bằng chứng SF07: mục “SF07 Thống nhất Category và chia việc M1” trong `architecture.md`. Category chưa được triển khai; xác nhận M0 và review của team vẫn còn chờ. Commit tài liệu trước đó là `2353d51` trên `dev1`. Bản nền và các cập nhật hiện tại được bàn giao bằng commit tiếp theo trên cùng nhánh; xem lịch sử Git để xác nhận commit và trạng thái đồng bộ remote.

## Chưa làm

- đăng nhập và phân quyền;
- nhập kho, xuất kho, kiểm kê và báo cáo;
- CI;
- Neon, Render và domain thật.

Những phần này được hoãn, không bị hủy. Team sẽ thêm từng phần khi có nhu cầu và hiểu rõ lý do.
