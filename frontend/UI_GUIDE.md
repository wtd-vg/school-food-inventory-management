# Hướng dẫn giao diện SchoolFood

Dành cho thành viên và agent khi thêm hoặc sửa màn hình. Nguồn thiết kế: các file mẫu `design/*.html` (bản "Bếp Nhà Trường"). Quyết định áp dụng (duyệt 01/10/2026): dùng **đúng** token, font, component và khung trang; **bố cục từng màn** thiết kế lại cho hợp dữ liệu thật; tên hiển thị là **SchoolFood**.

## Cấu trúc

```text
src/
  styles/        tokens.css (nơi DUY NHẤT có mã màu), base.css, fonts.css (font tự host)
  lib/           format.ts (hiển thị vi-VN), decimal.ts (tính Decimal bằng BigInt), http.ts (gọi API + lỗi tiếng Việt)
  auth/          AuthContext (me, role, can_*, login/logout, session-expired), RequireAuth, RequirePermission
  components/
    icons/       SVG inline, 24×24, stroke currentColor
    ui/          Button, Field, Display (Badge, Callout, Segmented, RouteTabs, PageHeader, Lead, Toolbar…), DataTable (thành thẻ trên điện thoại),
                 Overlay (Drawer, Modal, ConfirmDialog, Toast), Chart (BarChart, CostBar)
    layout/      AppShell (sidebar 232 → chỉ icon <1280 → tab dưới <768), nav.ts
  features/      mỗi nghiệp vụ một thư mục: auth, lunch (G2), inventory, dishes, menus, classes, meals, students, notifications,
                 suppliers, reports, users, audit, public (trang không cần đăng nhập), common (tab con DishTabs/ClassTabs)
  services/      kiểu dữ liệu + lời gọi API khớp JSON backend: inventory, catalog, menus, meals, students,
                 notifications, administration (tài khoản + nhật ký), lunch (G2: nhu cầu, đơn đặt, chi phí, đóng ngày)
```

## Bản đồ màn hình

| Route | Màn | Ghi chú |
| --- | --- | --- |
| `/dang-nhap` | Đăng nhập | |
| `/bua-trua` | Hôm nay (SF69) | `?ngay=`; dòng thời gian Suất → Thực đơn → Nhu cầu → Đơn → Nhận → Xuất → Đóng ngày theo trạng thái thật, chi phí ngày/suất, đóng/mở lại ngày (ghi chú khi chênh lệch) |
| `/bua-trua/nhu-cau` | Nhu cầu & đề xuất (SF57/59) | `?ngay=`, `?du-phong=1` (tính lại kèm dự phòng có lý do), `?tao-don=1` (tạo đơn từ đề xuất); cảnh báo `is_outdated`, `shortages`; lịch sử bản tính |
| `/bua-trua/don-dat` | Đơn đặt (SF63) | `?trang-thai=`, `?don=ID` (duyệt/gửi/huỷ/đóng phần còn lại, gửi kèm version, 409 → tải lại), `?tao=1` (đơn tay) |
| `/bua-trua/nhan-hang` | Nhận hàng theo đơn (SF65) | `?don=ID`; lượng ≤ phần còn chờ + đơn giá → phiếu nhập nháp → chốt |
| `/bua-trua/xuat-bep` | Xuất bếp theo ngày | `?ngay=`; tạo phiếu xuất theo nhu cầu còn thiếu → chốt; cần/đã xuất/chênh lệch |
| `/kho` | Tồn kho | `?mat-hang=ID` mở ngăn kéo lịch sử giao dịch |
| `/kho/phieu-nhap` | Phiếu nhập | `?tao=1` tạo nháp (`&mat-hang=`, `&ncc=` điền sẵn), `?phieu=ID` xem/chốt |
| `/kho/phieu-xuat` | Phiếu xuất | như phiếu nhập |
| `/kho/kiem-ke` | Kiểm kê | phiếu đang đếm nhớ trên trình duyệt (API chưa có danh sách) |
| `/kho/danh-muc` | Danh mục & mặt hàng | `?tab=mat-hang` hoặc `danh-muc`, `?tao=1`, `?sua=ID` |
| `/mon-an` | Món & công thức | `?tao=1`, `?sua=ID`; định lượng hiện tới 6 số lẻ (0,4 g) |
| `/mon-an/thuc-don` | Thực đơn tuần (FE-04/05) | `?tuan=YYYY-MM-DD`, `?sua-thuc-don=1` (phiên bản mới từ ngày mai), `?phien-ban=ID`, `?ngay-nghi=1` |
| `/lop-hoc` | Lớp học | `?tao=1`, `?sua=ID` |
| `/lop-hoc/so-suat` | Số suất (FE-08) | `?ngay=`; mở ngày, nhập dự kiến/thực tế 0…sĩ số, ô trống ≠ 0, chốt/mở lại có lý do, 409 → tải lại |
| `/lop-hoc/hoc-sinh` | Học sinh (FE-06) | `?lop=ID`, `?tao=1`, `?sua=ID`, `?nhap-csv=1` (kiểm tra dry-run rồi mới lưu) |
| `/lop-hoc/thu-thuc-don` | Thư thực đơn (FE-07) | `?ngay=`; nhật ký gửi, Gửi lại (202), Gửi thử, nhãn "Chế độ thử" khi `EMAIL_MODE=dry_run` |
| `/nha-cung-cap/:id` | Nhà cung cấp | danh sách trái / chi tiết phải |
| `/bao-cao` | Báo cáo kho | `?thang=YYYY-MM`, `?muc=tong-quan`, `ton-kho`, `so-giao-dich` hoặc `theo-ngay` (SF70: chi phí ngày, suất thực tế, chi phí/suất, biểu đồ), Xuất CSV |
| `/tai-khoan` | Tài khoản (FE-02) | chỉ Hiệu trưởng; `?tao=1`, `?sua=ID`; khoá/mở khoá, đặt lại mật khẩu |
| `/nhat-ky` | Nhật ký (FE-03) | chỉ Hiệu trưởng; `?actor=&action=&entity_type=&from=&to=&page=`, `?chi-tiet=ID` (trước → sau) |
| `/huy-nhan/:token` | Huỷ nhận email (công khai) | ngoài khung đăng nhập; chỉ gọi API khi bấm "Xác nhận huỷ nhận" |
| `/_kit` | Bộ component | chỉ bản dev |

