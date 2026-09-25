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

## SF07 Thống nhất Category và chia việc M1

Ngày chuẩn bị: 20/09/2026. TV1 chịu trách nhiệm, TV6 review. Đây là quyết định để triển khai SF08–SF12; API Category chưa có trong code. Chờ xác nhận SF01–SF06 và team đọc thống nhất trước khi nghiệm thu SF07.

### Category là gì

Category là nhóm thực phẩm, ví dụ `GAO` — Gạo và ngũ cốc, `RAU` — Rau củ. M1 chỉ cần đọc các nhóm từ PostgreSQL lên trang React. TV2 tạo dữ liệu thử bằng Django shell sau khi có model và chạy migration ở SF08.

### Thỏa thuận giữa backend và frontend

Gọi `GET /api/categories/`, nhận HTTP `200` với `Content-Type: application/json`:

```json
{
  "results": [
    { "id": 1, "code": "GAO", "name": "Gạo và ngũ cốc", "is_active": true },
    { "id": 2, "code": "RAU", "name": "Rau củ", "is_active": true }
  ]
}
```

Các id trên chỉ là ví dụ; frontend dùng id thực tế server trả, không gắn cứng 1 hoặc 2.

| Field | Kiểu JSON | Ý nghĩa và quy tắc |
| --- | --- | --- |
| `id` | number nguyên | Khóa chính do Django tự tạo. Frontend dùng làm key của dòng. |
| `code` | string | Mã nhóm duy nhất, tối đa 32 ký tự; dữ liệu tạo bằng shell phải bỏ khoảng trắng đầu/cuối và viết hoa. |
| `name` | string | Tên hiển thị, không rỗng sau khi bỏ khoảng trắng đầu/cuối, tối đa 120 ký tự. |
| `is_active` | boolean | Còn sử dụng hay không; mặc định `true`. |

- `results` luôn là mảng. Khi chưa có nhóm, trả `200` với `{"results": []}`.
- Sắp xếp theo `id` tăng dần; trả cả nhóm đang dùng và ngừng dùng. M1 chưa lọc, tìm kiếm hoặc phân trang.
- M1 chỉ đọc trên local, chưa yêu cầu đăng nhập. Chưa cung cấp API tạo, sửa hoặc xóa. Phương thức không hỗ trợ phải bị từ chối, không làm thay đổi dữ liệu.
- Trong SF08/SF10, kiểm tra phương thức không hỗ trợ trả `405` khi request đã qua middleware. Với POST thiếu CSRF, Django có thể trả `403` trước khi tới view; không tắt CSRF để đổi mã lỗi.
- React đọc `response.results`, hiển thị mã, tên và trạng thái sử dụng. Có ba trạng thái tải dữ liệu, danh sách rỗng và lỗi kết nối/API; lỗi không được hiển thị như danh sách rỗng.
- Giữ `/api/hello/` và test hiện tại để cả team tiếp tục kiểm tra kết nối.

### Ai sửa file nào

Đường dẫn bên dưới tính từ thư mục gốc repository. File ghi “tạo mới” chỉ được tạo khi làm task tương ứng.

| Task | Người làm / review | Phạm vi file |
| --- | --- | --- |
| SF07 | TV1 / TV6 | `architecture.md`, `task_on_progress.md`: thống nhất contract và thứ tự tích hợp. |
| SF08 | TV2 / TV4 | `backend/apps/inventory/models.py` (tạo mới), migration sinh từ model; `views.py`, `urls.py` trong cùng app. |
| SF09 | TV3 / TV5 | `frontend/src/CategoryPage.tsx` (tạo mới), `App.tsx`, `styles.css`. |
| SF10 | TV4 / TV2 | `backend/apps/inventory/tests.py`: test danh sách rỗng, dữ liệu thật, mã trùng và phương thức không hỗ trợ. |
| SF11 | TV5 / TV3 | Review giao diện SF09; sửa `CategoryPage.tsx`/`styles.css` nếu cần, phối hợp với TV3. |
| SF12 | TV6 / TV1 | Chạy nghiệm thu trên máy khác, ghi AC02 trong checklist; sửa README nếu hướng dẫn còn thiếu. |

TV1 duyệt thay đổi model/migration và quyết định merge. Trong M1, TV2 là người sửa URL backend; TV3 là người tích hợp vào `App.tsx`. Nếu cần sửa file do người khác đang làm, hẹn thứ tự và lấy bản mới sau khi PR trước được merge.

### Nhánh và thứ tự tích hợp

Theo quyết định ngày 20/09/2026, team lấy bản nền và tích hợp task trên `dev1`. TV1 đưa skeleton và checklist lên nhánh này; mỗi người lấy `dev1` mới nhất rồi tạo nhánh feature. Cần xác nhận chạy Docker/PostgreSQL ở M0 trước khi nghiệm thu bản nền. Việc đưa bản đã nghiệm thu sang `main` thực hiện sau.

| Task | Tên nhánh khi bắt đầu | Bắt đầu sau |
| --- | --- | --- |
| SF08 | `feat/SF08-category` | SF07 được nghiệm thu và bản nền đã có trên `dev1`. |
| SF09 | `feat/SF09-category-ui` | SF08 đã merge vào `dev1`. |
| SF10 | `feat/SF10-category-tests` | SF08 đã merge vào `dev1`; có thể làm cùng lúc SF09. |
| SF11 | `feat/SF11-category-ui-review` | SF09 đã merge vào `dev1`. |
| SF12 | `feat/SF12-category-acceptance` | SF09, SF10 và SF11 đã merge; tạo nhánh nếu có file cần cập nhật. |

Tên nhánh trên là quy ước, chưa phải nhánh hoặc PR đã tạo. Mỗi người lấy `dev1` mới, tạo nhánh của task mình, mở PR về `dev1`. PR ghi mã SF, thay đổi, cách thử và bằng chứng. Reviewer kiểm tra rồi TV1 quyết định merge; không sửa migration đã merge.

### TV1 kiểm tra team đã hiểu

TV2 giải thích cách tạo hai nhóm trong PostgreSQL và trả đủ bốn field. TV3 dùng JSON mẫu giải thích cách đọc `results`, hiển thị hai dòng và xử lý mảng rỗng. TV4 nêu cách kiểm tra code trùng bị chặn. TV6 xác nhận cả sáu người đã có bằng chứng M0 và đọc được hướng dẫn này. Khi các việc đó đạt, TV1 mở SF08.
