> Cập nhật 29/09/2026: SF01–SF42 bên dưới giữ làm thẻ công việc giai đoạn nền, không phải xác nhận trạng thái code hiện tại. Giai đoạn bữa trưa dùng SF43–SF72 ở cuối tài liệu và [kế hoạch G2](GiaiDoan2_KeHoach.md). Tiến độ xem Excel; hiện trạng code xem [README](../../README.md). Các mô tả tạo mới phải đối chiếu code trước khi thực hiện.

# SchoolFood hướng dẫn từng task

Tra theo mã SF trong checklist  |  TV1 leader và TV2 đến TV6

Không cần đọc cả tài liệu trước khi code. Đọc hướng dẫn chung và README trước, sau đó tìm mã task được giao. Chỉ bắt đầu khi dependency đã hoàn tất và mốc được TV1 mở. Mọi task bên dưới là việc team cần làm; tài liệu không tự tạo các tính năng này.

## Cách đọc một thẻ task

- File cần mở: đường dẫn tương đối từ repository. inventory/... nghĩa là backend/apps/inventory/...; các trang React nằm trong frontend/src/.

- File ghi “mới” chưa tồn tại trong skeleton. Chỉ tạo lúc task đó được mở; không scaffold trước cả danh sách.

- Ba bước: đi từ dữ liệu/contract đến xử lý, rồi kiểm tra. Nếu bước quá lớn, làm PR nhỏ cùng mã task.

- Điều kiện đạt và Kiểm tra: phải thực hiện được, không chỉ trả lời đã hiểu.

- Bằng chứng: link PR, ảnh/video và log test phù hợp. Không chụp secret, password hoặc dữ liệu cá nhân.

## Tìm nhanh việc của mình

| Thành viên | M0 đến M5 theo thứ tự | M6 làm sau |
| --- | --- | --- |
| TV1 | SF01, SF07, SF13, SF19, SF25, SF31 | SF37 |
| TV2 | SF02, SF08, SF14, SF20, SF26, SF32 | SF38 |
| TV3 | SF03, SF09, SF15, SF21, SF27, SF33 | SF39 |
| TV4 | SF04, SF10, SF16, SF22, SF28, SF34 | SF40 |
| TV5 | SF05, SF11, SF17, SF23, SF29, SF35 | SF41 |
| TV6 | SF06, SF12, SF18, SF24, SF30, SF36 | SF42 |

## Từ vựng kỹ thuật trước khi bắt đầu

API: URL trao đổi dữ liệu. JSON: dữ liệu key/value. Model: mô tả bảng. Migration: lịch sử thay đổi bảng. ORM: Python thao tác database. Component: phần giao diện React. State: dữ liệu đang hiển thị. PR: đề nghị ghép code để người khác review. Transaction: lưu cả nhóm thay đổi hoặc hoàn tác cả nhóm. Lock: giữ một hàng dữ liệu khi cập nhật để hai thao tác không dùng cùng số tồn cũ.

Lệnh test chung: docker compose exec backend python manage.py test. Lệnh build chung: docker compose exec frontend npm run build. Khi chưa hiểu một dòng, đặt breakpoint hoặc in giá trị local, theo input đến output rồi giải thích lại; không commit log chứa dữ liệu nhạy cảm.

## M0 Các task SF01 đến SF03

### SF01 Chốt cách làm và chạy khung trên máy leader

Người làm TV1 | Reviewer TV6 | Cần xong trước: Không

File cần mở: README.md; compose.yaml; plan_final.md

1. Điền tên TV1–TV6 vào Excel. Cùng team đọc phạm vi bản local và thống nhất mỗi người làm một task đang mở.

2. Chạy Compose, migrate, API mẫu và build theo README. Ghi lỗi nguyên văn nếu có.

3. Giải thích db, backend, frontend; hướng dẫn một thành viên khác mở trang mà không làm hộ họ.

Điều kiện đạt: Leader chạy được khung và xác nhận tên của đủ 6 người.

Kiểm tra: API mẫu 200; Django test và React build trên máy cá nhân.

Bằng chứng: Ảnh trang + kết quả lệnh + 3 câu giải thích của chính người làm.

### SF02 Đọc Django và PostgreSQL

Người làm TV2 | Reviewer TV4 | Cần xong trước: Không

File cần mở: backend/schoolfood/settings.py; backend/apps/inventory/views.py

1. Chạy khung trên máy mình. Đọc cấu hình DB_HOST và phân biệt localhost với tên service db.

2. Theo đường schoolfood/urls.py → inventory/urls.py → hello; giải thích SELECT 1 chỉ kiểm tra kết nối.

3. Đổi message tạm trên branch cá nhân để quan sát response rồi phục hồi trước PR.

Điều kiện đạt: Giải thích được URL, view, truy vấn và JSON; có bằng chứng chạy local.

Kiểm tra: API mẫu 200; Django test và React build trên máy cá nhân.

Bằng chứng: Ảnh trang + kết quả lệnh + 3 câu giải thích của chính người làm.

### SF03 Đọc React và vòng gọi API

Người làm TV3 | Reviewer TV5 | Cần xong trước: Không

File cần mở: frontend/src/main.tsx; App.tsx; vite.config.ts

1. Chạy local và đọc main.tsx trước App.tsx. Tìm nơi tạo state và nơi gọi fetch.

2. Mở DevTools Network, tìm /api/hello/ và đọc response; lần theo proxy tới backend.

3. Đổi một dòng chữ để kiểm tra reload rồi phục hồi. Viết lại luồng request bằng lời của mình.

Điều kiện đạt: Giải thích được state, useEffect, fetch và proxy; không nhầm React truy cập DB trực tiếp.

Kiểm tra: API mẫu 200; Django test và React build trên máy cá nhân.

Bằng chứng: Ảnh trang + kết quả lệnh + 3 câu giải thích của chính người làm.

## M0 Các task SF04 đến SF06

### SF04 Chạy test mẫu và đọc lỗi

Người làm TV4 | Reviewer TV2 | Cần xong trước: Không

File cần mở: backend/apps/inventory/tests.py

1. Chạy Docker, migrate và python manage.py test bằng Compose.

2. Đọc TestCase, request và assert. Đổi expected text tạm để quan sát một test fail rồi phục hồi.

3. Giải thích test dùng database test do Django tạo; không chạy lệnh test vào cloud hoặc DB dùng chung.

Điều kiện đạt: Có test pass và biết tìm expected/actual khi test fail.

Kiểm tra: API mẫu 200; Django test và React build trên máy cá nhân.

Bằng chứng: Ảnh trang + kết quả lệnh + 3 câu giải thích của chính người làm.

### SF05 Thử trạng thái lỗi của giao diện

Người làm TV5 | Reviewer TV3 | Cần xong trước: Không

File cần mở: frontend/src/App.tsx; styles.css

1. Mở trang local ở desktop và màn hình hẹp. Đọc CSS tương ứng từng phần.

2. Dừng backend bằng docker compose stop backend; reload và quan sát thông báo lỗi.

3. Chạy docker compose start backend, reload lại; ghi cách tái hiện và kết quả.

Điều kiện đạt: Biết phân biệt lỗi UI, API và database; bằng chứng gồm thành công và thất bại.

Kiểm tra: API mẫu 200; Django test và React build trên máy cá nhân.

Bằng chứng: Ảnh trang + kết quả lệnh + 3 câu giải thích của chính người làm.

### SF06 Xác minh onboarding trên máy thứ hai

Người làm TV6 | Reviewer TV1 | Cần xong trước: Không

