# SchoolFood hướng dẫn làm dự án

Dành cho TV1 leader và 5 thành viên  |  Bản làm việc ngày 19/09/2026

Team xây một ứng dụng giúp bếp trường ghi nhập thực phẩm, xuất cho bếp, kiểm đếm tồn và xem chênh lệch. Mọi người bắt đầu bằng ví dụ React gọi Django rồi Django đọc PostgreSQL. Mỗi mốc chỉ thêm một nhóm chức năng có thể chạy và giải thích được.

## 1 Đọc gì trước và làm gì ngay

- Cả team đọc mục 1–4 của tài liệu này, sau đó README.md trong repository.

- Mở SchoolFood_Checklist_6_ThanhVien.xlsx, sheet Cong viec, lọc cột Người làm theo TV của mình.

- Tra đúng mã SF trong [hướng dẫn từng task](SchoolFood_HuongDan_Task.md). Chỉ thực hiện task đủ điều kiện bắt đầu.

- Ngày đầu chỉ mở SF01–SF06. Chưa chia nhau viết tất cả tính năng. Deadline để trống cho TV1 thống nhất sau khi cả team chạy được khung.

## 2 Cái đang có và cái cần xây

Hiện có ba service Docker, một app inventory, API GET /api/hello/ và trang React hiển thị kết quả kết nối. Chưa có bảng nghiệp vụ, đăng nhập, CRUD hoặc deploy. Kiểm tra trước đây xác nhận Django check và React build; Compose và test PostgreSQL mới vẫn cần từng máy xác nhận ở M0. Các API và model trong tài liệu là thiết kế để team xây theo mốc.

## 3 Phân vai cho sáu người

| Mã | Vai trò | Việc chính |
| --- | --- | --- |
|  LEAD| Leader và tích hợp | Chốt phạm vi, API, migration; hỗ trợ auth; kiểm tra trước khi merge. |
| TV2 | Dữ liệu và nghiệp vụ backend | Category, danh mục; công thức nhập xuất; kiểm kê. |
| TV3 | Giao diện chính | Category, thực phẩm, đăng nhập; nhập xuất; báo cáo. |
| TV4 | API và test backend | Kết nối view với nghiệp vụ; kiểm tra dữ liệu và response. |
| TV5 | Giao diện và kiểm thử | Nhà cung cấp, kiểm kê; kiểm thử nhập xuất và lỗi UI. |
| TV6 | QA và hỗ trợ tích hợp | Chạy lại trên máy sạch; seed demo, test toàn luồng, bàn giao. |

Đây là phân công khởi đầu vì chưa có thông tin kỹ năng từng người. TV1 có thể đổi người trong checklist; giữ mã task và người review khác người làm. Vai trò TV1–TV6 là vai trò phát triển, không phải quyền đăng nhập của ứng dụng.

## 4 Nghiệp vụ cần hiểu trước khi code

| Từ | Nghĩa trong SchoolFood |
| --- | --- |
| Category | Nhóm thực phẩm, ví dụ Gạo và ngũ cốc. |
| FoodItem | Một loại thực phẩm, có mã và một đơn vị cố định như kg. |
| Supplier | Nhà cung cấp hàng. |
| Receipt | Phiếu nhập: thực phẩm vào kho; thường có nhiều dòng. |
| StockIssue | Phiếu xuất: thực phẩm cấp cho bếp, làm giảm tồn. |
| Stocktake | Phiếu kiểm kê: đối chiếu lượng đếm thực tế với sổ kho. |
| StockTransaction | Sổ giao dịch ghi mọi lần tăng/giảm tồn, liên kết chứng từ gốc. |
| Draft và posted | Draft là nháp, chưa đổi kho. Posted là đã chốt, chỉ đọc. |

### Phạm vi bản local

Một trường, một kho, đơn vị của từng thực phẩm không tự quy đổi. Chưa làm hạn sử dụng/lô, FIFO/FEFO, nhiều kho, meal plan, phê duyệt nhiều cấp, thông báo, AI hoặc xuất Excel/PDF. Đây là MVP học tập và demo; đánh giá thêm các yêu cầu vận hành thực phẩm trước khi dùng thực tế.

