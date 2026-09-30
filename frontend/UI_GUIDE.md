# Hướng dẫn giao diện SchoolFood

Dành cho thành viên và agent khi thêm hoặc sửa màn hình. Nguồn thiết kế: `design/FRONTEND_PROMPT.md` và `design/reference/*` (bản "Bếp Nhà Trường"). Quyết định áp dụng (duyệt 01/10/2026): dùng **đúng** token, font, component và khung trang; **bố cục từng màn** thiết kế lại cho hợp dữ liệu thật; tên hiển thị là **SchoolFood**.

## Cấu trúc

```text
src/
  styles/        tokens.css (nơi DUY NHẤT có mã màu), base.css, fonts.css (font tự host)
  lib/           format.ts (hiển thị vi-VN), decimal.ts (tính Decimal bằng BigInt), http.ts (gọi API + lỗi tiếng Việt)
  auth/          AuthContext (me, role, login/logout, session-expired), RequireAuth
  components/
    icons/       SVG inline, 24×24, stroke currentColor
    ui/          Button, Field, Display (Badge, Callout, Segmented, RouteTabs, PageHeader…), DataTable, Overlay (Drawer, Modal, ConfirmDialog, Toast)
    layout/      AppShell (sidebar 232 → chỉ icon <1280 → tab dưới <768), nav.ts
  features/      mỗi nghiệp vụ một thư mục: auth, inventory, dishes, classes, suppliers, reports
```

Trang `/_kit` (chỉ bản dev) liệt kê mọi component. Mở nó trước khi dựng màn mới.

## Quy tắc bắt buộc

- **Không thêm dependency.** CSS Modules (`X.module.css` cạnh `X.tsx`) + token. Không hex ngoài `tokens.css`, không `style={{…}}` trừ khi truyền giá trị động qua CSS custom property (`style={{ '--h': '72%' }}`).
- **Font**: Be Vietnam Pro cho mọi chữ. Baloo 2 (`var(--font-display)`) chỉ dùng cho chữ logo.
- **Số liệu**: API trả Decimal dạng chuỗi. Hiển thị qua `formatQty`, `formatMoney`, `formatDate`…; không `Number()` / `parseFloat` rồi cộng tiền. Cần tổng tạm tính trên form thì dùng `lib/decimal.ts`. Ô nhập số kiểm tra bằng `normalizeDecimalInput` (lượng 3 chữ số lẻ, tiền 2) rồi gửi **chuỗi**.
- **Gọi API** bằng `api.get/post/patch` trong `lib/http.ts`. Lỗi là `ApiError` có câu tiếng Việt; hiển thị bằng `messageOf(err)`.
- **Quyền**: nút ghi dùng `<Button write>`. Viewer thấy nút bị khoá kèm icon ổ khoá và tooltip "Tài khoản chỉ xem"; **không ẩn nút**. Backend vẫn là nơi chặn (403).
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
3. Chạy app, thao tác bằng tài khoản manager **và** viewer; đi hết bằng bàn phím; xem ở 1440, 1024, 375 px.
