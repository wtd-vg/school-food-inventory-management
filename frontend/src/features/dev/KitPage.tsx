/** Trang /_kit (chỉ bản dev): liệt kê mọi component và trạng thái để review giao diện. */
import { useState } from 'react';
import { IconArrowIn, IconPlus, IconPrinter, IconSearch } from '../../components/icons';
import * as Icons from '../../components/icons';
import {
  Badge,
  BulkBar,
  CoverHeader,
  FolderCard,
  InfoTiles,
  Scene,
  SCENES,
  Stat,
  Tabs,
  Thumb,
  thumbKindFor,
  TimedTask,
  Tray,
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
      <PageHeader overline="Chỉ có ở bản dev" title="Bộ component" description="Mọi thành phần giao diện và trạng thái của chúng." meta="Thứ Sáu, 2/10/2026 · 9:45" />
      <Sf78Kit />

      <Panel>
        <SectionTitle>Nút</SectionTitle>
        <div className={styles.row}>
          <Button icon={<IconPlus size={18} strokeWidth={2.4} />}>Nhập hàng</Button>
          <Button variant="secondary">Xuất kho</Button>
          <Button variant="outline">Lịch sử đơn</Button>
          <Button caret icon={<IconPlus size={18} />}>Nhập hàng</Button>
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
              <Button variant="outline" onClick={() => setDrawer(false)}>
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

/** Thành phần SF78 (bản xanh): chip, đầu trang, tab trải đều, ô key-value, việc có giờ, bảng chọn dòng, thư mục, tranh. */
function Sf78Kit() {
  const [tab, setTab] = useState<'tong-quan' | 'lich-su' | 'xuat'>('tong-quan');
  const [sel, setSel] = useState<Set<string | number>>(new Set([2]));
  return (
    <>
      <PageHeader
        variant="banner"
        scene="suong"
        breadcrumb={[{ label: 'Kho hàng', to: '/kho' }, { label: 'Tổng quan' }]}
        title="Mặt hàng"
        count={86}
        actions={<Button variant="secondary">Xuất CSV</Button>}
      />
      <CoverHeader
        breadcrumb={[{ label: 'Kho hàng', to: '/kho' }, { label: 'Gạo tẻ Bắc Hương' }]}
        title="Gạo tẻ Bắc Hương"
        badges={
          <>
            <Badge tone="ok">Đang dùng</Badge>
            <Badge>Đồ khô</Badge>
          </>
        }
        facts={[
          { value: formatQty('338.800', 'kg'), label: 'Tồn' },
          { value: formatMoney('18500.00'), label: 'Giá vốn BQ' },
          { value: '12', label: 'Giao dịch' },
        ]}
        storageKey="kit"
      />
      <Tabs
        idPrefix="kit"
        label="Mục chi tiết"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'tong-quan', label: 'Tổng quan' },
          { value: 'lich-su', label: 'Lịch sử' },
          { value: 'xuat', label: 'Xuất kho' },
        ]}
      />
      <Panel title="Chip trạng thái" action={<a href="#kit">Xem tất cả</a>} titleId="kit-chip">
        <div className={styles.row}>
          <Badge tone="info">Đang chuẩn bị</Badge>
          <Badge tone="ok">Đang hợp tác</Badge>
          <Badge tone="done">Đã nấu</Badge>
          <Badge tone="warn">Cần đặt</Badge>
          <Badge tone="danger">Hết hàng</Badge>
          <Badge tone="draft">Nháp</Badge>
          <Badge tone="review">Đang duyệt</Badge>
          <Badge tone="paused">Tạm dừng</Badge>
          <Badge>Đã huỷ</Badge>
        </div>
        <InfoTiles
          items={[
            { label: 'Nhà cung cấp', value: 'Đại lý gạo Minh Phát', to: '/nha-cung-cap' },
            { label: 'Nhập gần nhất', value: '12/09/2026' },
            { label: 'Giá trị tồn', value: formatMoney('6267800.00') },
          ]}
        />
        <div className={styles.row}>
          <Stat value="812" label="suất hôm nay" size="lg" />
          <Stat value={formatMoney('29500.00')} label="Chi phí / suất" />
        </div>
      </Panel>
      <Panel title="Việc hôm nay">
        <ul className={styles.stack}>
          <TimedTask title="Số suất" detail="Dự kiến đã chốt" period="BƯỚC" time="1" done />
          <TimedTask title="Chốt số suất dự kiến" detail="10 lớp chưa nhập" period="SÁNG" time="08:00" />
          <TimedTask title="Xuất kho cho bếp" period="SÁNG" time="09:00" fade={1} />
          <TimedTask title="Đóng ngày" period="CHIỀU" time="14:00" fade={2} />
        </ul>
      </Panel>
      <Panel title="Bảng chọn dòng + thanh thao tác hàng loạt">
        <DataTable
          caption="Mặt hàng (mẫu)"
          rows={ROWS}
          rowKey={(r) => r.id}
          selected={sel}
          onSelectedChange={setSel}
          selectLabel={(r) => r.name}
          columns={[
            {
              key: 'name',
              header: 'Mặt hàng',
              sort: (r) => r.name,
              cell: (r) => (
                <span className={tableText.thumbCell}>
                  <Thumb kind={thumbKindFor(r.group, r.name)} />
                  <span className={tableText.strong}>{r.name}</span>
                </span>
              ),
            },
            { key: 'qty', header: 'Tồn', align: 'right', sort: (r) => Number(r.qty), cell: (r) => formatQty(r.qty, r.unit) },
            { key: 'cost', header: 'Giá vốn', align: 'right', sort: (r) => Number(r.cost), cell: (r) => formatMoney(r.cost) },
          ]}
        />
        <BulkBar
          count={sel.size}
          noun="mặt hàng"
          onClear={() => setSel(new Set())}
          actions={[
            { key: 'out', label: 'Xuất kho', onClick: () => undefined, write: true },
            { key: 'view', label: 'Xem lịch sử', onClick: () => undefined },
          ]}
        />
      </Panel>
      <div className={styles.grid}>
        <FolderCard title="Phiếu nhập" meta="3 phiếu · đã chốt" to="/kho/phieu-nhap" />
        <FolderCard title="Ảnh suất ăn" meta="2 ảnh" to="/bua-trua" kind="photos" scene="dong" />
        {[1, 2, 3].map((n) => (
          <div key={n} className={styles.trayBox}>
            <Tray main={n as 1 | 2 | 3} bg={n as 1 | 2 | 3} />
          </div>
        ))}
      </div>
      <div className={styles.grid}>
        {SCENES.map((s) => (
          <div key={s.value} className={styles.sceneBox} title={s.label}>
            <Scene name={s.value} />
          </div>
        ))}
      </div>
    </>
  );
}
