/** Trang /_kit (chỉ bản dev): liệt kê mọi component và trạng thái để review giao diện. */
import { useState } from 'react';
import { IconArrowIn, IconCheck, IconChart, IconPlus, IconPrinter, IconSearch, IconUsers } from '../../components/icons';
import * as Icons from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  IconButton,
  KeyValueList,
  OkText,
  PageHeader,
  Pagination,
  Panel,
  SearchField,
  SectionTitle,
  Segmented,
  SelectField,
  Skeleton,
  StatGrid,
  StatTile,
  TextareaField,
  TextField,
  tableText,
  useToast,
} from '../../components/ui';
import { formatDate, formatMoney, formatQty } from '../../lib/format';
import styles from './KitPage.module.css';

type Row = { id: number; name: string; group: string; qty: string; unit: string; cost: string };
const ROWS: Row[] = [
  { id: 1, name: 'Gạo tẻ Bắc Hương', group: 'Đồ khô', qty: '338.800', unit: 'kg', cost: '18500.00' },
  { id: 2, name: 'Sữa tươi tiệt trùng 180ml', group: 'Sữa', qty: '38.000', unit: 'thùng', cost: '295000.00' },
  { id: 3, name: 'Dầu ăn thực vật', group: 'Đồ khô', qty: '8.000', unit: 'lit', cost: '42000.00' },
];

