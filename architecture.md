# SchoolFood Architecture

Cập nhật 30/09/2026. Hiện trạng dưới đây thuộc `origin/dev1@7df9bcf`; local `4a2c191` chưa pull. Các mục G2 phía sau gồm thiết kế đã có một phần và phần dự kiến, không thay bằng chứng triển khai. Hiện trạng mới nhất, lỗi mở và lộ trình: [plan_final.md](plan_final.md).

## 1. Hiện trạng và công nghệ

React 19 + TypeScript + Vite → Django 5.2.17 → PostgreSQL 17. Session/CSRF, manager/viewer; một app inventory. Frontend dùng state Screen; router/design “Bếp Nhà Trường” đã được duyệt R5, chưa có shell mới. Không tự thêm DRF/UI kit/queue.

| Phần | Code trên dev1 | Giới hạn |
| --- | --- | --- |
| Kho | Receipt/Line, Issue/Line, StockTake/Item, StockTransaction; create/post services, API, trigger | UI nhập/xuất chưa có; input/rounding có issue |
| Báo cáo | Đọc StockTransaction; lọc DateField | Chưa thay cho đối chiếu dữ liệu thực/QA |
| Lớp/ngày ăn | SF43 SchoolClass(enrolled,grade), LunchDay, ClassMealCount, LunchDayEvent; lunch.py | class_views chưa đồng bộ field; chưa có API số suất |
| Món/công thức | Dish/RecipeComponent, API dishes | 3 số lẻ gây mất định lượng nhỏ; thiếu LunchPlan/snapshot |
| Nhu cầu/đơn/chi phí | Thiết kế | Chưa có model/service đầy đủ |
| Deploy | Config/script một phần | Chưa kiểm chứng môi trường production/restore |

## 2. Nền kho đã hợp nhất và cổng G2.0 còn mở

SF25/SF31 đã merge: StockTransaction dùng chung IN/OUT/ADJUST, nguồn chứng từ và trigger tương ứng. Service hiện hành không ghi InventoryLedger; báo cáo không đọc nguồn legacy đó. Xóa InventoryLedger là đề xuất P4, chưa làm.

Nháp không đổi tồn; chốt atomic, khóa đầu phiếu rồi FoodItem theo id tăng dần; cập nhật quantity/avg_cost/stock_version và ledger cùng giao dịch. Không âm kho/chốt hai lần; kiểm kê dùng snapshot/version. OUT lưu value_delta âm; báo cáo chi phí chuyển về độ lớn dương, không thay quy ước sổ.

Migration có hai nhánh 0008 nối bởi 0012, tới 0013. DB sạch chạy đủ 94 test và không drift model. DB từng chạy mixed-0008 tại f00048d bị trùng bảng khi nâng cấp: ISSUE-001 là việc phải xử lý trước đồng bộ DB cũ. Không xóa migration hoặc reset DB theo kế hoạch N1 lịch sử. Đối chiếu nguồn/giá/ngày/người thực hiện trên DB riêng; không tạo giả dữ liệu thiếu.

Contract SF25/31/43 nằm trong outputs/team-6/contracts trên dev1; checkout cũ có thể chưa có. Dùng git ls-tree/git show origin/dev1 để đọc đúng ref. Cổng G2.0 chỉ đóng sau bằng chứng đối chiếu, sửa blocker và review; không chỉ dựa vào test DB sạch.

## 3. Phạm vi G2 và sơ đồ dữ liệu dự kiến

Một trường, một kho, chỉ bữa trưa, một thực đơn và một khẩu phần chuẩn/ngày. Manager nhập tổng theo lớp và suất nhân viên riêng; viewer chỉ đọc. Chưa quản lý học sinh, nhóm tuổi, nhiều bữa, dị ứng, AI, lô/hạn dùng, trả kho/hủy thức ăn sau xuất hoặc tích hợp gửi tin. Trường cần nhiều khẩu phần phải mở rộng phạm vi trước khi dùng thực tế.

```text
SchoolClass → ClassMealCount → LunchDay (dự kiến, thực tế, chốt)
Dish → RecipeLine(FoodItem) → LunchPlan → PlanRecipeSnapshot
LunchDay + LunchPlan → DemandRevision → StockAllocation
DemandRevision → PurchaseOrder → PurchaseOrderLine
PurchaseOrderLine → ReceiptLine → StockTransaction(IN)
LunchDay → Issue/IssueLine → StockTransaction(OUT)
StockTakeItem → StockTransaction(ADJUST)
```

Sơ đồ gồm cả hiện trạng và đích thiết kế: SchoolClass/LunchDay/ClassMealCount và nền kho đã có; món hiện dùng tên RecipeComponent, chưa có LunchPlan/PlanRecipeSnapshot/DemandRevision/StockAllocation/PurchaseOrder. TV1 chốt SF49/55/61/67 trước triển khai; không tạo lại SF43 đã merge.