### Bộ số liệu dùng xuyên suốt

| STT | Thao tác | Kết quả |
| --- | --- | --- |
| 1 | Tạo Gạo, đơn vị kg | Tồn 0; giá vốn 0. |
| 2 | Nhập 50 kg, giá 90.000 đồng/kg | Tồn 50; bình quân 90.000. |
| 3 | Nhập 50 kg, giá 110.000 đồng/kg | Tồn 100; bình quân 100.000. |
| 4 | Xuất 20 kg | Tồn 80; trị giá xuất 2.000.000. |
| 5 | Thử xuất 81 kg | Bị từ chối; vẫn tồn 80. |
| 6 | Kiểm kê thực tế 77 kg | Chênh lệch -3; tồn 77; trị giá tồn 7.700.000. |

Giá bình quân mới = (tồn cũ × giá cũ + lượng nhập × giá nhập) / (tồn cũ + lượng nhập). Xuất dùng giá bình quân tại thời điểm chốt. Tiền dùng Decimal, đơn giá 2 chữ số thập phân; lượng 3 chữ số; ROUND_HALF_UP khi làm tròn. JSON gửi các số Decimal bằng chuỗi, ví dụ "50.000". Không dùng float để tính kho.

Không cho tồn âm. Không sửa/xóa/hủy phiếu posted trong MVP. Khi ghi sai, báo TV1; cơ chế đảo chứng từ là tính năng sau, không sửa trực tiếp database để che lỗi. Chênh lệch kiểm kê là dữ liệu quan sát, chưa phải kết luận gian lận.

## 5 Mô hình dữ liệu để triển khai dần

Các model dưới đây chưa có trong skeleton. Tạo đúng lúc task yêu cầu. Giữ một app inventory; không tạo tất cả bảng trong ngày đầu. id là khóa chính Django tự tạo, liên kết sang bảng khác dùng ForeignKey.

| Mốc | Model | Field tối thiểu |
| --- | --- | --- |
| M1 | Category | id; code unique (tối đa 32 ký tự); name (120); is_active=True. |
| M2 | Supplier | id; code unique (32); name (120); phone (32, cho phép trống); is_active. |
| M2 | FoodItem | id; code unique; name; category; unit; is_active; quantity Decimal(14,3)=0; avg_cost Decimal(14,2)=0; stock_version Integer=0. |
| M2 | User và Group | Dùng Django mặc định. Hai group manager và viewer. TV1 tạo tài khoản, không public đăng ký. |
| M3 | Receipt và ReceiptLine | Receipt: supplier, date, note, status, created_by, posted_at. Line: receipt, food, quantity, unit_price. |
| M3 | StockTransaction | food, type IN/OUT/ADJUST, quantity_delta có dấu, unit_cost, value_delta, date, created_by; một FK nguồn receipt_line/issue_line/stocktake_line. |
| M4 | StockIssue và Line | Issue: date, note, status, created_by, posted_at. Line: issue, food, quantity, unit_cost chụp lúc chốt. |
| M5 | Stocktake và Line | Stocktake: date, note, status, created_by, posted_at. Line: stocktake, food, expected_qty, expected_version, counted_qty nullable, variance, unit_cost snapshot. |

### Ràng buộc chung

- code strip khoảng trắng, viết hoa, tối đa 32; name strip, không rỗng, tối đa 120. unit chọn kg/lit/piece. Một food một dòng mỗi phiếu. is_active để ngừng dùng, không hard delete.

- Không sửa đơn vị FoodItem sau khi có giao dịch. Không cho API danh mục nhận quantity, avg_cost hoặc stock_version do client tự đặt.

- Chốt chứng từ trong một transaction: lưu hết hoặc không lưu gì. Khóa phiếu rồi food theo id tăng dần để hai request không cùng tiêu cùng một lượng tồn.

- Mỗi line posted tạo đúng một ledger nguồn; FK nguồn unique và đúng một nguồn không rỗng. Thêm FK Issue ở M4 và Stocktake ở M5 qua migration, không sửa migration đã merge.

