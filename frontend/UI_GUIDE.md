# Hướng dẫn giao diện SchoolFood

Dành cho thành viên và agent khi thêm hoặc sửa màn hình. Nguồn thiết kế: bản **"Bếp Nhà Trường" xanh lá rau** (SF78, duyệt 02/10/2026; mẫu Tổng quan, Kho hàng, Chi tiết lô, Đặt hàng, Báo cáo). Quyết định áp dụng: dùng **đúng** token, font, component và khung trang; **chỉ hiện dữ liệu thật** — phần mẫu không có backend (lô/hạn dùng, kiểm thực, so sánh báo giá, bản đồ nguồn gốc, báo cáo dạng tài liệu) **không làm**; tên hiển thị vẫn là **SchoolFood**. Trang đăng nhập (SF77) giữ bảng màu ấm riêng (`--login-*`).

## Hệ thiết kế (SF78)

- **Khung app**: viền 8px gradient mint → lá non → kem → mint bo 30 (chỗ duy nhất có gradient ở viền) → cửa sổ trắng bo 22 → thanh trên 60px (logo, ô tìm kiếm toàn app 420px có chọn phạm vi, chuông "Cần chú ý", tài khoản) → thanh dọc 64px chỉ icon, nền gradient xanh. Nội dung nền #F6F9F5 → trắng, padding 20/24, các khối cách 18.
- **Màu**: xanh thương hiệu (`--brand`) **chỉ cho hành động** (nút chính, tab chọn, dòng chọn, thanh dọc, liên kết). Đỏ/cam **chỉ cho trạng thái**. Gradient chỉ ở viền khung, băng tranh/ảnh bìa và điện thoại xem trước; vùng dữ liệu phẳng. Biểu đồ: `--chart-1…5` theo thứ tự cố định (đã chạy `validate_palette`), luôn kèm nhãn/chú giải.
- **Đầu trang**: `PageHeader` (mặc định) tiêu đề 28/500 + `meta` bên phải; `PageHeader variant="banner"` cho trang danh sách (băng tranh 128px, breadcrumb, tiêu đề + `count`, nút phụ); `CoverHeader` + `Tabs` cho trang chi tiết (ảnh bìa 200px, card nổi 3 thông tin).
- **Nút** (cao 40, bo 12): `primary` xanh; `secondary` nền mint chữ xanh đậm (thao tác phụ của trang); `outline` nền trắng viền xám (Huỷ/Đóng, nút trong bảng, phân trang); `caret` thêm ▾ khi nút mở nhiều loại.
- **Chip** (`Badge`, cao 26, bo tròn, icon 13, nền pastel + viền cùng tông): `info` mới/đang chuẩn bị · `ok` đạt/đang dùng/đang hợp tác · `done` hoàn tất/đã chốt/đã đóng · `warn` cần đặt/chưa chốt · `danger` hết hàng/lỗi · `draft` nháp · `review` đang duyệt/chế độ thử · `paused` tạm dừng · `neutral` huỷ/ngừng.
- **Bảng** (`DataTable`): dải tiêu đề nền nhạt bo 10, hàng cao 46. Cột có `sort` thì bấm tiêu đề để sắp xếp (aria-sort); trang tự phân trang thì dùng `sort`/`onSortChange` + `sortRows` để sắp **trước** khi cắt trang. `selected` + `onSelectedChange` thêm checkbox, dòng chọn nền mint; kèm `BulkBar` nổi giữa đáy. Cột đầu có thể dùng `tableText.thumbCell` + `Thumb`.
- **Độ rộng cột**: cột nội dung cố định (ngày, mã, tiền, số lượng, chip, nút) đặt **px** theo bề rộng đo được (ngày `dd/mm/yyyy` 132px, tiền tới hàng triệu 148–168px, chip trạng thái 124–148px); cột tên/ghi chú để trống `width` cho tự giãn. `minWidth` = tổng cột px + phần tối thiểu của cột giãn, để khi khung hẹp bảng cuộn ngang trong khung thay vì cắt chữ. Kiểm bằng dò tràn ở 1024/1280/1440/375.
- **Màu biểu đồ theo thực thể**: nhóm hàng giữ màu cố định theo thứ tự tạo (id), 5 nhóm đầu `--chart-1…5`, từ nhóm thứ 6 gộp xám "Nhóm khác (n)" — không tô theo hạng giá trị.
- **Khác**: `Panel` (card bo 16, không viền, bóng nhẹ, có `title`/`action`), `InfoTiles` (ô key-value), `Stat` (số lớn), `TimedTask` (việc có giờ, mục xa nhạt dần bằng nền — chữ vẫn đạt AA), `FolderCard`, tranh SVG `Scene` (4 bảng màu `suong`/`dong`/`binhminh`/`song`), `Tray` (khay cơm), `Thumb`.
- **Chữ**: Be Vietnam Pro 400/500/600/700; tiêu đề trang 28/500, tiêu đề card 16/600, số lớn 22–30/500; mọi con số tabular-nums (đặt sẵn ở `body`).