File cần mở: README.md; checklist sheet Nghiem thu

1. Làm theo README từ đầu trên máy mình, không sao chép .env thật hoặc dữ liệu của người khác.

2. Chạy migrate, test, build; ghi hệ điều hành, lệnh và lỗi nếu có.

3. Đề xuất sửa hướng dẫn nếu có bước thiếu; tổng hợp bằng chứng M0 của đủ 6 người.

Điều kiện đạt: Một người khác có thể chạy theo hướng dẫn; không đánh dấu thay ai chưa chạy.

Kiểm tra: API mẫu 200; Django test và React build trên máy cá nhân.

Bằng chứng: Ảnh trang + kết quả lệnh + 3 câu giải thích của chính người làm.

## M1 Các task SF07 đến SF09

### SF07 Chốt Category và cách chia branch

Người làm TV1 | Reviewer TV6 | Cần xong trước: SF01, SF02, SF03, SF04, SF05, SF06

File cần mở: architecture.md; plan_final.md

1. Cùng TV2/TV3 đọc contract Category ở sổ tay chung; ghi id, code, name và response results.

2. Chỉ mở GET Category trong M1. Tạo dữ liệu học bằng Django shell, chưa thêm POST công khai.

3. Chốt ai sửa urls.py, App.tsx và models.py; merge lần lượt SF08 trước SF09/SF10.

Điều kiện đạt: Cả backend và frontend dùng một contract; cả 6 người đã qua M0.

Kiểm tra: TV3 đọc được ví dụ response mà không cần đoán field.

Bằng chứng: Ghi quyết định và link branch/PR theo feat/SFxx-ten-ngan.

### SF08 Model Category và API danh sách

Người làm TV2 | Reviewer TV4 | Cần xong trước: SF07

File cần mở: inventory/models.py (mới); migrations/ (sinh tự động); views.py; urls.py

1. Tạo Category với code duy nhất và name; dùng ORM thay SQL tự ghép.

2. Chạy makemigrations inventory, đọc file migration rồi migrate local; thêm 2 nhóm bằng shell.

3. Viết GET /api/categories/ trả results theo contract và sắp xếp id tăng dần.

Điều kiện đạt: Database giữ dữ liệu qua reload; GET trả đúng 2 nhóm hoặc mảng rỗng.

Kiểm tra: Chạy Django check; GET đúng; phương thức chưa hỗ trợ trả 405.

Bằng chứng: Migration + JSON GET + lời giải thích model khác migration thế nào.

### SF09 Trang danh sách Category

Người làm TV3 | Reviewer TV5 | Cần xong trước: SF08

File cần mở: frontend/src/CategoryPage.tsx (mới); App.tsx; styles.css

1. Tạo component nhỏ gọi /api/categories/ bằng fetch; khai báo type khớp response.

2. Hiển thị code, name và các trạng thái đang tải, rỗng, lỗi; App chỉ gắn component.

3. Dùng dữ liệu backend thật, reload kiểm tra; giữ trang đơn giản chưa thêm router hoặc UI library.

Điều kiện đạt: Trang hiển thị đúng dữ liệu PostgreSQL, kể cả rỗng và mất kết nối.

Kiểm tra: npm run build; thử dừng backend và tải lại trang.

Bằng chứng: Ảnh 3 trạng thái + request/response Network.

## M1 Các task SF10 đến SF12

### SF10 Test Category đọc và ràng buộc

Người làm TV4 | Reviewer TV2 | Cần xong trước: SF08

File cần mở: inventory/tests.py

1. Tạo dữ liệu riêng trong test, không phụ thuộc dữ liệu demo trên máy.

2. Test danh sách rỗng, hai Category đúng field, code trùng bị chặn ở DB.

3. Giữ test /api/hello/ đang có và chạy toàn bộ test bằng Django runner.

Điều kiện đạt: Test pass trên database test riêng; không sửa tay dữ liệu local để test pass.

Kiểm tra: python manage.py test; kiểm tra cả 0 và 2 bản ghi.

Bằng chứng: Tên test + log pass + giải thích vì sao cần unique code.

### SF11 Review giao diện Category

Người làm TV5 | Reviewer TV3 | Cần xong trước: SF09

File cần mở: CategoryPage.tsx; styles.css

1. Thử nhóm tên dài, danh sách rỗng, cửa sổ rộng 360 px và bàn phím Tab.

2. Ghi lỗi kèm bước tái hiện; sửa CSS hoặc thông báo trong PR nhỏ.

3. Đọc lại fetch của TV3; nhờ giải thích đoạn chưa hiểu trước khi review đạt.

Điều kiện đạt: Không mất chữ quan trọng, lỗi dễ hiểu, không phát sinh dependency mới.

Kiểm tra: Test tay desktop/mobile; build lại sau sửa.

Bằng chứng: Ảnh trước/sau và ghi chú review.

### SF12 Nghiệm thu lát cắt Category

Người làm TV6 | Reviewer TV1 | Cần xong trước: SF09, SF10, SF11

File cần mở: Checklist Nghiem thu; README.md nếu cần

1. Lấy code đã merge, chạy migrate trên máy mình và thêm nhóm mới bằng shell.

2. Mở UI, reload rồi kiểm tra lại; đối chiếu id/code/name với API.

3. Ghi actual và bằng chứng cho AC02; báo TV1 nếu còn lỗi để giữ M1 mở.

Điều kiện đạt: Lát cắt DB → API → React chạy trên máy thứ hai.

Kiểm tra: AC02 và test/build; TV1 duyệt chuyển mốc.

Bằng chứng: Video ngắn hoặc ảnh + phiên bản commit được kiểm tra.

## M2 Các task SF13 đến SF15

### SF13 Session đăng nhập và quyền API

Người làm TV1 | Reviewer TV6 | Cần xong trước: SF12

File cần mở: inventory/auth_views.py (mới); urls.py; settings.py

1. Dùng User/Group có sẵn của Django: manager và viewer. Tạo endpoint csrf, login, me, logout theo sổ tay.

2. Giữ CSRF middleware; login/logout chỉ POST. Dùng authenticate/login/logout; cấm log password.

3. Từ M2 bảo vệ mọi API nghiệp vụ: chưa login 401, viewer ghi 403. Bổ sung test CSRF thực bằng enforce_csrf_checks.

Điều kiện đạt: Manager đọc/ghi, viewer chỉ đọc; POST thiếu CSRF bị từ chối.

Kiểm tra: AC04; login sai, logout, viewer ghi; CSRF thiếu/đúng.

Bằng chứng: Request mẫu và log test quyền; demo cho cả team trước tích hợp.

Người làm TV2 | Reviewer TV4 | Cần xong trước: SF13

File cần mở: inventory/models.py; views.py; urls.py; migrations/

1. Thêm FoodItem và Supplier theo schema; tồn và giá mặc định 0, chỉ server sửa các field kho.

2. Thêm GET/POST/PATCH cho Category, FoodItem, Supplier; kiểm tra code trùng và dữ liệu thiếu.

3. Dùng is_active để ngừng sử dụng; không xóa bản ghi đã tham chiếu; test input Decimal và quyền.

Điều kiện đạt: CRUD tối thiểu gồm xem/tạo/sửa/ngừng dùng; API không nhận chỉnh tồn trực tiếp.

Kiểm tra: AC03, AC05; reject tồn do client gửi; code trùng không gây 500.

Bằng chứng: Schema/migration + JSON hợp lệ và lỗi validation.

### SF15 Giao diện đăng nhập và danh mục thực phẩm