- Ledger chỉ đọc. quantity_delta: nhập dương, xuất âm, kiểm kê dùng variance. value_delta = quantity_delta × unit_cost, làm tròn 2 số. Giá trị tồn hiện tại = quantity × avg_cost; có thể lệch cộng ledger vài xu do làm tròn.

- Tăng stock_version mỗi khi tồn thay đổi. Kiểm kê chốt chỉ hợp lệ nếu version còn bằng snapshot. Nếu khác, trả 409 và lập lại phiên kiểm kê.

## 6 API contract cho frontend và backend

Contract là thỏa thuận URL, dữ liệu gửi và dữ liệu nhận. Chỉ /api/hello/ đang có. M1 thêm GET Category để học trên local. Từ M2 mọi API nghiệp vụ yêu cầu đăng nhập; manager được ghi, viewer chỉ đọc. Không dùng DRF ở lộ trình này.

| Mốc | URL và phương thức | Cách dùng |
| --- | --- | --- |
| M1 | GET /api/categories/ | Danh sách: {"results":[{"id":1,"code":"GAO","name":"Gạo","is_active":true}]}. |
| M2 | GET /api/auth/csrf/<br>POST /api/auth/login/<br>GET /api/auth/me/<br>POST /api/auth/logout/ | Login nhận username/password. me trả id/username/role. Logout trả 200 với message. Không tự lưu password ở browser. |
| M2 | GET, POST /api/categories/<br>GET, POST /api/foods/<br>GET, POST /api/suppliers/ | GET trả results. POST tạo trả 201 với object có id. Foods có category_id, unit và Decimal dạng chuỗi. |
| M2 | PATCH /api/categories/&lt;id&gt;/<br>PATCH /api/foods/&lt;id&gt;/<br>PATCH /api/suppliers/&lt;id&gt;/ | Sửa field được phép; is_active=false để ngừng dùng. Không DELETE. |
| M3 | GET, POST /api/receipts/<br>GET /api/receipts/&lt;id&gt;/<br>POST /api/receipts/&lt;id&gt;/post/ | POST tạo draft với supplier_id, date, note, lines. Chốt riêng; posted chỉ đọc. |
| M4 | GET, POST /api/issues/<br>GET /api/issues/&lt;id&gt;/<br>POST /api/issues/&lt;id&gt;/post/ | Tương tự nhập; lines chỉ gửi food_id và quantity, không gửi giá vốn. |
| M5 | GET, POST /api/stocktakes/<br>GET, PATCH /api/stocktakes/&lt;id&gt;/<br>POST /api/stocktakes/&lt;id&gt;/post/ | POST nhận food_ids để server chụp snapshot. PATCH nhận lines[{food_id,counted_qty}]. |
| M5 | GET /api/reports/stock/<br>GET /api/reports/transactions/ | Lọc food_id; ledger thêm from/to dạng YYYY-MM-DD theo date chứng từ, bao gồm hai ngày. |

### Payload mẫu nhập kho

```json
{
  "supplier_id": 1,
  "date": "2026-09-19",
  "note": "Nhập gạo",
  "lines": [
    {
      "food_id": 1,
      "quantity": "50.000",
      "unit_price": "90000.00"
    }
  ]
}
```

Response chứng từ: id, date, status, lines, total_value. Mỗi line có food_id, quantity và giá phù hợp; posted có posted_at. List luôn {"results":[...]}; số id là integer, Decimal là string. MVP dùng toàn bộ danh sách nhỏ, chưa phân trang.

Lỗi ứng dụng dùng {"message":"...","errors":{"quantity":"..."}}. 400: JSON/field sai; 401: chưa login; 403: thiếu quyền/CSRF; 404: id không có; 405: method sai; 409: trùng mã, thiếu tồn, posted lặp hoặc snapshot cũ. Lỗi CSRF mặc định có thể là HTML: frontend kiểm tra response.ok trước khi đọc JSON và hiện thông báo chung. Không tắt CSRF để làm form chạy.

## 7 Cách team phối hợp theo mốc

