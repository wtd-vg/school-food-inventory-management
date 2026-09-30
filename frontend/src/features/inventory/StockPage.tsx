/**
 * Tồn kho (bản vẽ 02 Kho hàng). Không có lô/hạn dùng (ngoài phạm vi): cột dùng dữ liệu thật,
 * bấm tên mặt hàng mở ngăn kéo lịch sử giao dịch IN/OUT/ADJUST thay cho "chi tiết lô".
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconArrowIn, IconArrowOut, IconBox } from '../../components/icons';
import {
  Badge,
  Button,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  KeyValueList,
  Lead,
  Pagination,
  SearchField,
  Segmented,
  Skeleton,
  Stack,
  Toolbar,
  tableText,
  type Column,
} from '../../components/ui';
import { parseDec, sum, toFixed } from '../../lib/decimal';
import { formatDate, formatMoney, formatMoneyShort, formatQty, unitLabel } from '../../lib/format';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi, TX_LABELS, txReference, type Food, type StockRow, type Transaction } from '../../services/inventory';
import { useQueryParam } from './shared';
import styles from './StockPage.module.css';

const PAGE_SIZE = 12;
type Row = StockRow & { is_active: boolean; empty: boolean };

function isZero(value: string) {
  const d = parseDec(value);
  return !d || d.v === 0n;
}

function statusBadge(row: Row) {
  if (!row.is_active) return <Badge>Ngừng dùng</Badge>;
  if (row.empty) return <Badge tone="danger">Hết hàng</Badge>;
  return null;
}

export function StockPage() {
  const navigate = useNavigate();
  const query = useApiQuery(() => Promise.all([inventoryApi.stock(), inventoryApi.foods()]), []);
  const [group, setGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [foodParam, setFoodParam] = useQueryParam('mat-hang');

  const rows = useMemo<Row[]>(() => {
    if (!query.data) return [];
    const [stock, foods] = query.data;
    const active = new Map<number, Food>(foods.map((f) => [f.id, f]));
    return stock
      .map((s) => ({ ...s, is_active: active.get(s.id)?.is_active ?? true, empty: isZero(s.quantity) }))
      .sort((a, b) => {
        // Cần chú ý trước: đang dùng mà hết hàng, rồi tới theo tên.
        const rank = (r: Row) => (r.is_active && r.empty ? 0 : r.is_active ? 1 : 2);
        return rank(a) - rank(b) || a.name.localeCompare(b.name, 'vi');
      });
  }, [query.data]);

  const groups = useMemo(() => {
    const names = Array.from(new Set(rows.map((r) => r.category_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
    const outCount = rows.filter((r) => r.is_active && r.empty).length;
    return [
      { value: 'all', label: 'Tất cả' },
      ...names.map((n) => ({ value: `cat:${n}`, label: n })),
      ...(outCount ? [{ value: 'out', label: 'Hết hàng', count: outCount }] : []),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (group === 'out' && !(r.is_active && r.empty)) return false;
      if (group.startsWith('cat:') && r.category_name !== group.slice(4)) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.category_name.toLowerCase().includes(q);
    });
  }, [rows, group, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const totalValue = toFixed(sum(rows.map((r) => parseDec(r.stock_value) ?? { v: 0n, s: 0 })), 2);
  const outCount = rows.filter((r) => r.is_active && r.empty).length;
  const selected = rows.find((r) => String(r.id) === foodParam) ?? null;

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Mặt hàng',
      width: '34%',
      cell: (r) => (
        <>
          <button type="button" className={tableText.rowButton} onClick={() => setFoodParam(String(r.id))}>
            {r.name}
          </button>
          <span className={tableText.secondaryText}>{r.category_name}</span>
        </>
      ),
    },
    { key: 'code', header: 'Mã', width: '11%', cell: (r) => <span className={tableText.muted}>{r.code}</span> },
    { key: 'qty', header: 'Tồn', width: '14%', align: 'right', cell: (r) => <span className={tableText.strong}>{formatQty(r.quantity, r.unit)}</span> },
    { key: 'cost', header: 'Giá vốn BQ', width: '14%', align: 'right', cell: (r) => <span className={tableText.muted}>{formatMoney(r.avg_cost)}</span> },
    { key: 'value', header: 'Giá trị tồn', width: '14%', align: 'right', cell: (r) => formatMoney(r.stock_value) },
    { key: 'status', header: 'Cần chú ý', width: '13%', cell: statusBadge },
  ];

  return (
    <Stack gap="lg">
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

      <Toolbar>
        <Segmented
          label="Lọc theo nhóm hàng"
          options={groups}
          value={group}
          onChange={(v) => {
            setGroup(v);
            setPage(1);
          }}
        />
        <SearchField
          value={search}
          onValueChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Tìm mặt hàng hoặc mã…"
        />
      </Toolbar>

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
          <DataTable caption="Tồn kho theo mặt hàng" rows={visible} rowKey={(r) => r.id} columns={columns} minWidth="820px" />
          <Pagination
            page={current}
            pageCount={pageCount}
            onPageChange={setPage}
            summary={`Đang hiện ${visible.length} trong ${filtered.length} mặt hàng, sắp theo mức cần chú ý`}
          />
        </>
      )}

      {selected ? <FoodDrawer row={selected} onClose={() => setFoodParam(null)} /> : null}
    </Stack>
  );
}

function FoodDrawer({ row, onClose }: { row: Row; onClose: () => void }) {
  const navigate = useNavigate();
  const history = useApiQuery(() => inventoryApi.transactions({ food: row.id }), [row.id]);
  const txs: Transaction[] = history.data ? [...history.data].reverse() : [];

  return (
    <Drawer
      kicker={`Mã ${row.code} · ${row.category_name}`}
      title={row.name}
      subtitle={row.is_active ? `Đơn vị tính: ${unitLabel(row.unit)}` : 'Đã ngừng dùng'}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            icon={<IconArrowOut size={18} />}
            write
            disabled={row.empty || !row.is_active}
            onClick={() => navigate(`/kho/phieu-xuat?tao=1&mat-hang=${row.id}`)}
          >
            Xuất kho
          </Button>
          <Button icon={<IconArrowIn size={18} />} write disabled={!row.is_active} onClick={() => navigate(`/kho/phieu-nhap?tao=1&mat-hang=${row.id}`)}>
            Nhập thêm
          </Button>
        </>
      }
    >
      <KeyValueList
        items={[
          { label: 'Tồn hiện tại', value: formatQty(row.quantity, row.unit) },
          { label: 'Giá vốn bình quân', value: formatMoney(row.avg_cost) },
          { label: 'Giá trị tồn', value: formatMoney(row.stock_value) },
          { label: 'Số giao dịch', value: row.transaction_count },
        ]}
      />
      <section className={styles.history} aria-labelledby="history-title">
        <h3 className={styles.historyTitle} id="history-title">
          Lịch sử giao dịch
        </h3>
        {history.loading ? (
          <Skeleton rows={3} />
        ) : history.error ? (
          <ErrorState message={history.error} onRetry={history.reload} />
        ) : txs.length === 0 ? (
          <EmptyState icon={<IconBox size={28} />} title="Chưa có giao dịch">
            Tồn sẽ thay đổi khi chốt phiếu nhập, phiếu xuất hoặc kiểm kê.
          </EmptyState>
        ) : (
          <ol className={styles.txList}>
            {txs.map((tx) => {
              const negative = tx.quantity_change.trim().startsWith('-');
              return (
                <li key={tx.id} className={styles.tx}>
                  <div className={styles.txMain}>
                    <span className={styles.txTitle}>
                      <Badge tone={tx.transaction_type === 'IN' ? 'ok' : tx.transaction_type === 'OUT' ? 'info' : 'warn'}>
                        {TX_LABELS[tx.transaction_type]}
                      </Badge>
                      <span className={styles.txRef}>{txReference(tx)}</span>
                    </span>
                    <span className={`${styles.txMeta} num`}>
                      {formatDate(tx.date)} · đơn giá {formatMoney(tx.cost)}
                    </span>
                  </div>
                  <div className={`${styles.txValue} num`}>
                    <span className={negative ? styles.minus : styles.plus}>
                      {negative ? '' : '+'}
                      {formatQty(tx.quantity_change, row.unit)}
                    </span>
                    <span className={styles.txMeta}>{formatMoney(tx.value_delta)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </Drawer>
  );
}
