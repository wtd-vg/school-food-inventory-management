/**
 * Tab con của các màn có nhiều mục (FE-04…FE-08). Mỗi trang tự đặt PageHeader rồi tới hàng tab,
 * giống bố cục Kho hàng (InventoryLayout).
 */
import { RouteTabs } from '../../components/ui';

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

export function DishTabs() {
  return <RouteTabs label="Các mục trong Món ăn" items={DISH_TABS} />;
}

export function ClassTabs() {
  return <RouteTabs label="Các mục trong Lớp học" items={CLASS_TABS} />;
}