Người làm TV3 | Reviewer TV5 | Cần xong trước: SF13, SF14

File cần mở: LoginPage.tsx; FoodPage.tsx (mới); CategoryPage.tsx; App.tsx

1. Gọi csrf trước login; gửi cookie và X-CSRFToken; sau login đọc lại token vì Django có thể đổi token.

2. Thêm form tạo/sửa/ngừng dùng Category rồi Food; chọn Category và đơn vị. Chuyển màn hình bằng state đơn giản.

3. Hiển thị lỗi cạnh field; khóa nút khi gửi, reload dữ liệu sau thành công; viewer không có nút ghi.

Điều kiện đạt: Đăng nhập thật; xem/tạo/sửa thực phẩm được; hết session quay về login.

Kiểm tra: Build; AC04 và AC05 qua UI; backend vẫn kiểm tra quyền dù ẩn nút.

Bằng chứng: Video login → tạo thực phẩm → reload; lỗi sai password.

## M2 Các task SF16 đến SF18

### SF16 Test quyền và validation danh mục

Người làm TV4 | Reviewer TV2 | Cần xong trước: SF13, SF14

File cần mở: inventory/tests.py

1. Tạo manager và viewer bằng test fixture trong setUp; không dùng tài khoản thật.

2. Test 401/403, CSRF, code trùng, code/name rỗng, category không tồn tại, field kho không được ghi.

3. Sau request lỗi, assert số bản ghi và tồn không đổi.

Điều kiện đạt: Test xác nhận cả response và trạng thái database khi lỗi.

Kiểm tra: AC03–AC05; test JSON hỏng và method không hỗ trợ.

Bằng chứng: Log test và danh sách case âm.

### SF17 Giao diện Supplier và lỗi dùng chung

Người làm TV5 | Reviewer TV3 | Cần xong trước: SF14, SF15

File cần mở: SupplierPage.tsx (mới); styles.css; App.tsx phối hợp TV3

1. Tạo danh sách/form Supplier với code, name, phone, is_active; kết nối API thật.

2. Dùng cùng cách lấy CSRF/login của TV3, chỉ tách helper nếu đã dùng ở hai chỗ.

3. Thử tên dài, mã trùng, thao tác viewer và gửi hai lần; nhờ TV3 review component.

Điều kiện đạt: Supplier tạo/sửa/ngừng dùng được; lỗi hiển thị rõ và nút không gửi lặp.

Kiểm tra: Build; AC05 cho Supplier; desktop và màn hình hẹp.

Bằng chứng: Ảnh form thành công và validation lỗi.

### SF18 Seed danh mục và nghiệm thu M2

Người làm TV6 | Reviewer TV1 | Cần xong trước: SF15, SF16, SF17

File cần mở: inventory/management/commands/seed_demo.py (mới); checklist

1. Tạo command local dùng get_or_create/update_or_create theo code cố định; chỉ seed danh mục.

2. Tài khoản demo tạo qua bước riêng, không hardcode password và không seed giao dịch kho lúc này.

3. Chạy seed hai lần rồi test login/catalog trên máy mình; số nhóm/mặt hàng không tăng gấp đôi.

Điều kiện đạt: Demo local lặp được; đủ tài khoản quyền; không nhân đôi danh mục.

Kiểm tra: AC04–AC06; test/build và xác nhận các field kho vẫn 0.

Bằng chứng: Log chạy seed 2 lần + số bản ghi + bảng nghiệm thu M2.

## M3 Các task SF19 đến SF21

### SF19 Chốt model phiếu nhập và sổ kho

Người làm TV1 | Reviewer TV6 | Cần xong trước: SF18

File cần mở: inventory/models.py; migrations/; architecture.md

1. Thêm Receipt/ReceiptLine và StockTransaction theo sổ tay; FoodItem có stock_version.

2. Phiếu draft chưa tác động kho; posted chỉ đọc. created_by lấy từ session, không từ JSON.

3. TV2 và TV4 thống nhất tên hàm post_receipt(receipt_id, user); duyệt migration trước các PR tiếp theo.

Điều kiện đạt: Mô hình hỗ trợ nhiều dòng và không cho lặp cùng food trong một phiếu.

Kiểm tra: Draft tạo được không đổi tồn; line unique theo receipt/food.

Bằng chứng: Migration + một ví dụ draft/posted + contract đã chốt.

### SF20 Nghiệp vụ chốt nhập và giá bình quân

Người làm TV2 | Reviewer TV4 | Cần xong trước: SF19

File cần mở: inventory/services.py (mới); tests.py

1. Viết post_receipt trong transaction.atomic; khóa phiếu và FoodItem theo id tăng dần.

2. Kiểm tra draft, thực phẩm active, quantity > 0, unit_price > 0; dùng Decimal tính bình quân.

3. Cập nhật quantity, avg_cost, tăng stock_version; tạo ledger từng dòng, chuyển posted cùng transaction.

Điều kiện đạt: Chốt một lần duy nhất; lỗi bất kỳ dòng nào rollback cả phiếu.

Kiểm tra: 50 × 90000 rồi 50 × 110000 cho tồn 100 và avg 100000.

Bằng chứng: Test công thức + test rollback + giải thích từng bước transaction.

### SF21 Giao diện phiếu nhập

Người làm TV3 | Reviewer TV5 | Cần xong trước: SF22

File cần mở: ReceiptPage.tsx (mới); App.tsx

1. Form chọn Supplier, ngày và nhiều dòng food/quantity/unit_price; cấm food trùng trong UI.

2. Tạo draft, hiển thị bản đã lưu và nút Chốt có xác nhận. Sau chốt khóa form và reload tồn.

3. Lỗi mạng lúc chốt: đọc lại chi tiết phiếu để biết trạng thái; không tự tạo lại phiếu mới.

Điều kiện đạt: Người dùng phân biệt Lưu nháp và Chốt; total do server trả.

Kiểm tra: AC07–AC10 qua UI; nút đang gửi và posted bị khóa.

Bằng chứng: Video nhập 2 lần với kết quả tồn và giá.

## M3 Các task SF22 đến SF24

### SF22 API tạo nháp xem và chốt nhập

Người làm TV4 | Reviewer TV2 | Cần xong trước: SF19, SF20

File cần mở: inventory/views.py; urls.py; tests.py

1. Thêm GET/POST receipts, GET receipts/id và POST receipts/id/post theo contract.

2. Validate JSON và quyền trước; endpoint chốt gọi service, không tự tính lại bình quân.

3. Trả 409 khi posted lần hai; lỗi field 400; draft tạo xong trả id để UI dùng tiếp.

Điều kiện đạt: API phân biệt draft/posted và error rõ; không có sửa/xóa posted.

Kiểm tra: AC07, AC09, AC10; kiểm tra response không lộ traceback.

Bằng chứng: Ví dụ JSON request/response và log API test.

### SF23 Kiểm thử nhập kho và rollback

Người làm TV5 | Reviewer TV3 | Cần xong trước: SF20, SF22

File cần mở: inventory/tests.py phối hợp TV4

1. Tạo test độc lập: kho rỗng, hai giá nhập, lượng lẻ 0.125, giá hoặc lượng không hợp lệ.

2. Tạo phiếu 2 dòng có 1 dòng lỗi: xác nhận không có tồn hay ledger bị ghi dở.

3. Chốt cùng phiếu hai lần: lần hai 409, ledger chỉ một bộ; đối chiếu bằng Decimal.

Điều kiện đạt: AC08–AC10 có test tự động; không chỉ kiểm tra status 200.

