# SF43 · Dữ liệu lớp và suất trưa (G2.1)

- **Người làm / Reviewer:** TV1 · TV6
- **Ngày:** 30/09/2026
- **Nhánh:** `feat/sf43-lunch-counts`, xếp chồng trên SF31 để migration nối tiếp (`0012`, `0013`)

> **Điều kiện đạt:** lớp 30 học sinh thì chặn −1 và chặn 31 suất; NULL khác 0; đổi sĩ số không sửa ngày đã chốt.
>
> **Phạm vi:** model, ràng buộc, trigger, vòng đời chốt/mở lại. API lớp là SF44; API và bảng nhập suất là SF46/SF47.

## 1. Quyết định

| Câu hỏi | Chốt |
| --- | --- |
| Chưa nhập và nghỉ ăn | `NULL` = chưa nhập (chặn chốt). `0` = cả lớp không ăn hôm đó (hợp lệ). Không dùng số âm hay giá trị đặc biệt. |
| Giới hạn | Suất lớp là số nguyên từ 0 đến `enrolled_snapshot`. Sĩ số lớp từ 0 đến 200, suất nhân viên từ 0 đến 1000; hai trần này để chặn gõ nhầm. Không có số lẻ (kiểu integer). |
| Sĩ số tại ngày | Lúc mở ngày, mỗi dòng chụp lại sĩ số hiện hành vào `enrolled_snapshot`. Sau đó sửa `SchoolClass.enrolled` **không** làm đổi ngày đã có. |
| Dự kiến và thực tế | Hai cột độc lập (`planned`, `actual`), chốt riêng. Chỉ chốt thực tế sau khi đã chốt dự kiến. Suất nhân viên (`staff_planned`, `staff_actual`) nằm ở cấp ngày. |
| Chốt dự kiến | Chỉ chốt được khi: mọi lớp **đang hoạt động** đều có dòng, mọi dòng đã nhập, và suất nhân viên đã nhập. |
| Sau khi chốt | Suất đã chốt, sĩ số snapshot và danh sách lớp của ngày bị khoá ở DB. Muốn sửa phải **mở lại có lý do**, việc này tạo phiên bản mới. |
| Phiên bản | `LunchDay.version` tăng **đúng 1** ở mọi lần sửa (DB bắt buộc). SF46 dùng version để trả 409 khi hai người cùng sửa. |
| Lịch sử | Mỗi lần chốt hoặc mở lại có một `LunchDayEvent`: action, version, lý do, người, thời điểm, snapshot số liệu. Bảng này chỉ thêm, không sửa, không xoá. |
| Giờ chốt | **Không khoá tự động theo giờ.** Trường chưa chọn giờ chốt, nên đây là cấu hình vận hành sẽ quyết sau. UI chỉ được *cảnh báo* "quá hạn". |
| Lớp ngừng dùng | Đặt `is_active=False`. Lịch sử giữ nguyên (FK `PROTECT`); không xoá được lớp hay ngày đã có lịch sử. |

## 2. Model (migration `0012_lunch_counts`)

```
SchoolClass    code UNIQUE (khác rỗng), name, grade 1–12 | NULL, enrolled 0–200, is_active
LunchDay       date UNIQUE, staff_planned/actual (NULL | 0–1000),
               planned_confirmed_at/by, actual_confirmed_at/by, version ≥ 1
               CHECK cặp at/by cùng có hoặc cùng rỗng · CHECK thực tế chỉ sau dự kiến
ClassMealCount lunch_day, school_class (PROTECT), enrolled_snapshot, planned, actual
               UNIQUE(lunch_day, school_class) · CHECK planned/actual NULL hoặc ≤ enrolled_snapshot
               (≥ 0 do PositiveSmallIntegerField tạo CHECK sẵn)
LunchDayEvent  lunch_day, action (confirm_/reopen_ planned|actual), version, reason, snapshot JSON,
               created_by · UNIQUE(lunch_day, version) · CHECK mở lại phải có lý do
```

## 3. Trigger (migration `0013_lunch_integrity`)

| Trigger | Chặn |
| --- | --- |
| `sf43_lunch_day_guard` | Sửa ngày mà version không tăng đúng 1; đổi `date`; sửa suất nhân viên đã chốt; xoá ngày đã có lịch sử |
| `sf43_class_count_guard` | Khi đã chốt dự kiến: thêm hoặc xoá dòng, đổi lớp, sửa `planned`, sửa `enrolled_snapshot`. Khi đã chốt thực tế: sửa `actual` |
| `sf43_lunch_day_confirmation` (deferred) | Chốt khi còn lớp thiếu dòng, còn NULL, hoặc thiếu suất nhân viên; mọi lần chốt/mở lại không có event đúng action và version |
| `sf43_event_append_only` | Sửa hoặc xoá lịch sử |

Các ràng buộc này nằm ở PostgreSQL, nên vẫn có hiệu lực khi có người sửa thẳng bằng Django admin, `QuerySet.update` hay SQL.

