/**
 * Tab con của các màn có nhiều mục (FE-04…FE-08). Mỗi trang tự đặt PageHeader rồi tới hàng tab,
 * giống bố cục Kho hàng (InventoryLayout).
 */
import { RouteTabs, type Crumb } from '../../components/ui';

export const DISH_TABS = [
  { to: '/mon-an', label: 'Món & công thức', end: true },
  { to: '/mon-an/thuc-don', label: 'Thực đơn tuần' },
];

export const CLASS_TABS = [
  { to: '/lop-hoc', label: 'Lớp học', end: true },
  { to: '/lop-hoc/so-suat', label: 'Số suất' },
  { to: '/lop-hoc/hoc-sinh', label: 'Học sinh' },
  { to: '/lop-hoc/thu-thuc-don', label: 'Thư thực đơn' },
];

/** G2 (SF57–SF69): mọi tab giữ ?ngay= để chuyển qua lại vẫn đúng ngày ăn. */
export const LUNCH_TABS = [
  { to: '/bua-trua', label: 'Tổng quan', end: true },
  { to: '/bua-trua/nhu-cau', label: 'Nhu cầu & đề xuất' },
  { to: '/bua-trua/don-dat', label: 'Đơn đặt' },
  { to: '/bua-trua/nhan-hang', label: 'Nhận hàng' },
  { to: '/bua-trua/xuat-bep', label: 'Xuất bếp' },
];

export function LunchTabs({ date }: { date?: string }) {
  const suffix = date ? `?ngay=${date}` : '';
  return (
    <RouteTabs
      label="Các bước bữa trưa"
      items={LUNCH_TABS.map((t) => ({ ...t, to: t.to === '/bua-trua/don-dat' || t.to === '/bua-trua/nhan-hang' ? t.to : t.to + suffix }))}
    />
  );
}

/** Breadcrumb cho băng tranh các trang Thực đơn & món ăn. */
export function dishCrumbs(label: string): Crumb[] {
  return [{ label: 'Thực đơn & món ăn', to: '/mon-an/thuc-don' }, { label }];
}

export function DishTabs() {
  return <RouteTabs label="Các mục trong Món ăn" items={DISH_TABS} />;
}

/** Breadcrumb cho băng tranh các trang Lớp học & phụ huynh. */
export function classCrumbs(label: string): Crumb[] {
  return [{ label: 'Lớp học & phụ huynh', to: '/lop-hoc' }, { label }];
}

export function ClassTabs() {
  return <RouteTabs label="Các mục trong Lớp học" items={CLASS_TABS} />;
}