Kiểm tra: python manage.py test; tồn và ledger trước/sau phải được assert.

Bằng chứng: Log pass và ảnh kiểm tra lỗi UI nếu phát hiện.

### SF24 Nghiệm thu nhập kho với dữ liệu chuẩn

Người làm TV6 | Reviewer TV1 | Cần xong trước: SF21, SF23

File cần mở: Checklist Nghiem thu

1. Trên DB local thử mới, tạo Gạo KG; nhập 50 giá 90000 rồi 50 giá 110000.

2. Đối chiếu UI, GET food và ledger: tồn 100, avg 100000, hai giao dịch IN.

3. Lưu số phiếu để dùng M4; ghi actual vào AC07–AC10 và demo cho TV1.

Điều kiện đạt: M3 chạy từ UI đến DB trên máy thứ hai; số liệu khớp bộ mẫu.

Kiểm tra: Chạy toàn bộ test/build trước nghiệm thu.

Bằng chứng: Mã phiếu + ảnh số liệu + commit được kiểm tra.

## M4 Các task SF25 đến SF27

### SF25 Chốt model và contract phiếu xuất

Người làm TV1 | Reviewer TV6 | Cần xong trước: SF24

File cần mở: inventory/models.py; migrations/

1. Thêm StockIssue/StockIssueLine: draft/posted, date, note, created_by, quantity.

2. Đơn giá xuất do backend chụp từ avg_cost khi chốt; client không gửi giá vốn.

3. Thống nhất post_issue(issue_id, user) và rule lỗi vượt tồn; review model với TV2/TV4.

Điều kiện đạt: Xuất có chứng từ và tham chiếu ledger; dùng cùng quy tắc bất biến như nhập.

Kiểm tra: Draft xuất chưa đổi tồn; client không sửa cost.

Bằng chứng: Migration và payload đã thống nhất.

### SF26 Nghiệp vụ chốt xuất chống âm kho

Người làm TV2 | Reviewer TV4 | Cần xong trước: SF25

File cần mở: inventory/services.py; tests.py

1. Trong atomic khóa issue và các FoodItem theo cùng thứ tự id với nhập kho.

2. So quantity yêu cầu với tồn vừa khóa; thiếu bất kỳ dòng nào thì từ chối toàn phiếu.

3. Ghi giá vốn snapshot, giảm tồn, tăng version, ghi ledger OUT; giữ avg_cost kể cả tồn về 0.

Điều kiện đạt: Không âm kho; giá xuất dùng giá tại lúc chốt; không ghi dở phiếu.

Kiểm tra: Tồn 100 avg 100000, xuất 20 → tồn 80, trị giá 2000000.

Bằng chứng: Test đủ tồn/thiếu tồn + giải thích khóa hàng dùng để làm gì.

### SF27 Giao diện xuất kho

Người làm TV3 | Reviewer TV5 | Cần xong trước: SF28

File cần mở: IssuePage.tsx (mới); App.tsx

1. Tạo phiếu xuất nháp, chọn food và quantity; hiển thị tồn để người dùng tham khảo.

2. Chốt với xác nhận; nếu server báo thiếu tồn, reload tồn và giữ thông báo rõ.

3. Chi tiết posted chỉ đọc; không cho nhập đơn giá xuất từ frontend.

Điều kiện đạt: UI đi hết luồng draft → posted và phản ánh tồn mới.

Kiểm tra: AC11–AC13; tồn hiển thị cũ vẫn được server kiểm tra lại.

Bằng chứng: Video xuất 20 và thử vượt tồn.

## M4 Các task SF28 đến SF30

### SF28 API phiếu xuất

Người làm TV4 | Reviewer TV2 | Cần xong trước: SF25, SF26

File cần mở: inventory/views.py; urls.py; tests.py

1. Thêm GET/POST issues, GET issues/id, POST issues/id/post.

2. View chỉ nhận request/validate/gọi service/trả JSON; total dùng quantity × snapshot unit_cost.

3. Kiểm tra quyền, food không tồn tại, quantity âm/0, posted lặp và lỗi thiếu tồn 409.

Điều kiện đạt: API đúng contract và không thay tồn khi lỗi.

Kiểm tra: AC11–AC13; response thiếu tồn kèm tên food và lượng còn.

Bằng chứng: JSON thành công/thất bại + test API.

### SF29 Test xuất đồng thời và trường hợp biên

Người làm TV5 | Reviewer TV3 | Cần xong trước: SF26, SF28

File cần mở: inventory/tests.py hoặc test_stock.py (mới khi file quá dài)

1. Test xuất hết tồn, vượt tồn, nhiều dòng rollback và posted lặp.

2. Cùng TV4 dùng TransactionTestCase với hai kết nối PostgreSQL: tồn 10, hai phiếu cùng xuất 8.

3. Xác nhận chỉ một phiếu thành công; tồn 2, chỉ một ledger OUT; tách test này khỏi TestCase thường.

Điều kiện đạt: Không có âm kho khi hai người chốt đồng thời.

Kiểm tra: AC12–AC14 trên PostgreSQL; không thay bằng SQLite.

Bằng chứng: Log test concurrent + tồn/ledger cuối.

### SF30 Nghiệm thu luồng nhập rồi xuất

Người làm TV6 | Reviewer TV1 | Cần xong trước: SF27, SF29

File cần mở: Checklist Nghiem thu

1. Tiếp bộ mẫu M3: xuất 20 từ 100; xác nhận tồn 80 và trị giá xuất 2000000.

2. Thử xuất 81: lỗi, tồn 80 và số ledger không đổi.

3. Ghi AC11–AC14; tổng hợp lỗi còn mở để TV1 quyết định chuyển M5.

Điều kiện đạt: Nhập và xuất dùng cùng số liệu và đều chạy từ UI.

Kiểm tra: Test/build; viewer không chốt được cả hai loại phiếu.

Bằng chứng: Ảnh tồn 80 + response lỗi + lịch sử ba giao dịch.

## M5 Các task SF31 đến SF33

### SF31 Chốt kiểm kê và tiêu chí hoàn tất local

Người làm TV1 | Reviewer TV6 | Cần xong trước: SF30

File cần mở: inventory/models.py; migrations/; architecture.md

1. Thêm Stocktake/StocktakeLine: snapshot quantity, stock_version, counted_qty; draft/posted.

2. Chốt rule: version đã thay đổi kể từ snapshot thì trả 409, lập lại kiểm kê; không ghi đè tồn mới.

3. Chốt form và báo cáo tồn/ledger cùng TV2–TV5. Bản local không có xóa hoặc hủy posted.

Điều kiện đạt: Dữ liệu đủ phát hiện kiểm kê cũ; cả team hiểu chênh lệch không đồng nghĩa gian lận.

Kiểm tra: Review schema và tình huống nhập hàng sau khi mở kiểm kê.

Bằng chứng: Migration + rule snapshot và danh sách test kết thúc.

### SF32 Service và API kiểm kê

Người làm TV2 | Reviewer TV4 | Cần xong trước: SF31

File cần mở: inventory/services.py; views.py; urls.py; tests.py

1. POST stocktakes lấy snapshot cho food được chọn; PATCH draft chỉ nhận counted_qty không âm.

2. POST post khóa phiếu/food; kiểm tra version, số đếm đủ, cost hợp lệ rồi ghi variance và ADJUST.

3. Tồn mới bằng số đếm, avg giữ nguyên; tăng version, posted atomic; thêm test chốt lặp và snapshot cũ.

Điều kiện đạt: Tồn 80 đếm 77 cho -3, tồn cuối 77; snapshot cũ bị từ chối.