## 4. Hàm dùng chung (`apps/inventory/lunch.py`)

| Hàm | Việc |
| --- | --- |
| `open_lunch_day(date)` | Tạo ngày nếu chưa có, tạo dòng cho các lớp đang hoạt động còn thiếu (chụp sĩ số). Gọi lại được nhiều lần. Đã chốt dự kiến thì không thêm lớp. |
| `missing_counts(day, kind)` | Danh sách lý do chưa chốt được, để hiện lên UI (ví dụ "Lớp 2A1 chưa nhập suất dự kiến."). |
| `confirm_counts(day_id, kind, user, expected_version)` | Khoá ngày, kiểm tra version và độ đầy đủ, ghi người/thời điểm chốt, tạo event kèm snapshot. |
| `reopen_counts(day_id, kind, user, reason, expected_version)` | Bắt buộc lý do. Không mở lại dự kiến khi đang chốt thực tế. Tạo event. |

**Lỗi:**

- `LunchVersionConflict` (kế thừa `ValidationError`) → SF46 trả **409**.
- `ValidationError` thường → trả **400**, kèm danh sách lý do.

**Cách SF46 ghi số** (khoá lạc quan):

```python
with transaction.atomic():
    updated = LunchDay.objects.filter(pk=day_id, version=expected).update(
        staff_planned=5, version=F("version") + 1)
    if not updated:
        raise LunchVersionConflict("Dữ liệu đã được người khác cập nhật.")   # → 409
    ClassMealCount.objects.filter(lunch_day_id=day_id, school_class_id=class_id).update(planned=30)
```

Cổng API phải nhận **số nguyên JSON**; từ chối bool, float, chuỗi số lẻ. `null` được chấp nhận khi xoá số đã nhập ở trạng thái nháp.

## 5. JSON mẫu cho FE/SF46 (đề xuất, chưa có API)

```json
{
  "date": "2026-10-01", "version": 4,
  "planned": {"confirmed_at": "2026-10-01T08:10:00+07:00", "confirmed_by": "lan", "staff": 5, "total": 63},
  "actual":  {"confirmed_at": null, "confirmed_by": null, "staff": null, "total": null},
  "classes": [
    {"class_id": 1, "code": "1A1", "enrolled_snapshot": 30, "planned": 30, "actual": null},
    {"class_id": 2, "code": "1A2", "enrolled_snapshot": 28, "planned": 28, "actual": null},
    {"class_id": 3, "code": "2A1", "enrolled_snapshot": 20, "planned": 0,  "actual": null}
  ],
  "missing": []
}
```

`total` trả `null` khi còn chỗ chưa nhập. Không được hiển thị con số tạm như thể đã đủ.

## 6. Việc cho nhánh `feat/Nguyen_Dat` (SF44/SF50 của TV2)

- `SchoolClass` của nhánh đó chỉ có `code`, `name`, `is_active`. Bản SF43 thêm `grade` và `enrolled` (bắt buộc), và đặt ràng buộc ở DB.
- **Bỏ** model `SchoolClass` cùng phần Issue/IssueLine trong migration `0008_dish_schoolclass_issue_issueline_…`, rebase lên các nhánh này, rồi `makemigrations` lại (chỉ còn Dish/RecipeComponent, và chờ SF49 chốt).
- API lớp (SF44) cần thêm field `enrolled` và `grade`, trả 409 khi mã trùng, và **không xoá** lớp đã có `ClassMealCount`.

## 7. Bằng chứng

- `makemigrations --check` → không đổi.
- Toàn bộ `apps.inventory` → **86/86 OK** (PostgreSQL 16).
- Migration 0012/0013 hoàn tác được.
- Test mới trong `test_lunch_sf43.py` (13 test):

| Case | Kiểm tra |
| --- | --- |
| AC23 | −1 và 31 bị DB từ chối; số lẻ bị `full_clean` từ chối; sĩ số âm bị chặn |
| NULL ≠ 0 | Thiếu một lớp thì chặn chốt; 0 thì chốt được; tổng = 63 |
| AC24 | Có lớp mới đang hoạt động thì chặn chốt cho tới khi bổ sung dòng |
| Chốt qua DB | Chốt thẳng bằng SQL khi còn NULL, hoặc không có event → đều bị chặn |
| AC25 | Đổi sĩ số lớp không sửa ngày đã chốt; dòng đã chốt chỉ đọc; dự kiến 63 và thực tế 60 giữ riêng |
| Mở lại | Mở lại cần lý do; lịch sử kèm snapshot, không sửa được; đang chốt thực tế thì không mở lại dự kiến |
| Version | Version cũ → `LunchVersionConflict`; sửa không tăng version → DB chặn |
| Lịch sử | Lớp ngừng dùng vẫn giữ lịch sử; không xoá được lớp hay ngày đã có lịch sử |