## Cấu trúc

```text
src/
  styles/        tokens.css (nơi DUY NHẤT có mã màu), base.css, fonts.css (font tự host)
  lib/           format.ts (hiển thị vi-VN), decimal.ts (tính Decimal bằng BigInt), http.ts (gọi API + lỗi tiếng Việt), text.ts (tìm không dấu)
  auth/          AuthContext (me, role, can_*, login/logout, session-expired), RequireAuth, RequirePermission
  components/
    icons/       SVG inline, 24×24, stroke currentColor
    ui/          Button, Field, Display (Badge, Callout, Segmented, RouteTabs, Tabs, PageHeader, Panel, InfoTiles, Stat, TimedTask, Lead, Toolbar…),
                 DataTable (sắp xếp, chọn dòng; thành thẻ trên điện thoại), BulkBar, Cover (CoverHeader, FolderCard),
                 Illustration (Scene, Tray, Thumb), Overlay (Drawer, Modal, ConfirmDialog, Toast), Chart (BarChart, CostBar)
    layout/      AppShell (viền + thanh trên + thanh dọc 64px; <768: tab dưới đáy, tìm kiếm mở bằng nút), GlobalSearch, AlertsBell, nav.ts
  features/      mỗi nghiệp vụ một thư mục: auth, lunch (G2), inventory, dishes, menus, classes, meals, students, notifications,
                 suppliers, reports, users, audit, public (trang không cần đăng nhập), common (tab con DishTabs/ClassTabs)
  services/      kiểu dữ liệu + lời gọi API khớp JSON backend: inventory, catalog, menus, meals, students,
                 notifications, administration (tài khoản + nhật ký), lunch (G2: nhu cầu, đơn đặt, chi phí, đóng ngày)
```

## Bản đồ màn hình

