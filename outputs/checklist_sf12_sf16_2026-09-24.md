# Checklist hoàn thiện SF12–SF16

Ngày lập: 24/09/2026, theo checkout `59fc425`. `[x]` là bằng chứng đã thấy/chạy trong review, không thay chữ ký nghiệm thu. Chi tiết lỗi R01–R09: [báo cáo review](review_sf12_sf16_2026-09-24.md).

## Kiểm tra nền

- [x] Django system check đạt.
- [x] Bộ test hiện có 15/15 pass trên PostgreSQL test DB.
- [x] TypeScript/Vite build đạt.
- [x] Model và migration đồng bộ theo makemigrations --check --dry-run.
- [ ] TV1 sửa proxy Docker R09 và chạy `docker compose up --build`, migrate, gọi hello và API qua frontend.

## SF12 — TV6 làm, TV1 review

- [x] Có model, API và trang Category trong checkout.
- [ ] Ghi commit cần nghiệm thu: bản M1 cũ hay bản tích hợp M2 hiện tại.
- [ ] Trên máy thứ hai, migrate và tạo hai Category; đối chiếu DB/API/UI theo id/code/name/is_active, reload còn dữ liệu.
- [ ] Kiểm tra trạng thái loading, empty, API lỗi; không hiển thị lỗi như danh sách rỗng.
- [ ] Nếu kiểm tra bản hiện tại, hoàn thiện login SF15 trước khi nghiệm thu UI yêu cầu auth.
- [ ] Ghi actual, ảnh/video, commit và người kiểm tra vào AC02; TV1 review rồi mới đóng SF12.

## SF13 — TV1 làm, TV6 review

- [x] Có csrf/login/me/logout, session, manager/viewer và decorator cho API danh mục.
- [x] Có test CSRF thật và xoay token sau login trong luồng test hiện tại.
- [ ] Sửa R03: login chỉ nhận JSON object và username/password string hợp lệ.
- [ ] Thống nhất response lỗi và trạng thái tài khoản inactive; cập nhật tài liệu bàn giao.
- [ ] Bổ sung test logout làm mất quyền, CSRF thiếu/sai tại login/logout và request ghi sau login.
- [ ] Test me sau login, sai password, anonymous, viewer/manager trên cả Category/Food/Supplier.
- [ ] Chốt chính sách tài khoản không thuộc group (hiện mặc định viewer) và superuser (hiện manager), ghi rõ rồi test.
- [ ] Demo auth cho team, ghi bằng chứng AC04 để TV6 review.

## SF14 — TV2 làm, TV4 review

- [x] Có FoodItem/Supplier, field phone và migration.
- [x] Có GET collection, POST, PATCH cho ba danh mục; DELETE bị từ chối.
- [x] Food POST/PATCH có chặn quantity/avg_cost/stock_version trong code.
- [ ] Sửa R02: chỉ nhận boolean thật; Category có tham chiếu không thể bị tắt bằng 0/null/chuỗi.
- [ ] Sửa R03: tất cả body ghi phải là JSON object; sai cấu trúc trả 400.
- [ ] Sửa R04: giới hạn code/name/unit/phone và kiểu dữ liệu trước create/save.
- [ ] Sửa R05: unit thuộc kg/lit/piece; category_id nguyên dương, không phải bool.
- [ ] Sửa R06: phone là string hợp lệ, hỗ trợ rỗng; không stringify object/list.
- [ ] Chuẩn hóa error contract R07 và cách xử lý field không được phép giữa POST/PATCH.
- [ ] Xác nhận mã trùng sau strip/upper không gây 500; sửa lỗi không làm đổi dữ liệu đã lưu.
- [ ] Cung cấp request/response mẫu hợp lệ và lỗi; TV4 review AC03/AC05 phần API.

## SF15 — TV3 làm, TV5 review

