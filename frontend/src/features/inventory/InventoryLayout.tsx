import { useState } from 'react';
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { IconArrowIn, IconArrowOut, IconTruck } from '../../components/icons';
import { Button, MenuButton, PageHeader, RouteTabs } from '../../components/ui';

export const INVENTORY_TABS = [
  { to: '/kho', label: 'Tồn kho', end: true },
  { to: '/kho/phieu-nhap', label: 'Phiếu nhập' },
  { to: '/kho/phieu-xuat', label: 'Phiếu xuất' },
  { to: '/kho/kiem-ke', label: 'Kiểm kê' },
  { to: '/kho/danh-muc', label: 'Danh mục & mặt hàng' },
];

/** Tiêu đề băng tranh theo tab: tab Tồn kho gọi là "Mặt hàng" như bản thiết kế. */
const TITLES: Record<string, string> = {
  '/kho': 'Mặt hàng',
  '/kho/phieu-nhap': 'Phiếu nhập',
  '/kho/phieu-xuat': 'Phiếu xuất',
  '/kho/kiem-ke': 'Kiểm kê',
  '/kho/danh-muc': 'Danh mục & mặt hàng',
};

/** Trang con báo số lượng cho băng tranh ("Mặt hàng 86") qua outlet context. */
export type InventoryOutlet = { setCount: (n: number | undefined) => void };
export function useInventoryCount(): InventoryOutlet['setCount'] {
  return useOutletContext<InventoryOutlet | undefined>()?.setCount ?? (() => undefined);
}

/** Màn Kho hàng (SF78): băng tranh (breadcrumb, tiêu đề + số lượng, Xuất kho / Nhập hàng ▾), tab con bên dưới. */
export function InventoryLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [count, setCount] = useState<number | undefined>(undefined);
  const path = pathname.replace(/\/+$/, '') || '/kho';
  const title = TITLES[path] ?? 'Kho hàng';
  const tab = INVENTORY_TABS.find((t) => t.to === path)?.label ?? 'Tổng quan';
  return (
    <>
      <PageHeader
        variant="banner"
        scene="suong"
        breadcrumb={[{ label: 'Kho hàng', to: '/kho' }, { label: tab }]}
        title={title}
        count={path === '/kho' ? count : undefined}
        actions={
          <>
            <Button variant="secondary" icon={<IconArrowOut size={18} />} write onClick={() => navigate('/kho/phieu-xuat?tao=1')}>
              Xuất kho
            </Button>
            <MenuButton
              label="Nhập hàng"
              icon={<IconArrowIn size={18} />}
              write
              items={[
                { key: 'le', label: 'Phiếu nhập', hint: 'Nhập lẻ, chọn nhà cung cấp và đơn giá', icon: <IconArrowIn size={16} />, onSelect: () => navigate('/kho/phieu-nhap?tao=1') },
                { key: 'don', label: 'Nhận hàng theo đơn', hint: 'Hàng về theo đơn đặt đã gửi NCC', icon: <IconTruck size={16} />, onSelect: () => navigate('/bua-trua/nhan-hang') },
              ]}
            />
          </>
        }
      />
      <RouteTabs label="Các mục trong Kho hàng" items={INVENTORY_TABS} />
      <Outlet context={{ setCount } satisfies InventoryOutlet} />
    </>
  );
}