| Route | Màn | Ghi chú |
| --- | --- | --- |
| `/dang-nhap` | Đăng nhập | |
| `/bua-trua` | Tổng quan (SF69, bố cục SF78) | `?ngay=`; số suất theo khối (biểu đồ vòng), kho theo nhóm, việc trong ngày (7 bước theo trạng thái thật, lọc Cần làm/Tất cả), chi phí mỗi suất 30 ngày, thực đơn tuần (khay cơm, tìm món), ảnh suất ăn; đóng/mở lại ngày (ghi chú khi chênh lệch) |
| `/bua-trua/nhu-cau` | Nhu cầu & đề xuất (SF57/59) + Đặt hàng (SF78) | `?ngay=`, `?du-phong=1` (tính lại kèm dự phòng có lý do); cảnh báo `is_outdated`, `shortages`; lịch sử bản tính. Khi bản đã duyệt còn dòng "Phải mua" và chưa có đơn: khối **Đặt hàng cho T? d/m** — chip mặt hàng cần mua, bảng giá nhập gần đây theo NCC (từ phiếu nhập đã chốt), ô nhu cầu 5 bước, khung phải dính (giá gần nhất, chọn NCC, ngày giao ≤ ngày ăn, ước tính Σ phải mua × giá gần nhất bằng Decimal) → "Tạo đơn từ đề xuất" mở `/bua-trua/don-dat?don=ID` |
| `/bua-trua/don-dat` | Đơn đặt (SF63) | `?trang-thai=`, `?don=ID` (duyệt/gửi/huỷ/đóng phần còn lại, gửi kèm version, 409 → tải lại), `?tao=1` (đơn tay) |
| `/bua-trua/nhan-hang` | Nhận hàng theo đơn (SF65) | `?don=ID`; lượng ≤ phần còn chờ + đơn giá → phiếu nhập nháp → chốt |
| `/bua-trua/xuat-bep` | Xuất bếp theo ngày | `?ngay=`; tạo phiếu xuất theo nhu cầu còn thiếu → chốt; cần/đã xuất/chênh lệch |
| `/kho` | Tồn kho (SF78) | băng tranh "Mặt hàng N"; `?nhom=het-hang` hoặc `?nhom=<tên nhóm>` lọc sẵn; sắp xếp theo cột; chọn dòng → Nhập hàng/Xuất kho nhiều mặt hàng, Xem chi tiết, Xuất CSV; `?mat-hang=ID` (link cũ) chuyển sang trang chi tiết |
| `/kho/mat-hang/:id` | Chi tiết mặt hàng (SF78) | ảnh bìa (đổi được, nhớ trên trình duyệt) + card tồn/giá vốn/giá trị; tab Tổng quan · Lịch sử · Nhập kho · Xuất kho · Kiểm kê; dùng trong món |
| `/kho/phieu-nhap` | Phiếu nhập | `?tao=1` tạo nháp (`&mat-hang=1,2,3` mỗi mặt hàng một dòng, `&ncc=` điền sẵn), `?phieu=ID` xem/chốt |
| `/kho/phieu-xuat` | Phiếu xuất | như phiếu nhập |
| `/kho/kiem-ke` | Kiểm kê | phiếu đang đếm nhớ trên trình duyệt (API chưa có danh sách) |
| `/kho/danh-muc` | Danh mục & mặt hàng | `?tab=mat-hang` hoặc `danh-muc`, `?tao=1`, `?sua=ID` |
| `/mon-an` | Món & công thức | `?tao=1`, `?sua=ID`; định lượng hiện tới 6 số lẻ (0,4 g) |
| `/mon-an/thuc-don` | Thực đơn tuần (FE-04/05) | `?tuan=YYYY-MM-DD`, `?sua-thuc-don=1` (phiên bản mới từ ngày mai; ô "Có bữa trưa Thứ Bảy" bật thì thêm nhóm món T7 — SF79), `?phien-ban=ID`, `?ngay-nghi=1`; tuần có T7 xếp lưới 3×2 (6 cột từ 1600px). Ngày học trong tuần lọc bằng `isSchoolDay` (T2–T6 + T7 có ăn), không so `weekday < 5` |
| `/lop-hoc` | Lớp học | `?tao=1`, `?sua=ID` |
| `/lop-hoc/so-suat` | Số suất (FE-08) | `?ngay=`; mở ngày, nhập dự kiến/thực tế 0…sĩ số, ô trống ≠ 0, chốt/mở lại có lý do, 409 → tải lại |
| `/lop-hoc/hoc-sinh` | Học sinh (FE-06) | `?lop=ID`, `?tao=1`, `?sua=ID`, `?nhap-csv=1` (kiểm tra dry-run rồi mới lưu) |
| `/lop-hoc/thu-thuc-don` | Thư thực đơn (FE-07) | `?ngay=`; nhật ký gửi, Gửi lại (202), Gửi thử, nhãn "Chế độ thử" khi `EMAIL_MODE=dry_run` |
| `/nha-cung-cap/:id` | Nhà cung cấp | băng tranh "Nhà cung cấp N" (breadcrumb tên NCC đang mở); danh sách trái / chi tiết phải |
| `/bao-cao` | Báo cáo kho | băng tranh + card có tab mục và chọn tháng; `?thang=YYYY-MM`, `?muc=tong-quan`, `ton-kho`, `so-giao-dich` hoặc `theo-ngay` (SF70: chi phí ngày, suất thực tế, chi phí/suất, biểu đồ); bảng sắp xếp được; Xuất CSV |
| `/tai-khoan` | Tài khoản (FE-02) | chỉ Hiệu trưởng; `?tao=1`, `?sua=ID`; khoá/mở khoá, đặt lại mật khẩu |
| `/nhat-ky` | Nhật ký (FE-03) | chỉ Hiệu trưởng; `?actor=&action=&entity_type=&from=&to=&page=`, `?chi-tiet=ID` (trước → sau) |
| `/huy-nhan/:token` | Huỷ nhận email (công khai) | ngoài khung đăng nhập; chỉ gọi API khi bấm "Xác nhận huỷ nhận" |
| `/_kit` | Bộ component | chỉ bản dev |

Trạng thái mở ngăn kéo nằm trên URL để bấm Back/chia sẻ link được. Đổi nhiều tham số cùng lúc dùng `useUpdateParams` (gọi `setSearchParams` liên tiếp sẽ ghi đè nhau).

Trang `/_kit` (chỉ bản dev) liệt kê mọi component. Mở nó trước khi dựng màn mới.

## Quy tắc bắt buộc

- **Không thêm dependency.** CSS Modules (`X.module.css` cạnh `X.tsx`) + token. Không hex ngoài `tokens.css`, không `style={{…}}` trừ khi truyền giá trị động qua CSS custom property (`style={{ '--h': '72%' }}`).
- **Font**: Be Vietnam Pro cho mọi chữ. Baloo 2 (`var(--font-display)`) chỉ còn ở trang đăng nhập.
- **Truy cập**: vùng bấm tối thiểu 40–44px; nút chỉ có icon phải có `aria-label` (thanh dọc hiện tên khi rê chuột/focus); mọi ô nhập có nhãn; mọi cặp chữ/nền đạt AA (kiểm lại khi thêm token).
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
4. Rà từng màn: không ô bảng, chip hay nút nào tràn chữ hoặc bị bẻ dòng; chip không bị kéo giãn; trang không cuộn ngang (thiếu chỗ thì tăng chiều cao, không bóp chữ).