export default function KitPage() {
  const [seg, setSeg] = useState<'all' | 'veg' | 'meat'>('all');
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [page, setPage] = useState(1);
  const toast = useToast();
  const iconEntries = Object.entries(Icons).filter(([k]) => k.startsWith('Icon'));

  return (
    <>
      <PageHeader overline="Chỉ có ở bản dev" title="Bộ component" description="Mọi thành phần giao diện và trạng thái của chúng." />

      <StatGrid label="Ô số liệu mẫu">
        <StatTile label="Suất dự kiến" value="195" hint="đã chốt" icon={<IconUsers size={18} />} tone="accent" />
        <StatTile label="Suất thực tế" value="chưa chốt" muted icon={<IconCheck size={18} />} tone="ok" />
        <StatTile label="Chi phí / suất" value="18.262 đ" icon={<IconChart size={18} />} tone="warn" />
        <StatTile label="Trạng thái" value="Đang xuất bếp" icon={<IconArrowIn size={18} />} tone="info" />
      </StatGrid>

      <Panel>
        <SectionTitle>Nút</SectionTitle>
        <div className={styles.row}>
          <Button icon={<IconPlus size={18} strokeWidth={2.4} />}>Nhập hàng</Button>
          <Button variant="secondary">Xuất kho</Button>
          <Button variant="ghost">Bỏ qua</Button>
          <Button variant="danger">Ngừng dùng</Button>
          <Button size="sm">Nhỏ</Button>
          <Button busy>Đang lưu</Button>
          <Button disabled>Vô hiệu</Button>
          <Button write>Ghi (Hiệu trưởng bị khoá)</Button>
          <IconButton label="In tem">
            <IconPrinter size={20} />
          </IconButton>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Nhãn & thông báo</SectionTitle>
        <div className={styles.row}>
          <Badge tone="danger">Hết hạn hôm nay</Badge>
          <Badge tone="warn">Dưới mức tối thiểu</Badge>
          <Badge tone="info">Đang nấu</Badge>
          <Badge tone="ok">Đã chốt</Badge>
          <Badge>Nháp</Badge>
          <OkText>Đạt</OkText>
        </div>
        <div className={styles.stack}>
          <Callout tone="warn">Sữa tươi còn 38 thùng, dùng hết trước thứ Năm 01/10.</Callout>
          <Callout tone="info" title="Lưu ý">
            Nháp không làm thay đổi tồn kho.
          </Callout>
          <ErrorState message="Không kết nối được máy chủ." onRetry={() => toast.show('Đã thử lại')} />
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => toast.show('Đã chốt phiếu nhập.')}>
              Toast thành công
            </Button>
            <Button variant="secondary" onClick={() => toast.show('Không đủ tồn kho.', 'error')}>
              Toast lỗi
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Ô nhập</SectionTitle>
        <div className={styles.grid}>
          <TextField label="Tên mặt hàng" placeholder="Ví dụ: Gạo tẻ" required />
          <TextField label="Số lượng" numeric suffix="kg" defaultValue="12,5" hint="Tối đa 3 chữ số lẻ." />
          <TextField label="Đơn giá" numeric suffix="đ" error="Đơn giá phải lớn hơn 0." defaultValue="0" />
          <SelectField label="Nhà cung cấp" defaultValue="">
            <option value="">Chọn nhà cung cấp</option>
            <option>HTX rau An Lão</option>
          </SelectField>
          <TextareaField label="Ghi chú" placeholder="Nhập buổi sáng" />
          <div className={styles.stack}>
            <Checkbox label="Đang sử dụng" defaultChecked />
            <SearchField value={q} onValueChange={setQ} placeholder="Tìm mặt hàng hoặc lô…" />
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Lọc & bảng</SectionTitle>
        <div className={styles.stack}>
          <Segmented
            label="Nhóm hàng"
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'veg', label: 'Rau củ quả' },
              { value: 'meat', label: 'Thịt, cá, trứng', count: 3 },
            ]}
          />
          <DataTable
            caption="Bảng mẫu"
            rows={ROWS}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'name',
                header: 'Mặt hàng',
                width: '40%',
                cell: (r) => (
                  <>
                    <button type="button" className={tableText.rowButton} onClick={() => setDrawer(true)}>
                      {r.name}
                    </button>
                    <span className={tableText.secondaryText}>{r.group}</span>
                  </>
                ),
              },
              { key: 'qty', header: 'Tồn', align: 'right', cell: (r) => <strong>{formatQty(r.qty, r.unit)}</strong> },
              { key: 'cost', header: 'Giá vốn BQ', align: 'right', cell: (r) => formatMoney(r.cost) },
            ]}
          />
          <Pagination page={page} pageCount={3} onPageChange={setPage} summary="Đang hiện 3 trong 9 mặt hàng" />
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Trạng thái</SectionTitle>
        <div className={styles.grid}>
          <Skeleton rows={3} />
          <EmptyState title="Chưa có phiếu nhập nào" action={<Button icon={<IconArrowIn size={18} />}>Tạo phiếu nhập</Button>}>
            Phiếu nhập giúp theo dõi hàng về và giá vốn.
          </EmptyState>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Hộp thoại</SectionTitle>
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setDrawer(true)}>
            Mở ngăn kéo
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            Mở hộp xác nhận
          </Button>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Icon</SectionTitle>
        <ul className={styles.icons}>
          {iconEntries.map(([name, Icon]) => {
            const C = Icon as typeof IconSearch;
            return (
              <li key={name}>
                <C size={22} />
                <span>{name.replace('Icon', '')}</span>
              </li>
            );
          })}
        </ul>
      </Panel>

      {drawer ? (
        <Drawer
          kicker="Mã GAO01 · Đồ khô"
          title="Gạo tẻ Bắc Hương"
          subtitle={`Cập nhật ${formatDate('2026-10-01')}`}
          onClose={() => setDrawer(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDrawer(false)}>
                Đóng
              </Button>
              <Button write>Xuất kho</Button>
            </>
          }
        >
          <KeyValueList
            items={[
              { label: 'Tồn hiện tại', value: formatQty('338.800', 'kg') },
              { label: 'Giá vốn bình quân', value: formatMoney('18500.00') },
              { label: 'Giá trị tồn', value: formatMoney('6267800.00') },
            ]}
          />
        </Drawer>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title="Chốt phiếu nhập #12?"
          confirmLabel="Chốt phiếu"
          onConfirm={() => {
            setConfirm(false);
            toast.show('Đã chốt phiếu nhập.');
          }}
          onCancel={() => setConfirm(false)}
        >
          Sau khi chốt, tồn kho và giá vốn được cập nhật và phiếu không sửa được nữa.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
