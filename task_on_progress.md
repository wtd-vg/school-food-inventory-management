# Task on progress

Last updated: 2026-09-19

## Mục tiêu duy nhất

Để mọi thành viên tự chạy và giải thích được:

```text
React → Django → PostgreSQL
```

## Đã làm

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

Bắt đầu feature nhỏ đầu tiên: `Category`.

## Chưa làm

- đăng nhập và phân quyền;
- nhập kho, xuất kho, kiểm kê và báo cáo;
- CI;
- Neon, Render và domain thật.

Những phần này được hoãn, không bị hủy. Team sẽ thêm từng phần khi có nhu cầu và hiểu rõ lý do.
