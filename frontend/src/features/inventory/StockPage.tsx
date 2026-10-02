/**
 * Tồn kho (SF78, bản thiết kế "Kho hàng"). Không có lô/hạn dùng (ngoài phạm vi): cột là dữ liệu thật
 * (tồn, giá vốn BQ, giá trị, NCC và ngày của lần nhập gần nhất). Bấm tên → trang chi tiết mặt hàng.
 * Chọn dòng → thanh thao tác: nhập/xuất nhiều mặt hàng một lần, xem chi tiết, xuất CSV.
 * ?nhom=het-hang hoặc ?nhom=<tên nhóm> lọc sẵn (chuông "Cần chú ý" dùng). ?mat-hang=ID (link cũ) chuyển sang trang chi tiết.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { IconArrowIn, IconArrowOut, IconDownload, IconInfo } from '../../components/icons';
import {
  Badge,
  BulkBar,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Lead,
  Pagination,
  Panel,
  SearchField,
  Segmented,
  Skeleton,
  Thumb,
  sortRows,
  tableText,
  thumbKindFor,
  type Column,
  type SortState,
} from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { parseDec, sum, toFixed } from '../../lib/decimal';
import { formatMoney, formatMoneyShort, formatQty, formatShortDate, todayISO } from '../../lib/format';
import { matchesQuery } from '../../lib/text';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi, type Food, type StockRow } from '../../services/inventory';
import { useInventoryCount } from './InventoryLayout';
import { useQueryParam } from './shared';
import styles from './StockPage.module.css';

const PAGE_SIZE = 12;
type Row = StockRow & { is_active: boolean; empty: boolean; lastIn: { date: string; supplier: string; supplierId: number } | null };

function isZero(value: string) {
  const d = parseDec(value);
  return !d || d.v === 0n;
}

/** Số để sắp xếp (không dùng để tính tiền). */
const num = (v: string) => Number(v) || 0;

function statusBadge(row: Row) {
  if (!row.is_active) return <Badge>Ngừng dùng</Badge>;
  if (row.empty) return <Badge tone="danger">Hết hàng</Badge>;
  return <span className={tableText.muted}>—</span>;
}