Kiểm tra: AC15–AC17; chênh lệch 0 không tạo ledger; test lỗi giữa nhiều dòng.

Bằng chứng: Test service/API + response 409 khi dữ liệu thay đổi.

### SF33 Trang báo cáo tồn và lịch sử

Người làm TV3 | Reviewer TV5 | Cần xong trước: SF34

File cần mở: ReportPage.tsx (mới); App.tsx

1. Hiển thị food, đơn vị, quantity, avg_cost, stock_value từ GET reports/stock.

2. Thêm bộ lọc food và from/to cho ledger; hiển thị loại, quantity_delta và mã chứng từ.

3. Dùng kết quả tiền do backend tính; phân biệt không dữ liệu với lỗi; viewer xem được.

Điều kiện đạt: Báo cáo khớp kho, lọc đúng ngày và truy vết chứng từ.

Kiểm tra: AC18; bộ mẫu cuối có 77 kg, avg 100000 và giá trị 7700000.

Bằng chứng: Ảnh report và response bộ lọc.

## M5 Các task SF34 đến SF36

### SF34 API báo cáo tồn và sổ giao dịch

Người làm TV4 | Reviewer TV2 | Cần xong trước: SF31

File cần mở: inventory/views.py; urls.py; tests.py

1. GET reports/stock đọc FoodItem; stock_value tính Decimal quantity × avg_cost.

2. GET reports/transactions lọc food và from/to theo ngày chứng từ, hai đầu bao gồm; sort id tăng dần.

3. Test lọc rỗng/sai ngày và viewer; không ghi lại dữ liệu khi GET báo cáo.

Điều kiện đạt: Báo cáo chỉ đọc, số lượng khớp tổng quantity_delta; tiền theo rule làm tròn.

Kiểm tra: AC18; không tính các phiếu draft vào giao dịch kho.

Bằng chứng: Response reports + test bộ lọc.

### SF35 Giao diện kiểm kê

Người làm TV5 | Reviewer TV3 | Cần xong trước: SF32

File cần mở: StocktakePage.tsx (mới); App.tsx

1. Chọn thực phẩm để mở snapshot; hiển thị tồn hệ thống, ô thực tế và chênh lệch.

2. Lưu số đếm bằng PATCH, chốt với xác nhận; trường hợp 409 hướng dẫn lập phiên mới.

3. Khóa màn hình posted; thử actual 0, số lẻ, số âm, bỏ trống và chốt hai lần.

Điều kiện đạt: Phân biệt chưa nhập với 0; kiểm kê cũ không thể ghi đè tồn.

Kiểm tra: AC15–AC17 qua UI; build và thao tác bàn phím.

Bằng chứng: Video đếm 77 từ 80 và thông báo snapshot cũ.

### SF36 Nghiệm thu toàn bộ MVP local

Người làm TV6 | Reviewer TV1 | Cần xong trước: SF32, SF33, SF34, SF35

File cần mở: Checklist Nghiem thu; plan_final.md

1. Chạy trọn bộ dữ liệu mẫu từ đầu trên local: catalog → nhập → xuất → kiểm kê → báo cáo.

2. Điền actual/evidence cho AC01–AC20; kiểm tra vai trò, lỗi mạng và dữ liệu tồn tại sau restart.

3. Mỗi người demo phần mình; TV1 chỉ đóng M5 khi không còn case bắt buộc lỗi hoặc chưa chạy.

Điều kiện đạt: MVP local đủ bằng chứng; không đánh dấu xong chỉ dựa vào build pass.

Kiểm tra: Tất cả case local đạt; Django test và frontend build.

Bằng chứng: Bảng actual, link bằng chứng và danh sách lỗi còn lại nếu có.

## M6 Các task SF37 đến SF39

### SF37 Chốt ngân sách và thiết kế deploy

Người làm TV1 | Reviewer TV6 | Cần xong trước: SF36

File cần mở: architecture.md; cấu hình deploy chỉ tạo khi mở M6

1. Xác nhận người sở hữu domain, ngân sách hosting/database và quyền tài khoản với chủ dự án.

2. Chọn dịch vụ; Render/Neon là phương án tham khảo, chưa phải tài nguyên đã tạo.

3. Lập cấu hình production: secret môi trường, DEBUG=False, allowed hosts, HTTPS, static và server production.

Điều kiện đạt: Có quyết định chi phí và kế hoạch deploy được chủ dự án chấp thuận.

Kiểm tra: Không mở M6 hoặc mua dịch vụ trước khi được xác nhận.

Bằng chứng: Quyết định cấu hình và chi phí; không đưa secret vào Excel.

### SF38 Database staging và backup thử

Người làm TV2 | Reviewer TV4 | Cần xong trước: SF37

File cần mở: migration hiện có; ghi chú kết nối bảo mật

1. Tạo DB staging riêng sau khi TV1 chọn dịch vụ; dùng secret môi trường, không commit URL.

2. Chạy migration đã review; không trỏ test runner vào production.

3. Backup và restore thử vào DB thử khác; xác nhận dữ liệu mẫu phục hồi đúng.

Điều kiện đạt: Staging riêng, migration và phục hồi dữ liệu được kiểm tra.

Kiểm tra: AC22 trên dữ liệu thử; không drop hoặc reset production.

Bằng chứng: Kết quả restore và số bản ghi, đã che connection string.

### SF39 Build giao diện cho môi trường deploy

Người làm TV3 | Reviewer TV5 | Cần xong trước: SF37

File cần mở: frontend build; cấu hình static do TV1 duyệt

1. Build React, xác nhận /api dùng cùng origin với web đã deploy.

2. Phối hợp TV1 cấu hình Django phục vụ static hoặc phương án hosting được chọn.

3. Thử refresh trang, login/logout và lỗi API trên staging; không dùng Vite dev server public.

Điều kiện đạt: Bản build staging hiển thị và gọi API đúng.

Kiểm tra: AC21; không còn URL localhost trong bundle dùng cho deploy.

Bằng chứng: URL staging + ảnh Network đã che dữ liệu nhạy cảm.

## M6 Các task SF40 đến SF42

### SF40 Kiểm tra cấu hình production

Người làm TV4 | Reviewer TV2 | Cần xong trước: SF37, SF38

File cần mở: settings.py; Dockerfile production khi được tạo

1. Cùng TV1 kiểm tra DEBUG=False, secret riêng, HTTPS, cookie secure và CSRF origin chính xác.

2. Chạy Django check --deploy; xử lý từng warning theo môi trường, không tắt bảo vệ để hết lỗi.

3. Test viewer ghi, chưa login, CSRF và thông báo lỗi không lộ traceback trên staging.

Điều kiện đạt: Thiết lập production được kiểm tra độc lập trước public.

Kiểm tra: AC21; ghi rõ warning nào còn và lý do.

Bằng chứng: Checklist security thực tế + kết quả test, không chứa secret.

### SF41 Kiểm tra tên miền và giao diện public

Người làm TV5 | Reviewer TV3 | Cần xong trước: SF39, SF40

File cần mở: DNS/hosting do chủ tài khoản thao tác hoặc cấp quyền

1. Dùng domain được TV1 chốt; ghi đúng DNS provider và bản ghi hosting yêu cầu.

2. Sau xác minh, test HTTPS, đăng nhập, màn hình hẹp và gọi API qua domain thật.

3. Không tự đổi tên miền đang dùng cho hệ thống khác; ghi ảnh và lỗi còn mở.

Điều kiện đạt: Domain thật phục vụ đúng ứng dụng và HTTPS hợp lệ.

