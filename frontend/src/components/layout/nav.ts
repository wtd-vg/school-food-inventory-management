import type { ComponentType } from 'react';
import { IconBowl, IconBox, IconChart, IconClipboardList, IconLock, IconTruck, IconUsers, type IconProps } from '../icons';

export type NavItem = {
  to: string;
  label: string;
  /** Nhãn ngắn cho thanh tab dưới đáy trên điện thoại. */
  short: string;
  icon: ComponentType<IconProps>;
  /** Chỉ hiện khi tài khoản có quyền (FE-02/03: Hiệu trưởng). Không khai = mọi vai trò. */
  requires?: 'users' | 'audit';
};

/** Điều hướng chính (gom theo công việc, đã duyệt 01/10/2026). */
export const NAV_ITEMS: NavItem[] = [
  { to: '/kho', label: 'Kho hàng', short: 'Kho', icon: IconBox },
  { to: '/mon-an', label: 'Món & công thức', short: 'Món ăn', icon: IconBowl },
  { to: '/lop-hoc', label: 'Lớp học', short: 'Lớp', icon: IconUsers },
  { to: '/nha-cung-cap', label: 'Nhà cung cấp', short: 'NCC', icon: IconTruck },
  { to: '/bao-cao', label: 'Báo cáo', short: 'Báo cáo', icon: IconChart },
  { to: '/tai-khoan', label: 'Tài khoản', short: 'Tài khoản', icon: IconLock, requires: 'users' },
  { to: '/nhat-ky', label: 'Nhật ký', short: 'Nhật ký', icon: IconClipboardList, requires: 'audit' },
];

export const APP_NAME = 'SchoolFood';
export const SCHOOL_NAME = (import.meta.env.VITE_SCHOOL_NAME ?? '').trim();