| Mốc | Task | Điều kiện hoàn tất |
| --- | --- | --- |
| M0 | SF01–SF06 | 6 người tự chạy, giải thích được vòng request, test/build. |
| M1 | SF07–SF12 | Category đọc từ DB lên UI; TV6 chạy lại trên máy khác. |
| M2 | SF13–SF18 | Danh mục ghi được qua manager; viewer chỉ đọc; seed không trùng. |
| M3 | SF19–SF24 | Nhập kho và bình quân đúng; draft không đổi tồn; rollback và chốt lặp được test. |
| M4 | SF25–SF30 | Xuất chặn âm kho, kể cả hai request đồng thời. |
| M5 | SF31–SF36 | Kiểm kê, báo cáo và bộ mẫu toàn luồng đạt AC01–AC20. |
| M6 làm sau | SF37–SF42 | Mở khi M5 đạt và chủ dự án chốt tài khoản/chi phí/domain; nghiệm thu AC21–AC22. |

### Tránh sửa đè file của nhau

TV1 điều phối models.py, migration và settings.py. TV2/TV4 hẹn thứ tự sửa views.py, urls.py; người sau lấy main mới sau khi PR trước đã merge. TV3 điều phối App.tsx, TV5 tạo component riêng. TV4/TV5 chia vùng test; chỉ tách test_stock.py khi tests.py dài và có nhu cầu thật.

### Một task được tính xong khi nào

- Chức năng đúng điều kiện trong thẻ SF và có test hoặc kịch bản chạy lại.

- Người làm tự giải thích các dòng code mình thêm. Nếu dùng AI, vẫn phải chạy, hiểu input/output và sửa được lỗi.

- Reviewer khác người làm kiểm tra; review của intern là đọc cùng và thử lại, không giả định ai đã là senior.

- Checklist có trạng thái Hoàn tất, Review Đạt và link/đường dẫn bằng chứng. Reviewer đồng thời xác nhận dependency đã hoàn tất; TV1 quyết định merge.

- Không gắn deadline tùy tiện. Một task nhiều bước có thể chia nhiều PR nhỏ cùng mã SF; chưa đánh dấu xong khi còn bước thiếu.

### Mẫu báo tiến độ khi bị kẹt

Tôi đang làm SFxx, muốn nhận kết quả ... Tôi chạy lệnh ... và nhận lỗi ... Tôi đã thử ... Hiện cần hỗ trợ ... Gửi text lỗi và bước tái hiện, không chỉ ảnh màn hình trống. Sau khoảng 30–45 phút chưa tiến triển, báo reviewer; có thể xin ghép cặp sớm hơn.

M6 là nhóm việc tương lai, trạng thái mặc định Chưa mở. Không tạo tài nguyên trả phí, mua domain hoặc public bản DEBUG=True trong khi học skeleton.

## 8 Thao tác hằng ngày cho người mới

### Chạy local

Chỉ copy khi chưa có `.env`. Trên PowerShell:

```powershell
Copy-Item .env.example .env
```

Trên macOS Terminal:

```sh
cp .env.example .env
```

Sau đó chạy:

```sh
docker compose up --build
```

Lệnh up giữ terminal để xem log. Mở terminal thứ hai tại thư mục repository rồi chạy:

```sh
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py test
docker compose exec frontend npm run build
```

Mở http://localhost:5173; API mẫu http://localhost:8000/api/hello/. Dùng docker compose logs backend khi lỗi. docker compose down dừng container và giữ volume. Không dùng down -v để xử lý lỗi thông thường vì sẽ mất dữ liệu local.

### Khi thêm model

```sh
docker compose exec backend python manage.py makemigrations inventory
docker compose exec backend python manage.py migrate
```

Đọc migration trước PR. Commit cả model và migration. Không sửa/xóa migration người khác đã merge để né conflict; báo TV1 xử lý thứ tự.

### Git theo một task

```sh
git status
git switch main
git pull --ff-only
git switch -c feat/SF08-category
```

Thực hiện các lệnh này khi không còn thay đổi dở dang. Nếu đang sửa file, báo TV1 trước khi đổi branch.

Sau khi test: dùng git add với đúng file của task, git diff --cached để kiểm tra rồi git commit -m "feat: SF08 category list". Push branch khi team đã có remote GitHub. Pull request ghi mục tiêu, cách chạy, bằng chứng và điều chưa làm. Repo hiện có thay đổi chưa commit; TV1 cần chốt bản nền trước khi team tạo branch, không tự reset hoặc ghi đè file.