Kiểm tra: AC21 trên domain; chỉ dùng dữ liệu demo để thử.

Bằng chứng: URL domain + ảnh kiểm tra chứng chỉ và chức năng.

### SF42 Bàn giao bản deploy và diễn tập khôi phục

Người làm TV6 | Reviewer TV1 | Cần xong trước: SF38, SF41

File cần mở: README.md phần deploy khi mở M6; checklist

1. Ghi người sở hữu tài khoản, cách xem log, migration, backup, restore và phiên bản đang chạy.

2. Chạy smoke test toàn luồng qua domain bằng dữ liệu demo; xác nhận backup có thể phục hồi.

3. Tập rollback bản ứng dụng trên staging, lưu ý rollback code không tự đảo migration; TV1 ký nhận.

Điều kiện đạt: Có người vận hành và hướng dẫn khôi phục; domain/DB không lệ thuộc tài khoản cá nhân mất quyền.

Kiểm tra: AC21–AC22 và smoke toàn luồng; TV1 xác nhận bàn giao.

Bằng chứng: Biên bản demo, phiên bản, vị trí backup bảo mật; không password.

## Giai đoạn 2 — SF43–SF72

Quy tắc chung: đọc CLAUDE.md và plan_final.md, trình kế hoạch và được duyệt trước sửa. Mọi task mới chưa nghiệm thu. Điều kiện G2.0 áp dụng G2.3–5. JSON mẫu giúp FE làm song song nhưng nghiệm thu phải qua API thật.

### SF43 Chốt dữ liệu lớp và suất trưa

Mốc G2.1 | Người làm TV1 | Reviewer TV6 | Cần xong trước: kế hoạch G2 được duyệt.

Phạm vi file: `architecture.md; backend/apps/inventory/models.py; migrations mới`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Model lớp, ngày ăn, suất dự kiến/thực tế; unique(lớp, ngày); lịch sử chốt và phiên bản.
- [ ] Tự kiểm tra: Lớp 30 học sinh: chặn -1 và 31 suất; null khác 0; đổi sĩ số không sửa ngày đã chốt.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Lớp 30 học sinh: chặn -1 và 31 suất; null khác 0; đổi sĩ số không sửa ngày đã chốt.

### SF44 API lớp học

Mốc G2.1 | Người làm TV2 | Reviewer TV4 | Cần xong trước: SF43.

Phạm vi file: `backend/apps/inventory/class_views.py (mới); urls.py`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Tạo, sửa, ngừng dùng lớp; sĩ số nguyên không âm; bảo vệ lớp đã có lịch sử.
- [ ] Tự kiểm tra: Manager tạo/sửa được; viewer chỉ đọc; mã trùng bị từ chối; lớp ngừng dùng vẫn còn lịch sử.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Manager tạo/sửa được; viewer chỉ đọc; mã trùng bị từ chối; lớp ngừng dùng vẫn còn lịch sử.

### SF45 Giao diện lớp học

Mốc G2.1 | Người làm TV3 | Reviewer TV5 | Cần xong trước: SF44.

Phạm vi file: `frontend/src/ClassPage.tsx (mới); App.tsx`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Danh sách, tạo/sửa lớp và ngừng dùng; tải/rỗng/lỗi; nối API thật.
- [ ] Tự kiểm tra: Tạo lớp, reload vẫn còn; viewer không có thao tác ghi; lỗi API hiện đúng trường.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Tạo lớp, reload vẫn còn; viewer không có thao tác ghi; lỗi API hiện đúng trường.

### SF46 API suất ăn theo ngày

Mốc G2.1 | Người làm TV4 | Reviewer TV2 | Cần xong trước: SF43, SF44.

Phạm vi file: `backend/apps/inventory/meal_views.py; meal_services.py (mới); urls.py`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Nhập dự kiến/thực tế; chốt và mở lại có lý do; lưu sĩ số tại thời điểm chốt; suất nhân viên riêng.
- [ ] Tự kiểm tra: Lớp thiếu dữ liệu chặn chốt; không ghi trùng lớp/ngày; cập nhật phiên bản cũ trả 409.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Lớp thiếu dữ liệu chặn chốt; không ghi trùng lớp/ngày; cập nhật phiên bản cũ trả 409.

### SF47 Bảng nhập suất toàn trường

Mốc G2.1 | Người làm TV5 | Reviewer TV3 | Cần xong trước: SF45, SF46.

Phạm vi file: `frontend/src/MealCountPage.tsx (mới); App.tsx phối hợp TV3`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Chọn ngày, nhập từng lớp và suất nhân viên; tổng hợp; chốt/mở lại; cảnh báo còn thiếu.
- [ ] Tự kiểm tra: 30 + 28 + 5 = 63; lớp thứ ba chưa nhập phải báo thiếu; nhập 0 có ý nghĩa nghỉ ăn.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: 30 + 28 + 5 = 63; lớp thứ ba chưa nhập phải báo thiếu; nhập 0 có ý nghĩa nghỉ ăn.

### SF48 Nghiệm thu lớp và suất

Mốc G2.1 | Người làm TV6 | Reviewer TV1 | Cần xong trước: SF45, SF46, SF47.

Phạm vi file: `backend/apps/inventory/test_meals.py (mới); outputs/team-6/evidence/`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Fixture nhiều lớp và kiểm thử toàn luồng, quyền, cập nhật đồng thời; ghi actual và bằng chứng.
- [ ] Tự kiểm tra: AC23–AC27 đạt trên máy thứ hai; không tự đánh dấu reviewer của task khác.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: AC23–AC27 đạt trên máy thứ hai; không tự đánh dấu reviewer của task khác.

### SF49 Chốt model món và thực đơn

Mốc G2.2 | Người làm TV1 | Reviewer TV6 | Cần xong trước: SF48.

Phạm vi file: `architecture.md; models.py; migrations mới`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Dish, RecipeLine, LunchPlan và bản chụp định lượng khi chốt; một bữa trưa/ngày.
- [ ] Tự kiểm tra: Cùng food không lặp trong một công thức; dữ liệu lịch sử độc lập công thức hiện hành.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Cùng food không lặp trong một công thức; dữ liệu lịch sử độc lập công thức hiện hành.

### SF50 API món và công thức

Mốc G2.2 | Người làm TV2 | Reviewer TV4 | Cần xong trước: SF49.

Phạm vi file: `backend/apps/inventory/recipe_services.py; recipe_views.py (mới); urls.py`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Định lượng trước sơ chế cho một suất; Decimal; đơn vị chuẩn kg/l/cái và quy đổi g/ml.
- [ ] Tự kiểm tra: 60 g thành 0.060 kg; chặn số âm, NaN, đơn vị sai và kg sang lít không có quy tắc.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: 60 g thành 0.060 kg; chặn số âm, NaN, đơn vị sai và kg sang lít không có quy tắc.

### SF51 Giao diện công thức món

Mốc G2.2 | Người làm TV3 | Reviewer TV5 | Cần xong trước: SF50.

Phạm vi file: `frontend/src/RecipePage.tsx (mới); App.tsx`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Chọn food, đơn vị, định lượng; thêm/xóa dòng; giữ ít nhất một dòng hợp lệ khi lưu.
- [ ] Tự kiểm tra: Hai dòng trùng food bị báo lỗi; gửi sai dữ liệu không mất toàn bộ phần đang nhập.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Hai dòng trùng food bị báo lỗi; gửi sai dữ liệu không mất toàn bộ phần đang nhập.

### SF52 API thực đơn trưa