| Nhóm | Ràng buộc tối thiểu |
| --- | --- |
| Lớp và ngày ăn | Mã lớp unique; unique(class,date); sĩ số và suất nguyên không âm; suất lớp không vượt sĩ số snapshot; chưa nhập=null, nghỉ ăn=0 |
| LunchDay | Ngày unique trong một trường; suất nhân viên riêng; dự kiến/thực tế độc lập, người chốt/thời điểm/version; lớp hoạt động phải nhập hoặc đánh dấu nghỉ |
| RecipeLine | unique(dish,food); định lượng trước sơ chế mỗi suất >0; công thức ít nhất một dòng; food có đơn vị chuẩn |
| LunchPlan | Ngày unique; nháp/chốt/phiên bản điều chỉnh; bản chụp món, food, định lượng, đơn vị khi chốt; ngày nghỉ tách khỏi thiếu thực đơn |
| DemandRevision | Tham chiếu phiên bản số suất/thực đơn; lưu phần đóng góp, dự phòng/lý do, thời điểm tính; bản cũ không ghi đè |
| Allocation | Liên kết nhu cầu với nguồn tồn hoặc phần chưa nhận của đơn; qty>0; tổng giữ không vượt nguồn; có trạng thái giải phóng/đã dùng |
| PurchaseOrder | Supplier, ngày/giờ cần nhận, người tạo/duyệt, version; nháp phải có dòng; unique(order,food) |
| Nhận hàng | Dòng nhập liên kết dòng đơn, food phải khớp; chỉ lượng chấp nhận đã chốt được tính; nhiều lần nhận; không nhận vượt trong bản đầu |
| Xuất bữa trưa | Gắn ngày ăn; có thể nhiều phiếu bổ sung; không trừ kho khi tạo nháp; người chốt và lý do chênh lệch |

Food đang dùng chỉ được ngừng sử dụng, không phá lịch sử tham chiếu. Chưa có quản lý lô/hạn dùng: không quảng bá tồn khả dụng là đã kiểm chứng hạn dùng; kho phải được đối chiếu trước khi lập kế hoạch.

## 4. Phép tính, đơn vị và giá trị

Decimal phía backend; API gửi decimal dưới dạng chuỗi. Không nhận float/bool/NaN/Infinity vào trường nghiệp vụ Decimal. Đích contract dùng kg, l, cái; code recipe hiện nhận kg, lit, piece nên SF49 phải chốt mã/mapping rõ; g→kg và ml→l chia 1000. Không quy đổi khối lượng sang thể tích. FoodItem.unit đang là text: SF49/50 phải có bước mapping dữ liệu cũ, từ chối mã không hỗ trợ thay vì đoán.

Định lượng quy đổi/cộng với độ chính xác đủ (đề xuất 6 số lẻ cho mỗi suất). Chỉ làm tròn cuối nhu cầu đến 0.001 đơn vị kho, ROUND_HALF_UP; đơn vị cái làm tròn lên nguyên chiếc. Tiền 2 số lẻ ROUND_HALF_UP; mọi field phải có kiểm tra tràn. Không làm tròn từng món trước khi cộng. Dự phòng nhập riêng, mặc định 0, có lý do khi >0; chưa thêm quy cách bao/gói tự động trong G2.

Nhu cầu food = tổng(số suất × định lượng food trong từng món).

Mua thêm = max(0, nhu cầu + dự phòng − tồn được phân bổ − phần đơn chưa nhận được phân bổ và giao kịp).

Ví dụ kiểm thử: 300 suất × (60+10) g = 21 kg. Dự phòng 1 kg, tồn phân bổ 5, đang đặt phân bổ 4 → mua 13 kg. Đây không phải khuyến nghị dinh dưỡng.

Chi phí nguyên liệu/ngày = tổng value_delta xuất cho ngày đó theo quy ước giá trị xuất dương của báo cáo. Chi phí/suất = tổng chi phí / số suất thực tế; 0 suất trả null kèm lý do. Xuất cho bếp không chứng minh lượng học sinh đã tiêu thụ; chênh lệch không tự kết luận thất thoát.

## 5. Vòng đời và đồng thời

