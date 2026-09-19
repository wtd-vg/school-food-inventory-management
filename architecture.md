# SchoolFood Architecture

## Mục tiêu hiện tại

Tạo một skeleton mà thành viên mới có thể tự giải thích:

```text
React → Django → PostgreSQL
```

## Công nghệ

- React + TypeScript + Vite cho giao diện.
- Django cho backend.
- PostgreSQL cho database.
- Docker Compose để các máy chạy cùng môi trường.

## Cấu trúc

- Một Django project: `schoolfood`.
- Một Django app: `inventory`.
- Một React component chính: `App`.
- Một API mẫu: `GET /api/hello/`.

Không dùng router frontend, UI library, Django REST Framework, auth tùy chỉnh, CI hoặc cấu hình production trong skeleton.

## Nguyên tắc phát triển

1. Chỉ thêm file khi feature hiện tại cần nó.
2. Một feature phải chạy từ database đến giao diện.
3. Người viết code phải giải thích được code của mình.
4. Không tạo abstraction trước khi có ít nhất hai chỗ sử dụng.
5. Deploy và domain được làm sau feature nghiệp vụ đầu tiên.

## Feature đầu tiên

Sau khi skeleton chạy ổn, team làm `Category` theo thứ tự:

```text
Model → Migration → API → React → Test
```

## Kế hoạch của team 6 người

Bộ tài liệu hiện hành nằm trong `outputs/team-6/` (19/09/2026).
Đó là thiết kế cho các bước tiếp theo, không phải chức năng đã được cài vào skeleton.

- M0: cả 6 người tự chạy và giải thích khung.
- M1: Category chỉ đọc trên local.
- M2: danh mục và session/CSRF, quyền manager/viewer bằng Django mặc định.
- M3: nhập kho và giá vốn bình quân bằng Decimal; nháp chưa đổi tồn, chốt atomic và có ledger.
- M4: xuất kho có khóa hàng và không âm tồn; phiếu đã chốt chỉ đọc.
- M5: kiểm kê có snapshot/version, báo cáo tồn và nghiệm thu toàn luồng.
- M6: deploy/domain sau khi M5 đạt và chốt tài khoản/chi phí. Chưa chọn hoặc tạo tài nguyên cloud.

Chỉ tạo file/model khi tới task tương ứng. Vẫn giữ một Django app và không thêm framework vào lượt viết tài liệu này.
Hai hướng dẫn dùng Markdown (`.md`), không dùng Word: [hướng dẫn chung](outputs/team-6/SchoolFood_HuongDan_Chung.md) ghi schema và API contract; [hướng dẫn task](outputs/team-6/SchoolFood_HuongDan_Task.md) dùng mã SF01–SF42. Checklist Excel giữ owner, reviewer và bằng chứng.