Mốc G2.2 | Người làm TV4 | Reviewer TV2 | Cần xong trước: SF49, SF50.

Phạm vi file: `backend/apps/inventory/menu_services.py; menu_views.py (mới); urls.py`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Lập, sao chép, chốt và tạo phiên bản điều chỉnh; ngày nghỉ; chỉ chốt món có công thức.
- [ ] Tự kiểm tra: Sửa công thức sau chốt không đổi lượng cũ; sao chép tạo nháp độc lập; không chốt ngày thiếu món.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Sửa công thức sau chốt không đổi lượng cũ; sao chép tạo nháp độc lập; không chốt ngày thiếu món.

### SF53 Giao diện thực đơn tuần

Mốc G2.2 | Người làm TV5 | Reviewer TV3 | Cần xong trước: SF51, SF52.

Phạm vi file: `frontend/src/MenuPage.tsx (mới); App.tsx phối hợp TV3`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Lịch tuần, chọn món theo ngày, sao chép và chốt; phân biệt nghỉ ăn/chưa lập.
- [ ] Tự kiểm tra: Ngày có thực đơn và ngày nghỉ hiển thị riêng; xem được phiên bản đã chốt.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Ngày có thực đơn và ngày nghỉ hiển thị riêng; xem được phiên bản đã chốt.

### SF54 Nghiệm thu món và thực đơn

Mốc G2.2 | Người làm TV6 | Reviewer TV1 | Cần xong trước: SF51, SF52, SF53.

Phạm vi file: `backend/apps/inventory/test_menus.py (mới); evidence/`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Kiểm tra công thức, đơn vị, lịch sử; fixture thịt kho 60 g và canh 10 g.
- [ ] Tự kiểm tra: AC28–AC32 đạt; tổng thịt của hai món là 70 g/suất, không phải hai nhu cầu mua riêng.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: AC28–AC32 đạt; tổng thịt của hai món là 70 g/suất, không phải hai nhu cầu mua riêng.

### SF55 Chốt nhu cầu và phân bổ tồn

Mốc G2.3 | Người làm TV1 | Reviewer TV6 | Cần xong trước: SF54.

Phạm vi file: `architecture.md; models.py; migrations mới`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Quy tắc nhu cầu, dự phòng, phiên bản, giữ hàng, giải phóng; điều kiện G2.0 trước tích hợp kho.
- [ ] Tự kiểm tra: Ví dụ 300 × 0.070 + 1 - 5 - 4 = 13 kg; chốt luồng nhận hàng không tính đôi.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Ví dụ 300 × 0.070 + 1 - 5 - 4 = 13 kg; chốt luồng nhận hàng không tính đôi.

### SF56 Bộ tính nguyên liệu

Mốc G2.3 | Người làm TV2 | Reviewer TV4 | Cần xong trước: SF55.

Phạm vi file: `backend/apps/inventory/demand_services.py (mới)`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Cộng nguyên liệu qua món; tính theo suất dự kiến/thực tế; quy đổi rồi cộng rồi làm tròn.
- [ ] Tự kiểm tra: Kết quả Decimal tái lập được; trả phần đóng góp từng món; 0 suất không chia cho 0.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Kết quả Decimal tái lập được; trả phần đóng góp từng món; 0 suất không chia cho 0.

### SF57 Màn hình nhu cầu

Mốc G2.3 | Người làm TV3 | Reviewer TV5 | Cần xong trước: SF56.

Phạm vi file: `frontend/src/DemandPage.tsx (mới); App.tsx`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Hiện phép tính, nguồn định lượng, phiên bản thực đơn và số suất; UI mock theo contract rồi nối SF58.
- [ ] Tự kiểm tra: Hiện 21 kg từ 300 suất; bản mock chưa được tính nghiệm thu khi API thật chưa nối.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Hiện 21 kg từ 300 suất; bản mock chưa được tính nghiệm thu khi API thật chưa nối.

### SF58 API đề xuất mua và giữ hàng

Mốc G2.3 | Người làm TV4 | Reviewer TV2 | Cần xong trước: SF55, SF56.

Phạm vi file: `backend/apps/inventory/demand_views.py; allocation_services.py (mới); urls.py`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Phân bổ tồn/hàng đang đặt; duyệt atomic, kiểm tra version; phát hiện thiếu hụt khi tồn thay đổi.
- [ ] Tự kiểm tra: Hai kế hoạch không giữ cùng một kg; tồn không giảm khi giữ; dữ liệu cũ trả 409.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Hai kế hoạch không giữ cùng một kg; tồn không giảm khi giữ; dữ liệu cũ trả 409.

### SF59 Điều chỉnh và chênh lệch đề xuất

Mốc G2.3 | Người làm TV5 | Reviewer TV3 | Cần xong trước: SF57, SF58.

Phạm vi file: `frontend/src/DemandPage.tsx phối hợp TV3; styles.css`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Dự phòng có lý do, tính lại và so chênh lệch; giải thích thiếu, lỗi và dữ liệu cũ.
- [ ] Tự kiểm tra: Đổi 300 thành 280 suất hiện chênh lệch; đề xuất mua tối thiểu bằng 0.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Đổi 300 thành 280 suất hiện chênh lệch; đề xuất mua tối thiểu bằng 0.

### SF60 Nghiệm thu nhu cầu và chống trùng

Mốc G2.3 | Người làm TV6 | Reviewer TV1 | Cần xong trước: SF57, SF58, SF59.

Phạm vi file: `backend/apps/inventory/test_demand.py (mới); evidence/`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Kiểm thử nhiều ngày tranh tồn, giao hàng muộn, huỷ phân bổ, tính lại và request đồng thời.
- [ ] Tự kiểm tra: AC33–AC37 đạt; nghiệm thu bổ sung nguồn đơn thật cùng SF66, không coi mock là tích hợp.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: AC33–AC37 đạt; nghiệm thu bổ sung nguồn đơn thật cùng SF66, không coi mock là tích hợp.

### SF61 Chốt model và trạng thái đơn đặt

Mốc G2.4 | Người làm TV1 | Reviewer TV6 | Cần xong trước: SF60.

Phạm vi file: `architecture.md; models.py; migrations mới`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] PurchaseOrder/Line và liên kết kế hoạch, nguồn dòng nhập; trạng thái và điều chỉnh sau gửi.
- [ ] Tự kiểm tra: Nháp → duyệt → xác nhận gửi → nhận một phần → hoàn tất; hủy/đóng thiếu có lý do.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Nháp → duyệt → xác nhận gửi → nhận một phần → hoàn tất; hủy/đóng thiếu có lý do.

### SF62 Nghiệp vụ đặt hàng

Mốc G2.4 | Người làm TV2 | Reviewer TV4 | Cần xong trước: SF61.

Phạm vi file: `backend/apps/inventory/purchase_services.py (mới)`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Tạo từ phần thiếu; nhà cung cấp; kiểm tra lại khi duyệt; giải phóng phần hủy; chống request lặp.
- [ ] Tự kiểm tra: Hai lần duyệt cùng nhu cầu không sinh hai đơn có hiệu lực; không nhận vượt lượng còn lại.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Hai lần duyệt cùng nhu cầu không sinh hai đơn có hiệu lực; không nhận vượt lượng còn lại.

### SF63 Giao diện đơn đặt

Mốc G2.4 | Người làm TV3 | Reviewer TV5 | Cần xong trước: SF62.

