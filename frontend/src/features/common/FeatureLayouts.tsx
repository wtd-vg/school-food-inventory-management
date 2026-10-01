import { Outlet } from 'react-router-dom';
import { RouteTabs, Stack } from '../../components/ui';

export function DishesLayout() {
  return <Stack gap="lg"><RouteTabs label="Món ăn và thực đơn" items={[
    { to: '/mon-an', label: 'Món & công thức', end: true },
    { to: '/mon-an/thuc-don', label: 'Thực đơn tuần' },
  ]} /><Outlet /></Stack>;
}

export function ClassesLayout() {
  return <Stack gap="lg"><RouteTabs label="Lớp học và bữa trưa" items={[
    { to: '/lop-hoc', label: 'Lớp học', end: true },
    { to: '/lop-hoc/hoc-sinh', label: 'Học sinh' },
    { to: '/lop-hoc/thu-thuc-don', label: 'Thư thực đơn' },
    { to: '/lop-hoc/so-suat', label: 'Số suất' },
  ]} /><Outlet /></Stack>;
}
