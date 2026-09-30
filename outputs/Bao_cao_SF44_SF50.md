# Báo Cáo Triển Khai Task SF44 & SF50 (Giai đoạn G2)

**Nhánh làm việc:** `feat/Nguyen_Dat`
**Người thực hiện:** TV2 (Backend Logic)

Tài liệu này ghi chú chi tiết những thay đổi về kiến trúc, model, API và các lưu ý khắt khe dành cho từng thành viên (TV1, TV3, TV4, TV5, TV6) để phối hợp kiểm thử và ghép giao diện.

---

## 1. Dành cho TV1 (Leader / Review & Tích hợp)
- **Nguyên tắc thiết kế**: Để không vi phạm nguyên tắc "Bất khả xâm phạm code cũ" của Phase 1, toàn bộ tính năng mới đã được tách ra thành 2 file riêng biệt: `class_views.py` và `recipe_views.py`. Không một dòng code nào trong `views.py` cũ bị sửa đổi.
- **Models**: Đã thêm 3 class `SchoolClass`, `Dish`, `RecipeComponent` theo phương thức *append* vào cuối file `models.py`. 
- **Migration**: Đã chạy thành công lệnh makemigrations sinh ra file `0008_dish_schoolclass_issue_issueline_recipecomponent.py`.
- **Lưu ý lúc Merge**: TV1 khi merge nhánh này vào `dev1` vui lòng check file `urls.py`, các route mới `/api/classes/` và `/api/dishes/` đã được append xuống cuối cùng để không gây conflict.

---

## 2. Dành cho TV4 (Backend Test & API Validation)
Khâu test của SF44 và SF50 khá phức tạp, đặc biệt là phần quy đổi đơn vị. Việc tôi tách ra 2 file views mới chính là để dọn đường cho TV4. 
**Hành động yêu cầu:** TV4 hãy tạo 2 file test mới là `test_classes.py` và `test_recipes.py` thay vì nhồi nhét vào `tests.py` cũ nhé.

**A. Các Test Case bắt buộc cho SF44 (Lớp học):**
1. Test Authentication: Request POST/PATCH bằng user có group `viewer` -> Yêu cầu assert status `403`.
2. Test Validation: POST thiếu `code` hoặc `name` -> Assert status `400`.
3. Test Conflict: POST một `code` đã tồn tại trong DB -> Assert status `409` (Trùng mã).

**B. Các Test Case bắt buộc cho SF50 (Món ăn & Công thức):**
Trọng tâm của tính năng này nằm ở Hàm `convert_quantity()` và `_positive_decimal()` trong `recipe_views.py`. TV4 cần viết Unit Test gọi thẳng vào 2 hàm này:
1. **Case Quy đổi đúng**: 
   - Truyền nguyên liệu hệ `kg`, client gửi `unit="g"`, quantity `500` -> Assert kết quả lưu DB phải là `Decimal('0.500')`.
   - Truyền nguyên liệu hệ `lit`, client gửi `unit="ml"`, quantity `300` -> Assert kết quả `Decimal('0.300')`.
2. **Case Sai thứ nguyên (Bắt buộc phải chặn)**:
   - Truyền nguyên liệu hệ `lit`, nhưng client lại gửi `unit="g"` -> Assert bắt exception `ValueError("Cannot convert g to lit")`.
3. **Case Giá trị độc hại**:
   - Truyền số âm (`-50`), hoặc bằng không (`0`), hoặc mã lỗi vô cực (`NaN`, `Infinity`) -> Assert bắt exception `ValueError("Must be positive and finite")`.
4. **Test Atomic Transaction**:
   - Cố tình POST một món ăn có 2 nguyên liệu giống hệt nhau (`Duplicate food in components`).
   - Cố tình POST nguyên liệu thứ 2 bị sai thứ nguyên.
   - -> Assert món ăn đó không được tạo ra trong DB (Đảm bảo transaction rollback 100%).

---

## 3. Dành cho TV6 (QA / Nghiệm thu End-to-End)
Vì tính năng Nhập/Xuất kho của Phase 1 đã bị "niêm phong", TV6 không cần test lại kho. Hãy test độc lập luồng G2 như sau:
1. **Test Tạo Lớp học**: Tạo lớp "1A". Sau đó thử tạo lại "1A" (hệ thống phải từ chối). Cuối cùng PATCH `is_active = false` để ngừng hoạt động.
2. **Test Món ăn (Quan trọng)**:
   - Mở giao diện FoodItem (hoặc DB), tạo 1 nguyên liệu là "Muối" (đơn vị gốc: `kg`).
   - Gọi API POST tạo Món ăn "Canh Chua", truyền vào components: Muối, số lượng `50`, đơn vị `g`.
   - Gọi API GET `/api/dishes/` để check lại. Nếu mảng components hiển thị quantity của Muối là `0.050` thì Pass.
   - Test ép lỗi: Nhập "Muối", số lượng `2`, đơn vị `lit` -> API phải văng lỗi 400. 

---

## 4. Dành cho TV3, TV5 (Frontend UI)
- Payload gửi lên lúc tạo Món ăn (`POST /api/dishes/`):
```json
{
  "code": "M01",
  "name": "Canh Chua",
  "components": [
    {
      "food_id": 1,
      "quantity": "50",
      "unit": "g"  // <-- Frontend truyền đơn vị tự do theo ý người dùng (g, kg, ml, lit, piece)
    }
  ]
}
```
- Các mã lỗi Backend trả về để UI hiển thị:
  - `400`: `Must be positive and finite` (Số lượng không hợp lệ).
  - `400`: `Cannot convert <unit> to <unit>` (Người dùng chọn sai đơn vị đo lường).
  - `409`: `Dish code already exists` (Mã món ăn đã tồn tại).
- Nếu gặp lỗi `session-expired` (401), code của TV3 trong `utils/api.ts` đã tự động hất user văng ra trang Login rồi, các bạn không cần lo.