export function StockPage() {
  const navigate = useNavigate();
  const query = useApiQuery(() => Promise.all([inventoryApi.stock(), inventoryApi.foods(), inventoryApi.receipts(), inventoryApi.suppliers()]), []);
  const [group, setGroup] = useQueryParam('nhom', 'all');
  const [legacyFood] = useQueryParam('mat-hang');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(null);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const setCount = useInventoryCount();

  const rows = useMemo<Row[]>(() => {
    if (!query.data) return [];
    const [stock, foods, receipts, suppliers] = query.data;
    const active = new Map<number, Food>(foods.map((f) => [f.id, f]));
    const supplierName = new Map(suppliers.map((x) => [x.id, x.name]));
    // Lần nhập gần nhất của từng mặt hàng: phiếu đã chốt, ngày mới nhất (cùng ngày lấy phiếu sau).
    const lastIn = new Map<number, Row['lastIn']>();
    for (const r of [...receipts].filter((x) => x.status === 'POSTED').sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
      for (const l of r.lines) lastIn.set(l.food_id, { date: r.date, supplierId: r.supplier_id, supplier: r.supplier_name ?? supplierName.get(r.supplier_id) ?? '—' });
    }
    return stock
      .map((s) => ({ ...s, is_active: active.get(s.id)?.is_active ?? true, empty: isZero(s.quantity), lastIn: lastIn.get(s.id) ?? null }))
      .sort((a, b) => {
        // Mặc định: cần chú ý trước (đang dùng mà hết hàng), rồi theo tên.
        const rank = (r: Row) => (r.is_active && r.empty ? 0 : r.is_active ? 1 : 2);
        return rank(a) - rank(b) || a.name.localeCompare(b.name, 'vi');
      });
  }, [query.data]);

  useEffect(() => {
    setCount(query.data ? rows.length : undefined);
    return () => setCount(undefined);
  }, [rows.length, query.data, setCount]);

  const groups = useMemo(() => {
    const names = Array.from(new Set(rows.map((r) => r.category_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
    const outCount = rows.filter((r) => r.is_active && r.empty).length;
    return [
      { value: 'all', label: 'Tất cả' },
      ...names.map((n) => ({ value: n, label: n })),
      ...(outCount ? [{ value: 'het-hang', label: 'Hết hàng', count: outCount }] : []),
    ];
  }, [rows]);

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Mặt hàng',
      width: '21%',
      sort: (r) => r.name,
      cell: (r) => (
        <span className={tableText.thumbCell}>
          <Thumb kind={thumbKindFor(r.category_name, r.name)} />
          <Link className={tableText.rowButton} to={`/kho/mat-hang/${r.id}`} title={`${r.name} · ${r.category_name}`}>
            {r.name}
          </Link>
        </span>
      ),
    },
    { key: 'code', header: 'Mã', width: '10%', sort: (r) => r.code, cell: (r) => <span className={tableText.muted}>{r.code}</span> },
    {
      key: 'status',
      header: 'Trạng thái',
      width: '12%',
      sort: (r) => (r.is_active && r.empty ? 0 : !r.is_active ? 1 : 2),
      cell: statusBadge,
    },
    { key: 'qty', header: 'Tồn', width: '10%', align: 'right', sort: (r) => num(r.quantity), cell: (r) => <span className={tableText.strong}>{formatQty(r.quantity, r.unit)}</span> },
    { key: 'cost', header: 'Giá vốn BQ', width: '11%', align: 'right', sort: (r) => num(r.avg_cost), cell: (r) => <span className={tableText.muted}>{formatMoney(r.avg_cost)}</span> },
    { key: 'value', header: 'Giá trị tồn', width: '12%', align: 'right', sort: (r) => num(r.stock_value), cell: (r) => formatMoney(r.stock_value) },
    { key: 'supplier', header: 'Nhà cung cấp', width: '16%', sort: (r) => r.lastIn?.supplier, cell: (r) => r.lastIn?.supplier ?? <span className={tableText.muted}>—</span> },
    {
      key: 'lastIn',
      header: 'Nhập',
      width: '8%',
      align: 'right',
      sort: (r) => r.lastIn?.date,
      cell: (r) => (r.lastIn ? <span title={`Nhập gần nhất ${r.lastIn.date.split('-').reverse().join('/')}`}>{formatShortDate(r.lastIn.date)}</span> : <span className={tableText.muted}>—</span>),
    },
  ];

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (group === 'het-hang' && !(r.is_active && r.empty)) return false;
        if (group !== 'all' && group !== 'het-hang' && r.category_name !== group) return false;
        return matchesQuery(search, r.name, r.code, r.category_name);
      }),
    [rows, group, search],
  );
  // Sắp xếp trước rồi mới cắt trang (sắp xếp áp cho toàn bộ kết quả lọc, không chỉ trang đang xem).
  const sorted = useMemo(() => sortRows(filtered, columns, sort), [filtered, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  if (legacyFood && /^\d+$/.test(legacyFood)) return <Navigate to={`/kho/mat-hang/${legacyFood}`} replace />;

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const totalValue = toFixed(sum(rows.map((r) => parseDec(r.stock_value) ?? { v: 0n, s: 0 })), 2);
  const outCount = rows.filter((r) => r.is_active && r.empty).length;
  const picked = rows.filter((r) => selected.has(r.id));
  const ids = (list: Row[]) => list.map((r) => r.id).join(',');
  const canIssue = picked.filter((r) => r.is_active && !r.empty);
  const canReceive = picked.filter((r) => r.is_active);

  const exportPicked = () =>
    downloadCsv(`ton-kho-${todayISO()}.csv`, [
      ['Mã', 'Mặt hàng', 'Nhóm', 'Tồn', 'Đơn vị', 'Giá vốn BQ', 'Giá trị tồn', 'NCC gần nhất', 'Ngày nhập gần nhất'],
      ...picked.map((r) => [r.code, r.name, r.category_name, r.quantity, r.unit, r.avg_cost, r.stock_value, r.lastIn?.supplier ?? '', r.lastIn?.date ?? '']),
    ]);

  return (
    <>
      {query.data ? (
        <Lead>
          <strong>{rows.length}</strong> mặt hàng · giá trị tồn <strong>{formatMoneyShort(totalValue)}</strong>
          {outCount ? (
            <>
              {' '}
              · <strong>{outCount}</strong> mặt hàng đang hết
            </>
          ) : null}
        </Lead>
      ) : null}
      <Panel>
        <div className={styles.toolbar}>
          <SearchField
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Tìm mặt hàng hoặc mã…"
          />
          <Segmented
            label="Lọc theo nhóm hàng"
            options={groups}
            value={groups.some((g) => g.value === group) ? group : 'all'}
            onChange={(v) => {
              setGroup(v === 'all' ? null : v);
              setPage(1);
            }}
          />
        </div>

        {query.loading ? (
          <Skeleton rows={8} />
        ) : query.error ? (
          <ErrorState message={query.error} onRetry={query.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Kho chưa có mặt hàng nào"
            action={
              <Button write onClick={() => navigate('/kho/danh-muc?tab=mat-hang&tao=1')}>
                Thêm mặt hàng
              </Button>
            }
          >
            Tạo danh mục và mặt hàng trước, rồi nhập hàng để có tồn kho.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="Không có mặt hàng phù hợp">Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm.</EmptyState>
        ) : (
          <>
            <DataTable
              caption="Tồn kho theo mặt hàng"
              rows={visible}
              rowKey={(r) => r.id}
              columns={columns}
              minWidth="1040px"
              selected={selected}
              onSelectedChange={setSelected}
              selectLabel={(r) => r.name}
              sort={sort}
              onSortChange={(s) => {
                setSort(s);
                setPage(1);
              }}
            />
            <Pagination
              page={current}
              pageCount={pageCount}
              onPageChange={setPage}
              summary={`Đang hiện ${visible.length} trong ${filtered.length} mặt hàng${sort ? '' : ', mặt hàng cần chú ý lên trước'}`}
            />
          </>
        )}
      </Panel>

      <BulkBar
        count={selected.size}
        noun="mặt hàng"
        onClear={() => setSelected(new Set())}
        actions={[
          {
            key: 'in',
            label: 'Nhập hàng',
            icon: <IconArrowIn size={16} />,
            write: true,
            disabled: canReceive.length === 0,
            hint: canReceive.length ? undefined : 'Mặt hàng đã chọn đều ngừng dùng',
            onClick: () => navigate(`/kho/phieu-nhap?tao=1&mat-hang=${ids(canReceive)}`),
          },
          {
            key: 'out',
            label: 'Xuất kho',
            icon: <IconArrowOut size={16} />,
            write: true,
            disabled: canIssue.length === 0,
            hint: canIssue.length ? undefined : 'Mặt hàng đã chọn đều đang hết hoặc ngừng dùng',
            onClick: () => navigate(`/kho/phieu-xuat?tao=1&mat-hang=${ids(canIssue)}`),
          },
          {
            key: 'view',
            label: 'Xem chi tiết',
            icon: <IconInfo size={16} />,
            disabled: picked.length !== 1,
            hint: picked.length === 1 ? undefined : 'Chọn đúng 1 mặt hàng',
            onClick: () => navigate(`/kho/mat-hang/${picked[0].id}`),
          },
          { key: 'csv', label: 'Xuất CSV', icon: <IconDownload size={16} />, disabled: picked.length === 0, onClick: exportPicked },
        ]}
      />
    </>
  );
}