Trạng thái mở ngăn kéo nằm trên URL để bấm Back/chia sẻ link được. Đổi nhiều tham số cùng lúc dùng `useUpdateParams` (gọi `setSearchParams` liên tiếp sẽ ghi đè nhau).

Trang `/_kit` (chỉ bản dev) liệt kê mọi component. Mở nó trước khi dựng màn mới.

## Quy tắc bắt buộc

- **Không thêm dependency.** CSS Modules (`X.module.css` cạnh `X.tsx`) + token. Không hex ngoài `tokens.css`, không `style={{…}}` trừ khi truyền giá trị động qua CSS custom property (`style={{ '--h': '72%' }}`).
- **Font**: Be Vietnam Pro cho mọi chữ. Baloo 2 (`var(--font-display)`) chỉ dùng cho chữ logo.
- **Số liệu**: API trả Decimal dạng chuỗi. Hiển thị qua `formatQty`, `formatMoney`, `formatDate`…; không `Number()` / `parseFloat` rồi cộng tiền. Cần tổng tạm tính trên form thì dùng `lib/decimal.ts`. Ô nhập số kiểm tra bằng `normalizeDecimalInput` (lượng 3 chữ số lẻ, tiền 2) rồi gửi **chuỗi**.
- **Gọi API** bằng `api.get/post/patch` trong `lib/http.ts`. Lỗi là `ApiError` có câu tiếng Việt; hiển thị bằng `messageOf(err)`.
- **Vai trò** (`/api/auth/me/`): `manager` = **Quản lý** (làm mọi nghiệp vụ, `can_write`), `principal` = **Hiệu trưởng** (xem tất cả, `can_manage_users`, `can_view_audit`). Không có tài khoản phụ huynh.
- **Quyền**: nút ghi nghiệp vụ dùng `<Button write>`. Hiệu trưởng thấy nút bị khoá kèm icon ổ khoá và tooltip "Hiệu trưởng chỉ xem"; **không ẩn nút**. Ô nhập của màn ghi (số suất…) cũng `disabled` khi `!canWrite`. Màn chỉ dành cho Hiệu trưởng bọc `RequirePermission need="users" | "audit"`; mục điều hướng có `requires` chỉ hiện khi đủ quyền (trên điện thoại nằm trong menu tài khoản). Backend vẫn là nơi chặn (403).
- **Lỗi API**: `ApiError` có `status`, `message` (câu tiếng Việt) và `errors` theo ô (`{"lines[0].planned": "…"}`); dùng `fieldsOf(err)` để gắn lỗi vào đúng ô. 401 giữa phiên → về `/dang-nhap` kèm "Phiên đăng nhập đã hết hạn". Đăng nhập: 401 sai thông tin, 403 chưa phân quyền, 429 tạm khoá (giữ câu của backend/nginx). 409 (version cũ) → báo và tải lại dữ liệu mới nhất.
- **Sau thao tác ghi**: `useApiQuery.reload()` giữ dữ liệu cũ trên màn trong lúc tải. Thao tác tiếp theo phụ thuộc version/id mới (duyệt bản vừa tính, gửi đơn vừa duyệt) phải dùng kết quả API vừa trả hoặc khoá nút tới khi tải xong; nếu không sẽ gửi version cũ → 409.
- **Dữ liệu cá nhân**: email phụ huynh chỉ hiện dạng che (`email_hint`); email đầy đủ chỉ lấy khi Quản lý bấm "Hiện email" (có ghi nhật ký). Không ghi email vào URL, toast hay log.
- **Truy cập**: thẻ thật (`button`, `a`, `label`+`input`, `table`+`th scope`); không `onClick` trên `div`. Bảng dùng `DataTable` (caption ẩn, cuộn ngang khi hẹp). Hộp thoại dùng `Drawer`/`Modal` (focus trap, Esc, trả focus).
- **Trạng thái**: mọi danh sách có đủ tải (`Skeleton`), rỗng (`EmptyState` + nút chính), lỗi (`ErrorState` + Thử lại). Thao tác xong báo bằng `useToast().show(...)`.
- **Câu chữ** tiếng Việt, không emoji. Trạng thái không truyền chỉ bằng màu, luôn kèm chữ.

## Mẫu một màn

```tsx
export function VidụPage() {
  const q = useApiQuery(() => api.get<{ results: Row[] }>('/api/...'), []);
  return (
    <>
      <PageHeader title="Tiêu đề" actions={<Button write icon={<IconPlus size={18} />}>Thêm</Button>} />
      {q.loading ? <Skeleton /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : <DataTable … />}
    </>
  );
}
```

## Kiểm tra trước khi mở PR

1. `npm run build` đạt.
2. `grep -rnE "#[0-9a-fA-F]{3,8}" src --include=*.css --include=*.tsx` chỉ còn `tokens.css`.
3. Chạy app, thao tác bằng tài khoản **Quản lý và Hiệu trưởng**; đi hết bằng bàn phím; xem ở 1440, 1024, 375 px. Ảnh nghiệm thu lưu `outputs/team-6/evidence/<MÃ>_*.png` (1280 và 375 px).
