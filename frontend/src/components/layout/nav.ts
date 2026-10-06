import type { ComponentType } from 'react';
import { IconBowl, IconBox, IconCart, IconClipboardList, IconFile, IconGrid, IconLock, IconTruck, IconUsers, type IconProps } from '../icons';

export type NavItem = {
  to: string;
  label: string;
  /** Nhãn ngắn cho thanh tab dưới đáy trên điện thoại. */
  short: string;
  icon: ComponentType<IconProps>;
  /** Mục sáng khi đường dẫn bắt đầu bằng một trong các tiền tố này (mặc định: `to`). */
  match?: string[];
  /** Đường dẫn khớp đúng (không tính trang con). */
  exact?: string[];
  /** Chỉ hiện khi tài khoản có quyền (FE-02/03: Hiệu trưởng). Không khai = mọi vai trò. */
  requires?: 'users' | 'audit';
};

/**
 * Thanh dọc chỉ có icon (SF78, duyệt 02/10/2026). Thứ tự theo bản thiết kế, bỏ "Kiểm thực" (ngoài phạm vi).
 * "Tổng quan" là màn Hôm nay của ngày ăn; "Đặt hàng" gom Nhu cầu → Đơn đặt → Nhận hàng.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/bua-trua', label: 'Tổng quan', short: 'Hôm nay', icon: IconGrid, exact: ['/bua-trua', '/'], match: ['/bua-trua/xuat-bep'] },
  { to: '/kho', label: 'Kho hàng', short: 'Kho', icon: IconBox },
  { to: '/mon-an/thuc-don', label: 'Thực đơn & món ăn', short: 'Món', icon: IconBowl, match: ['/mon-an'] },
  {
    to: '/bua-trua/don-dat',
    label: 'Đặt hàng',
    short: 'Đặt hàng',
    icon: IconCart,
    match: ['/bua-trua/nhu-cau', '/bua-trua/don-dat', '/bua-trua/nhan-hang'],
  },
  { to: '/lop-hoc', label: 'Lớp học & phụ huynh', short: 'Lớp', icon: IconUsers },
  { to: '/nha-cung-cap', label: 'Nhà cung cấp', short: 'NCC', icon: IconTruck },
  { to: '/bao-cao', label: 'Báo cáo', short: 'Báo cáo', icon: IconFile },
  { to: '/tai-khoan', label: 'Tài khoản', short: 'Tài khoản', icon: IconLock, requires: 'users' },
  { to: '/nhat-ky', label: 'Nhật ký', short: 'Nhật ký', icon: IconClipboardList, requires: 'audit' },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (item.exact?.includes(path)) return true;
  const prefixes = item.match ?? (item.exact ? [] : [item.to]);
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export const APP_NAME = 'SchoolFood';
export const SCHOOL_NAME = (import.meta.env.VITE_SCHOOL_NAME ?? '').trim();