- [ ] Login UI gọi csrf trước POST, lưu session qua cookie, dùng token sau khi login xoay token.
- [ ] Khôi phục user qua me khi reload; có logout; API 401 đưa về login.
- [ ] Gửi X-CSRFToken cho POST/PATCH; fallback thông báo rõ khi nhận HTML 403.
- [ ] Có màn hình Food với danh sách, tạo, sửa, ngừng dùng; chọn Category và unit.
- [ ] Hoàn thiện sửa Category code/name; giữ thêm và đổi trạng thái.
- [ ] Viewer chỉ thấy thao tác đọc, manager có thao tác ghi; không dùng UI để thay backend authorization.
- [ ] Lỗi cạnh field theo contract; khóa thao tác khi đang gửi, cả nút đổi trạng thái.
- [ ] Sau thành công tải lại dữ liệu; xử lý request lỗi và session hết hạn rõ ràng.
- [ ] Kiểm tra desktop/màn hình hẹp, thao tác bàn phím và label của form.
- [ ] Build đạt và quay video login → tạo/sửa Food → reload, kèm sai password/viewer; TV5 review.

## SF16 — TV4 làm, TV2 review

- [x] Đã có fixture manager/viewer và một phần test auth/Category.
- [ ] API Category rỗng trả `results: []`; có hai bản ghi trả đủ field, đúng kiểu/thứ tự.
- [ ] 401 cho anonymous đọc nghiệp vụ; request ghi có CSRF hợp lệ mới dùng để tách kiểm tra 401/403 quyền khỏi 403 CSRF.
- [ ] Viewer GET thành công, POST/PATCH thất bại trên cả ba danh mục; manager thao tác hợp lệ thành công.
- [ ] Login/logout và POST/PATCH thử CSRF thiếu, sai và đúng bằng enforce_csrf_checks=True.
- [ ] Code trùng nguyên bản và sau chuẩn hóa; code/name rỗng hoặc chỉ khoảng trắng.
- [ ] Độ dài đúng giới hạn và vượt giới hạn trên POST/PATCH; sai kiểu bool/string/int/null/list/object.
- [ ] JSON hỏng và JSON hợp lệ nhưng không phải object; method không hỗ trợ.
- [ ] Category id không tồn tại và id boolean; unit ngoài danh sách.
- [ ] Food gửi riêng từng field quantity/avg_cost/stock_version trên POST/PATCH phải bị chặn.
- [ ] Supplier phone rỗng/hợp lệ, quá dài, object/list; không tạo dữ liệu rác.
- [ ] Category đang được tham chiếu không tắt được; DELETE không xóa bản ghi.
- [ ] Sau mọi request lỗi: assert count không tăng, refresh_from_db rồi assert field/tồn/giá/version không đổi.
- [ ] Chạy toàn bộ test PostgreSQL, lưu log và danh sách case; TV2 review. Không đặt mục tiêu chỉ “đủ 15 tests”.

## Tài liệu và điều kiện chuyển mốc

- [ ] TV1 cập nhật README/task_on_progress/architecture theo hiện trạng, giữ rõ kế hoạch tương lai.
- [ ] Khôi phục heading SF14 trong hướng dẫn task.
- [ ] Đồng bộ hai bản sf13.md hoặc chọn một bản gốc và liên kết; sửa phone/inactive/error contract.
- [ ] Cập nhật checklist Excel bằng actual/commit/log/reviewer thật, không tự suy ra Done từ build pass.
- [ ] Hoàn tất SF17 Supplier UI và SF18 seed/nghiệm thu trước khi đóng M2 theo phụ thuộc hiện hành.
- [ ] Chỉ mở M3 sau khi luồng manager/viewer và danh mục chạy được trên máy thứ hai.

## Mẫu bằng chứng nghiệm thu

| Task/AC | Commit | Máy/ngày/người chạy | Lệnh hoặc bước test | Expected | Actual | Log/ảnh/video | Reviewer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Điền khi chạy thực tế | | | | | | | |