### Một vài lỗi thường gặp

| Dấu hiệu | Bước kiểm tra |
| --- | --- |
| Không có lệnh docker | Cài/mở Docker Desktop; đợi engine sẵn sàng; mở lại terminal. |
| Port đã được dùng | Xem log và chương trình đang dùng 5432/8000/5173; nhờ Lead hỗ trợ đổi port host nếu cần. |
| DB connection refused | docker compose ps và logs db; đợi healthy. Trong Docker DB_HOST là db. |
| POST 403 | Đọc response: quyền hay CSRF; lấy cookie mới và header đúng. Không thêm csrf_exempt. |
| Frontend không reload | Reload tay trước; báo hệ điều hành và thư mục mount, không tự cài thêm package. |
| Migration conflict | Dừng tạo migration tiếp; gửi tên file và branch cho Lead. |

## 9 Kiểm kê báo cáo và cách bàn giao

### Quy tắc kiểm kê

Server lưu expected_qty và expected_version khi mở phiên. Khi chốt, khóa food và so version. Có thay đổi thì trả 409, không tự thay snapshot; người dùng lập phiên mới. counted_qty chưa nhập khác 0: null bị chặn, 0 hợp lệ, âm bị chặn. variance = counted_qty − expected_qty. Nếu variance bằng 0, chỉ đóng phiếu, không tạo ledger hay tăng version.

Đơn giá điều chỉnh là avg_cost tại snapshot hợp lệ. Tồn về 0 vẫn giữ avg_cost cũ. Nếu một thực phẩm chưa có giá vốn (avg_cost=0) mà kiểm kê đếm ra số dương, không tự định giá 0; báo lỗi và yêu cầu ghi nhận nhập kho có giá trước khi kiểm kê lại. Đây là giới hạn MVP cần hiển thị rõ.

### Báo cáo cần trả lời câu hỏi gì

- Hiện còn bao nhiêu cho từng thực phẩm và đơn vị?

- Giá trị tồn hiện tại là bao nhiêu?

- Lượng đã tăng/giảm do phiếu nào, ngày nào, ai chốt?

- Kiểm kê lệch bao nhiêu và thay đổi tồn ra sao?

### TV1 điều hành buổi demo

Mỗi người 5–10 phút: mở task, chạy chức năng, giải thích đoạn code mình thêm và một lỗi đã kiểm tra. TV6 ghi kết quả vào Nghiem thu; TV1 kiểm tra dữ liệu mẫu và các lỗi chưa đóng. Không cần trình chiếu cầu kỳ. Nếu có lỗi, ghi đúng Chưa chạy/Không đạt; không sửa actual để đẹp tiến độ.

### Cách dùng ba file tài liệu

File 1 là hướng dẫn chung này. File 2 SchoolFood_HuongDan_Task.md chứa thẻ SF01–SF42; Ctrl+F mã task để tìm. File 3 SchoolFood_Checklist_6_ThanhVien.xlsx có Team, Cong viec, Nghiem thu. Sheet Team điền tên và xem tổng; Cong viec lọc theo TV; Nghiem thu ghi actual và bằng chứng. Ô vàng là phần cập nhật, cột được tính xong là công thức. Tỷ lệ theo số task không đại diện số giờ hoặc độ khó.

Bộ này thay hướng dẫn phân công cũ 5 người trong outputs/project-foundation-update. Giữ bản cũ để tham khảo, không dùng hai checklist song song. README hướng dẫn chạy, architecture.md ghi quyết định kỹ thuật, task_on_progress.md ghi trạng thái hiện tại; chỉ sửa đúng nơi khi có thay đổi.

### Nguồn kỹ thuật tra cứu khi cần

- [Django transactions](https://docs.djangoproject.com/en/5.2/topics/db/transactions/)
- [Django CSRF](https://docs.djangoproject.com/en/5.2/howto/csrf/)
- [Docker Compose](https://docs.docker.com/compose/gettingstarted/)

Các contract và phân công trong bộ tài liệu là thiết kế của team, chưa phải API đã triển khai.