- Số suất: nháp → chốt; mở lại cần lý do và phiên bản mới; thay sĩ số lớp không thay snapshot cũ. Giờ chốt là cấu hình vận hành sẽ xác nhận trong SF43, không tự khóa ở giờ cố định chưa được trường chọn.
- Thực đơn: nháp → chốt; điều chỉnh tạo revision giữ bản cũ. Sửa công thức không đổi món đã snapshot.
- Đề xuất: tính nháp → duyệt phân bổ; khi version thực đơn/suất/tồn đổi phải kiểm tra lại. Bản xem trước chưa giữ hàng.
- Đơn: nháp → duyệt → người dùng xác nhận đã gửi → nhận một phần → hoàn tất. Nháp/đơn chưa gửi có thể hủy; sau gửi phải ghi nhận lý do và xác nhận xử lý với nhà cung cấp. Đã nhận một phần thì đóng phần còn lại, không xóa lịch sử nhập.
- Nhận: nháp → chốt. Trong cùng transaction, cập nhật receipt/ledger/tồn, đã nhận của đơn, chuyển allocation nguồn hàng đang chờ sang tồn. Không giữ cả hai nguồn cho cùng lượng.
- Xuất: nháp → chốt; giảm tồn và allocation tương ứng. Phiếu xuất bổ sung = max(0, nhu cầu thực tế − đã xuất). Nếu đã xuất vượt nhu cầu, hiện chênh lệch và lý do, không tự trả kho.
- Đóng ngày: số suất thực tế và thực đơn đã chốt; mọi phiếu liên quan đã xử lý; còn chênh lệch thì có giải thích. Mở lại có lịch sử; không sửa phiếu posted.

SF55/61 phải duyệt một thứ tự khóa chung cho demand/order/receipt/food/allocation trước code, tương thích thứ tự đầu phiếu→food của nền kho; kiểm thử deadlock và rollback với hai kết nối. Kiểm tra version phía server, unique key cho thao tác tạo từ nguồn và idempotency cho request gửi lại. Không chỉ khóa nút frontend.

Tồn dành cho kế hoạch vẫn nằm trong quantity; nghiệp vụ xuất khác không được tiêu thụ phần đã giữ nếu chưa giải phóng hoặc phân bổ lại có lý do. Kiểm kê thiếu phải đánh dấu phân bổ không đủ và chặn duyệt phụ thuộc, không âm thầm coi nguồn vẫn đủ. Chỉ count hàng dự kiến nhận trước thời điểm cần dùng; hủy/giao muộn làm nhu cầu thiếu trở lại.

## 6. Contract API và tổ chức mã

API trên dev1: /api/auth/*, /api/categories/, /api/foods/, /api/suppliers/, /api/receipts/, /api/issues/, /api/stocktakes/, /api/classes/, /api/dishes/, /api/reports/stock/, /api/reports/transactions/ và route chi tiết/chốt trong urls.py. Có thêm /api/lunch-days/<date>/counts|lock|reopen. Chưa có API thực đơn ngày, nhu cầu, đặt hàng. Lỗi Class/recipe API ghi trong plan_final.md §5.

Khi mở task API, owner ghi route/method, JSON request/response, ví dụ lỗi và version trong thẻ task/architecture trước FE. GET danh sách dùng results; input sai 400, chưa đăng nhập 401, quyền/CSRF 403, không thấy 404, method sai 405, trạng thái/version xung đột 409. Không đổi API cũ chỉ để đồng bộ tên nếu ngoài task. created_by lấy từ session, không từ client; lỗi không chứa traceback hoặc bí mật.

Giữ app inventory; có thể thêm meal_services.py, recipe_services.py, demand_services.py, purchase_services.py và view/test tương ứng khi đến nhiệm vụ. TV1 điều phối models/migrations; TV4 urls; TV3 App; người sửa file chung hẹn thứ tự merge. Task backend viết test cùng logic, QA viết case độc lập và E2E.

## 7. Kiểm chứng và mở mốc

G2.1/2 không cần chờ toàn bộ kho, nhưng G2.3 tích hợp tồn cần G2.0 đạt. G2.3 có thể chốt contract nguồn đơn và test bằng fixture; phải nghiệm thu lại bằng đơn thật ở SF66. FE dựng với JSON mẫu chỉ là đang làm, không phải hoàn tất API thật.

Các ràng buộc liên bảng/concurrency kiểm tra bằng PostgreSQL; không SQLite. Trạng thái test hiện tại xem plan_final.md §2 và evidence, không lấy số test từ tài liệu lịch sử. M6/SF37–SF42 triển khai sau khi G2 được nghiệm thu và chi phí/tài khoản được chủ dự án duyệt. SF38 đã deploy lên EC2 + Cloudflare Tunnel (PR #33).

## 8. Contract SF19 được giữ để bàn giao nền kho

Nội dung dưới đây là contract SF19 ngày 28/09/2026. Các câu “chưa triển khai” mô tả thời điểm SF19 và phải đối chiếu mục hiện trạng phía trên khi bắt đầu task mới.

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