Phạm vi file: `frontend/src/PurchaseOrderPage.tsx (mới); App.tsx`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Danh sách/chi tiết, chọn nhà cung cấp, lượng và giá dự kiến; duyệt, in, xác nhận đã gửi.
- [ ] Tự kiểm tra: Tạo đơn chưa tự đánh dấu đã gửi; bản in có ngày cần giao, food, lượng và đơn vị.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Tạo đơn chưa tự đánh dấu đã gửi; bản in có ngày cần giao, food, lượng và đơn vị.

### SF64 API đơn và phiếu nhập liên kết

Mốc G2.4 | Người làm TV4 | Reviewer TV2 | Cần xong trước: SF61, SF62.

Phạm vi file: `backend/apps/inventory/purchase_views.py (mới); services.py; urls.py`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] CRUD nháp/duyệt/xác nhận gửi; tạo phiếu nhập từ đơn; nhiều lần giao; gắn ReceiptLine với OrderLine.
- [ ] Tự kiểm tra: Nháp nhận không tăng đã nhận; chốt nhận cập nhật kho/đơn/phân bổ cùng giao dịch, rollback nếu lỗi.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Nháp nhận không tăng đã nhận; chốt nhận cập nhật kho/đơn/phân bổ cùng giao dịch, rollback nếu lỗi.

### SF65 Giao diện nhận hàng theo đơn

Mốc G2.4 | Người làm TV5 | Reviewer TV3 | Cần xong trước: SF63, SF64.

Phạm vi file: `frontend/src/ReceiptPage.tsx (tạo nếu chưa có); App.tsx phối hợp TV3`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Hiện đặt/đã nhận/còn thiếu; lượng chấp nhận, từ chối và lý do; chốt phiếu bằng API nhập hiện có.
- [ ] Tự kiểm tra: Đặt 13, nhận 10 còn 3; nhận thêm 3 hoàn tất; chặn 4 khi chỉ còn 3.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Đặt 13, nhận 10 còn 3; nhận thêm 3 hoàn tất; chặn 4 khi chỉ còn 3.

### SF66 Nghiệm thu đặt và nhận hàng

Mốc G2.4 | Người làm TV6 | Reviewer TV1 | Cần xong trước: SF63, SF64, SF65.

Phạm vi file: `backend/apps/inventory/test_purchases.py (mới); evidence/`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] E2E nhu cầu → đơn → nhận; đồng thời, gửi lại, đóng thiếu; test lại SF58 với đơn thật.
- [ ] Tự kiểm tra: AC38–AC42 đạt; nhận 4 kg chuyển hàng đang chờ thành tồn giữ cho kế hoạch, không thành 8 kg.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: AC38–AC42 đạt; nhận 4 kg chuyển hàng đang chờ thành tồn giữ cho kế hoạch, không thành 8 kg.

### SF67 Chốt xuất theo ngày và đóng ngày

Mốc G2.5 | Người làm TV1 | Reviewer TV6 | Cần xong trước: SF66.

Phạm vi file: `architecture.md; models.py; migrations mới`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Gắn phiếu xuất với ngày ăn; xuất bổ sung; lý do chênh lệch; đóng ngày chỉ khi dữ liệu đủ.
- [ ] Tự kiểm tra: Xuất là cấp nguyên liệu cho bếp, không tự coi là lượng học sinh đã ăn; trả/hủy sau xuất để mốc sau.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Xuất là cấp nguyên liệu cho bếp, không tự coi là lượng học sinh đã ăn; trả/hủy sau xuất để mốc sau.

### SF68 Nghiệp vụ xuất và chi phí ngày

Mốc G2.5 | Người làm TV2 | Reviewer TV4 | Cần xong trước: SF67.

Phạm vi file: `backend/apps/inventory/meal_report_services.py (mới); services.py`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Nháp xuất theo suất thực tế, trừ đã xuất; dùng service xuất chung; giải phóng phân bổ tương ứng.
- [ ] Tự kiểm tra: Đã xuất 10, nhu cầu 13 chỉ đề xuất 3; chi phí dùng ledger lúc xuất; 0 suất trả null chi phí/suất.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Đã xuất 10, nhu cầu 13 chỉ đề xuất 3; chi phí dùng ledger lúc xuất; 0 suất trả null chi phí/suất.

### SF69 Tổng quan bữa trưa

Mốc G2.5 | Người làm TV3 | Reviewer TV5 | Cần xong trước: SF68.

Phạm vi file: `frontend/src/LunchDashboardPage.tsx (mới); App.tsx`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Suất dự kiến/thực tế; lượng cần/đã xuất; chi phí nguyên liệu; liên kết chứng từ; ghi lý do chênh lệch.
- [ ] Tự kiểm tra: Xem được nguồn từng con số; đổi giá nhập hôm sau không làm thay đổi chi phí ngày cũ.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Xem được nguồn từng con số; đổi giá nhập hôm sau không làm thay đổi chi phí ngày cũ.

### SF70 API báo cáo ngày và test tích hợp

Mốc G2.5 | Người làm TV4 | Reviewer TV2 | Cần xong trước: SF67, SF68.

Phạm vi file: `backend/apps/inventory/meal_report_views.py; test_lunch_flow.py (mới); urls.py`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] API báo cáo/đóng ngày; test quyền, CSRF, request lặp, concurrency và ngày chưa đủ dữ liệu.
- [ ] Tự kiểm tra: API trả ngày chưa chốt rõ ràng; viewer không đóng ngày; giao dịch lỗi không để dữ liệu nửa vời.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: API trả ngày chưa chốt rõ ràng; viewer không đóng ngày; giao dịch lỗi không để dữ liệu nửa vời.

### SF71 Hoàn thiện UX và hướng dẫn sử dụng

Mốc G2.5 | Người làm TV5 | Reviewer TV3 | Cần xong trước: SF69, SF70.

Phạm vi file: `frontend/src/LunchDashboardPage.tsx phối hợp TV3; outputs/team-6/`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Nối API thật, mobile, tải/rỗng/lỗi/mất kết nối; hướng dẫn manager/viewer có ví dụ.
- [ ] Tự kiểm tra: Thử màn hình hẹp; retry không tạo phiếu lặp; chụp ảnh màn hình thực tế và ghi hạn chế.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: Thử màn hình hẹp; retry không tạo phiếu lặp; chụp ảnh màn hình thực tế và ghi hạn chế.

### SF72 Nghiệm thu toàn bộ bữa trưa

Mốc G2.5 | Người làm TV6 | Reviewer TV1 | Cần xong trước: SF69, SF70, SF71.

Phạm vi file: `backend/apps/inventory/test_lunch_flow.py; outputs/team-6/evidence/`. Đây là đường dẫn dự kiến tính từ root; `evidence/` là `outputs/team-6/evidence/`. Xác nhận file thực tế khi bắt đầu, phối hợp chủ file chung.

- [ ] Khảo sát code và trình phương án, JSON mẫu nếu có API/UI.
- [ ] Dữ liệu giả lập nhiều ngày; đối chiếu bằng tay; review hồi quy nền kho và bàn giao.
- [ ] Tự kiểm tra: AC43–AC47 và mọi case G2 trước đó đạt; lỗi nghiêm trọng đóng; SF37–SF42 nghiệm thu lại trước deploy.
- [ ] Ghi log/ảnh phù hợp, kiểm tra diff và cập nhật bằng chứng trong Excel.
- [ ] Reviewer kiểm tra kết quả và dependency; PR về dev1 khi được yêu cầu.

Điều kiện bàn giao: AC43–AC47 và mọi case G2 trước đó đạt; lỗi nghiêm trọng đóng; SF37–SF42 nghiệm thu lại trước deploy.
