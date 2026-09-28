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

## SF19 — Phiếu nhập và sổ kho (28/09/2026)

Chủ dự án đã chọn **phương án B**: chỉ lưu phiếu nháp khi có ít nhất một dòng hợp lệ.
Phần này là contract triển khai SF19, bổ sung cho lộ trình ở trên; không xác nhận thay
reviewer rằng SF18/SF19 đã được nghiệm thu. Nền triển khai: `origin/dev1` tại `f68488a`.

### Model và quan hệ

| Model | Field và quy tắc |
| --- | --- |
| Receipt | supplier bắt buộc; date bắt buộc; note cho phép trống; status draft/posted; created_by bắt buộc; posted_at null khi draft, bắt buộc khi posted. |
| ReceiptLine | receipt, food bắt buộc; quantity Decimal(14,3) > 0; unit_price Decimal(14,2) > 0; unique(receipt, food). Một thực phẩm có thể có ở các phiếu khác nhau. |
| StockTransaction | food, type, quantity_delta Decimal(14,3), unit_cost Decimal(14,2), value_delta Decimal(28,2), date, created_by; receipt_line là OneToOne bắt buộc trong M3. |

FoodItem giữ nguyên quantity, avg_cost và stock_version đã có ở M2. Supplier/Food/User
được PROTECT khi còn chứng từ tham chiếu. Xóa cả phiếu nháp sẽ xóa các dòng nháp;
xóa dòng cuối riêng lẻ bị chặn. Phiếu posted và các dòng của nó không được sửa/xóa.
Không có API xóa phiếu trong SF19; đây là quy tắc lưu trữ để bảo vệ các bước phát triển sau.

Ledger là sổ ghi bất biến: không update/delete, không đổi sang nguồn khác. M3 chỉ lưu
type IN và nguồn receipt_line. Enum OUT/ADJUST dành cho tương lai; database hiện từ chối
chúng. SF25/SF31 phải thêm FK issue_line/stocktake_line bằng migration mới, đổi ràng buộc
thành đúng một nguồn khác null, mỗi FK nguồn unique, và cập nhật trigger theo từng loại.
Không sửa migration đã merge để mở thêm loại giao dịch.

quantity_delta của nhập bằng quantity dòng; unit_cost bằng unit_price; date theo ngày
chứng từ, không theo ngày bấm chốt. value_delta = quantity × unit_price, ROUND_HALF_UP
2 chữ số. Giá trị có thể bằng 0 do làm tròn với lượng rất nhỏ; quantity/unit_price vẫn
phải dương. Decimal(28,2) đủ chứa tích của hai field dòng, tránh tràn Decimal(14,2).

### Tạo nháp theo phương án B

Điểm vào Python dùng chung cho view tương lai và Django shell:

```python
create_receipt_draft(
    supplier_id=1,
    date="2026-09-28",
    note="Nhập buổi sáng",
    lines=[
        {"food_id": 1, "quantity": "50.000", "unit_price": "90000.00"},
        {"food_id": 2, "quantity": "10.000", "unit_price": "120000.00"},
    ],
    user=request.user,
)
```

Các id chỉ là ví dụ, phải tồn tại trong DB. user được truyền riêng từ session của view;
không nhận created_by từ JSON. SF22 gọi hàm bằng các tham số được chọn rõ ràng, không
truyền thẳng `**request_json`. View chịu trách nhiệm quyền manager và CSRF theo SF13.
Service kiểm tra người dùng đăng nhập/active, ngày, nhà cung cấp tồn tại, cấu trúc dòng,
food tồn tại, số dương hữu hạn/đúng độ dài và độ chính xác; không nhận float/bool.
Tạo nháp không tăng quantity/avg_cost/stock_version và không tạo StockTransaction.
Trạng thái active của food phải được SF20 kiểm tra lại khi khóa và chốt.

Hàm trả Receipt đã lưu, lỗi đầu vào là ValidationError, thiếu tài khoản hợp lệ là
PermissionDenied. Toàn bộ thao tác nằm trong transaction.atomic: nếu dòng thứ hai lỗi
thì đầu phiếu và dòng thứ nhất cũng không được lưu. SF22 ánh xạ lỗi nhập thành HTTP 400;
các lỗi bất biến dữ liệu/cạnh tranh cần trả thông báo phù hợp, không gửi traceback SQL.

### Vì sao có migration PostgreSQL riêng?

`0005_receipt_ledger` tạo ba bảng, foreign key, unique và CHECK cho số/trạng thái.
`0006_receipt_integrity` bổ sung trigger PostgreSQL cho quy tắc liên quan nhiều bảng:

- CHECK thông thường không đếm được ReceiptLine của một Receipt. Constraint trigger
  chờ đến COMMIT mới kiểm tra: trong giao dịch được tạo đầu phiếu trước, nhưng kết thúc
  giao dịch phải có dòng. Vì vậy `Receipt.objects.create(...)` riêng ở autocommit sẽ lỗi;
  dùng create_receipt_draft hoặc atomic gồm cả đầu phiếu và các dòng.
- Trigger trên dòng khóa đầu phiếu. Hai thao tác cùng xóa các dòng cuối được xử lý lần
  lượt, không thể để lại phiếu rỗng. Đổi receipt_id cũng kiểm tra cả phiếu cũ và mới.
- Trigger chặn sửa/xóa posted và sửa/xóa ledger, kể cả QuerySet.update hoặc SQL thông
  thường bỏ qua model.save. Đây không phải chỉ là thuộc tính readonly trên giao diện.
- Tại COMMIT, draft không được có ledger; posted phải có đúng một ledger khớp từng dòng
  về food, lượng, đơn giá, thành tiền và ngày. OneToOne chặn ghi trùng một nguồn.

Hai migration mới có chiều hoàn tác. Dự án dùng PostgreSQL; migration trigger không
hỗ trợ SQLite. Không thực hiện rollback migration chứa dữ liệu thật như một thao tác
chạy hằng ngày, vì rollback bảng sẽ xóa dữ liệu chứng từ.

### Contract bàn giao SF20: post_receipt(receipt_id, user)

Chỉ chốt chữ ký và trách nhiệm ở SF19; chưa triển khai hàm chốt hoặc API/UI nhập kho.

1. View lấy user từ session, kiểm tra manager và CSRF. Hàm chốt chạy trong atomic.
2. Khóa Receipt bằng select_for_update; nếu không còn draft thì xung đột 409, không ghi lại.
3. Đọc các dòng, bắt buộc có ít nhất một dòng và không trùng food; khóa FoodItem theo id
   tăng dần. Dùng cùng thứ tự khóa đầu phiếu → food trong mọi đường chốt.
4. Kiểm tra thực phẩm active và toàn bộ số liệu bằng Decimal; tính tồn/giá mới, kiểm tra
   không tràn field. Cập nhật tồn, avg_cost, tăng stock_version cho mỗi food đúng một lần.
5. Tạo ledger IN cho từng dòng **trước** khi chuyển Receipt sang posted. created_by của
   Receipt là người lập, còn created_by của ledger là user chốt; hai người có thể khác.
6. Cuối cùng đặt status=posted, posted_at=timezone.now(), rồi commit cả giao dịch. Nếu
   lỗi bất kỳ bước nào thì tồn, version, ledger và trạng thái phiếu đều rollback.
7. Trả Receipt đã chốt. SF22 ánh xạ sai dữ liệu thành 400, trạng thái xung đột thành 409,
   không tìm thấy thành 404 và áp dụng 401/403 theo contract quyền hiện hành.

Không thêm signal tự cập nhật tồn khi lưu dòng hoặc ledger: việc đổi tồn chỉ thuộc hàm
chốt SF20. Nếu dùng select_related trong truy vấn khóa đầu phiếu, chỉ khóa Receipt bằng
`select_for_update(of=("self",))` để tránh vô tình khóa bảng liên quan khác.

### Ví dụ để TV2/TV4/TV6 đối chiếu

Phiếu nháp có hai dòng Gạo 50.000 × 90000.00 và Thịt 10.000 × 120000.00:
status=draft, posted_at=null, ledger=0; tồn và stock_version giữ nguyên.
Thêm một dòng Gạo nữa vào cùng phiếu bị từ chối. Một phiếu khác vẫn được nhập Gạo.

Sau khi SF20 chốt hợp lệ: status=posted, posted_at có thời điểm; hai ledger IN lần lượt
có value_delta 4500000.00 và 1200000.00, mỗi ledger trỏ đúng một dòng nguồn. Nếu tồn trước
đó bằng 0 thì tồn mới là 50.000/10.000 và avg_cost là 90000.00/120000.00. Đây là expected
cho SF20; fixture posted trong test SF19 chỉ chứng minh cấu trúc dữ liệu và tính bất biến,
không giả làm phép tính nhập kho đã được triển khai.

### Kiểm tra và bàn giao

```powershell
python backend/manage.py check
python backend/manage.py makemigrations --check --dry-run
python backend/manage.py test apps.inventory
```

Test SF19 nằm trong `test_receipts.py`; dùng TransactionTestCase để kiểm tra COMMIT thật
và hai kết nối PostgreSQL đồng thời. TV6 cần review migration, nhất là trigger deferred;
TV2/TV4 cần xác nhận chữ ký và thứ tự chốt ở trên trước PR SF20/SF22. Chưa tự đánh dấu
các xác nhận của thành viên là đã hoàn tất.
