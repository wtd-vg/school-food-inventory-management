import { Outlet, useNavigate } from 'react-router-dom';
import { IconArrowOut, IconPlus } from '../../components/icons';
import { Button, PageHeader, RouteTabs } from '../../components/ui';

export const INVENTORY_TABS = [
  { to: '/kho', label: 'Tồn kho', end: true },
  { to: '/kho/phieu-nhap', label: 'Phiếu nhập' },
  { to: '/kho/phieu-xuat', label: 'Phiếu xuất' },
  { to: '/kho/kiem-ke', label: 'Kiểm kê' },
  { to: '/kho/danh-muc', label: 'Danh mục & mặt hàng' },
];

/** Màn Kho hàng (bản vẽ 02): tiêu đề + nút Xuất kho / Nhập hàng, các tab con bên dưới. */
export function InventoryLayout() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Kho hàng"
        actions={
          <>
            <Button variant="secondary" icon={<IconArrowOut size={18} />} write onClick={() => navigate('/kho/phieu-xuat?tao=1')}>
              Xuất kho
            </Button>
            <Button icon={<IconPlus size={18} strokeWidth={2.4} />} write onClick={() => navigate('/kho/phieu-nhap?tao=1')}>
              Nhập hàng
            </Button>
          </>
        }
      />
      <RouteTabs label="Các mục trong Kho hàng" items={INVENTORY_TABS} />
      <Outlet />
    </>
  );
}
