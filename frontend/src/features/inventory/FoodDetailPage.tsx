/**
 * /kho/mat-hang/:id — chi tiết một mặt hàng (SF78, bố cục theo mẫu "Chi tiết lô"; lô/hạn dùng ngoài phạm vi
 * nên trang gắn với MẶT HÀNG). Ảnh bìa + card nổi (tồn, giá vốn BQ, giá trị tồn), tab: Tổng quan · Lịch sử ·
 * Nhập kho · Xuất kho · Kiểm kê. Mọi số liệu từ API sẵn có (tồn kho, sổ giao dịch, phiếu nhập/xuất, món).
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { IconArrowIn, IconArrowOut } from '../../components/icons';
import {
  Badge,
  Button,
  CoverHeader,
  DataTable,
  EmptyState,
  ErrorState,
  FolderCard,
  InfoTiles,
  Panel,
  Skeleton,
  Tabs,
  tableText,
  type Column,
} from '../../components/ui';
import { formatDate, formatMoney, formatQty, formatShortDate, unitLabel } from '../../lib/format';
import { useApiQuery } from '../../lib/useApiQuery';
import { catalogApi } from '../../services/catalog';
import { inventoryApi, TX_LABELS, txReference, type Transaction, type TxType } from '../../services/inventory';
import styles from './FoodDetailPage.module.css';

type TabKey = 'tong-quan' | 'lich-su' | 'IN' | 'OUT' | 'ADJUST';
const TX_TONE = { IN: 'ok', OUT: 'info', ADJUST: 'review' } as const;
const num = (v: string) => Number(v) || 0; // chỉ để sắp xếp

export function FoodDetailPage() {
  const { id = '' } = useParams();
  const foodId = Number(id);
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('tong-quan');
  const base = useApiQuery(
    () => Promise.all([inventoryApi.stock(), inventoryApi.foods(), inventoryApi.receipts(), inventoryApi.issues(), inventoryApi.suppliers(), catalogApi.dishes()]),
    [],
  );
  const history = useApiQuery(() => (Number.isInteger(foodId) && foodId > 0 ? inventoryApi.transactions({ food: foodId }) : Promise.resolve([])), [foodId]);

  const view = useMemo(() => {
    if (!base.data) return null;
    const [stock, foods, receipts, issues, suppliers, dishes] = base.data;
    const row = stock.find((s) => s.id === foodId);
    const food = foods.find((f) => f.id === foodId);
    if (!row || !food) return null;
    const posted = receipts.filter((r) => r.status === 'POSTED' && r.lines.some((l) => l.food_id === foodId)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const draftsIn = receipts.filter((r) => r.status === 'DRAFT' && r.lines.some((l) => l.food_id === foodId)).length;
    const issued = issues.filter((r) => r.status === 'POSTED' && r.lines.some((l) => l.food_id === foodId));
    const draftsOut = issues.filter((r) => r.status === 'DRAFT' && r.lines.some((l) => l.food_id === foodId)).length;
    const last = posted[0] ?? null;
    const supplier = last ? suppliers.find((x) => x.id === last.supplier_id) ?? null : null;
    const usedIn = dishes
      .filter((d) => d.components.some((c) => c.food_id === foodId))
      .map((d) => ({ id: d.id, name: d.name, active: d.is_active, qty: d.components.find((c) => c.food_id === foodId)!.quantity }));
    return { row, food, posted, draftsIn, issued, draftsOut, last, supplier, usedIn };
  }, [base.data, foodId]);

  if (base.loading && !base.data) return <Skeleton rows={8} label="Đang tải mặt hàng" />;
  if (base.error) return <ErrorState message={base.error} onRetry={base.reload} />;
  if (!view) {
    return (
      <EmptyState
        title="Không tìm thấy mặt hàng"
        action={
          <Button variant="outline" onClick={() => navigate('/kho')}>
            Về Kho hàng
          </Button>
        }
      >
        Mặt hàng có thể đã bị xoá khỏi danh mục hoặc đường dẫn không đúng.
      </EmptyState>
    );
  }

  const { row, food, posted, draftsIn, issued, draftsOut, last, supplier, usedIn } = view;
  const empty = !num(row.quantity);
  const status = !food.is_active ? <Badge>Ngừng dùng</Badge> : empty ? <Badge tone="danger">Hết hàng</Badge> : <Badge tone="ok">Đang dùng</Badge>;
  const txs: Transaction[] = history.data ? [...history.data].reverse() : [];
  const filteredTx = tab === 'IN' || tab === 'OUT' || tab === 'ADJUST' ? txs.filter((t) => t.transaction_type === tab) : txs;
  const counts = { IN: txs.filter((t) => t.transaction_type === 'IN').length, OUT: txs.filter((t) => t.transaction_type === 'OUT').length, ADJUST: txs.filter((t) => t.transaction_type === 'ADJUST').length };

  const txColumns: Column<Transaction>[] = [
    { key: 'date', header: 'Ngày', width: '14%', sort: (t) => `${t.date} ${String(t.id).padStart(9, '0')}`, cell: (t) => <span className="num">{formatDate(t.date)}</span> },
    {
      key: 'event',
      header: 'Sự kiện',
      width: '34%',
      sort: (t) => TX_LABELS[t.transaction_type],
      cell: (t) => (
        <span className={styles.event}>
          <Badge tone={TX_TONE[t.transaction_type]} icon={false}>
            {TX_LABELS[t.transaction_type]}
          </Badge>
          <span className={styles.eventRef}>{txReference(t)}</span>
        </span>
      ),
    },
    { key: 'cost', header: 'Đơn giá', width: '16%', align: 'right', sort: (t) => num(t.cost), cell: (t) => <span className={tableText.muted}>{formatMoney(t.cost)}</span> },
    {
      key: 'qty',
      header: 'Số lượng',
      width: '16%',
      align: 'right',
      sort: (t) => num(t.quantity_change),
      cell: (t) => {
        const neg = t.quantity_change.trim().startsWith('-');
        return (
          <span className={tableText.strong}>
            {neg ? '' : '+'}
            {formatQty(t.quantity_change, row.unit)}
          </span>
        );
      },
    },
    { key: 'value', header: 'Giá trị', width: '20%', align: 'right', sort: (t) => num(t.value_delta), cell: (t) => formatMoney(t.value_delta) },
  ];

  const historyTable = (list: Transaction[], caption: string) =>
    history.loading && !history.data ? (
      <Skeleton rows={4} />
    ) : history.error ? (
      <ErrorState message={history.error} onRetry={history.reload} />
    ) : list.length === 0 ? (
      <EmptyState title="Chưa có giao dịch">Tồn thay đổi khi chốt phiếu nhập, phiếu xuất hoặc kiểm kê.</EmptyState>
    ) : (
      <DataTable caption={caption} rows={list} rowKey={(t) => t.id} columns={txColumns} minWidth="640px" />
    );

  return (
    <>
      <CoverHeader
        breadcrumb={[{ label: 'Kho hàng', to: '/kho' }, { label: `${row.name} · ${row.code}` }]}
        title={`${row.name} · ${row.code}`}
        badges={
          <>
            {status}
            <Badge>{row.category_name}</Badge>
            <span className={styles.unit}>Đơn vị: {unitLabel(row.unit)}</span>
          </>
        }
        facts={[
          { value: formatQty(row.quantity, row.unit), label: 'Tồn hiện tại' },
          { value: formatMoney(row.avg_cost), label: 'Giá vốn BQ' },
          { value: formatMoney(row.stock_value), label: 'Giá trị tồn' },
        ]}
        storageKey={`food-${row.id}`}
      />
      <Tabs
        idPrefix="mat-hang"
        label="Các mục của mặt hàng"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'tong-quan', label: 'Tổng quan' },
          { value: 'lich-su', label: 'Lịch sử', count: txs.length },
          { value: 'IN', label: 'Nhập kho', count: counts.IN },
          { value: 'OUT', label: 'Xuất kho', count: counts.OUT },
          { value: 'ADJUST', label: 'Kiểm kê', count: counts.ADJUST },
        ]}
      />
      <div id="mat-hang-panel" role="tabpanel" aria-labelledby={`mat-hang-tab-${tab}`} className={styles.panelArea}>
        {tab === 'tong-quan' ? (
          <div className={styles.grid}>
            <Panel className={styles.main}>
              <div className={styles.mainHead}>
                <h2 className={styles.mainTitle}>{row.name}</h2>
                <div className={styles.mainActions}>
                  <Button
                    variant="secondary"
                    icon={<IconArrowOut size={18} />}
                    write
                    disabled={empty || !food.is_active}
                    title={empty ? 'Mặt hàng đang hết, chưa xuất được.' : undefined}
                    onClick={() => navigate(`/kho/phieu-xuat?tao=1&mat-hang=${row.id}`)}
                  >
                    Xuất kho
                  </Button>
                  <Button icon={<IconArrowIn size={18} />} write disabled={!food.is_active} onClick={() => navigate(`/kho/phieu-nhap?tao=1&mat-hang=${row.id}`)}>
                    Nhập thêm
                  </Button>
                </div>
              </div>
              <InfoTiles
                items={[
                  { label: 'Nhà cung cấp gần nhất', value: supplier?.name ?? '—', to: supplier ? `/nha-cung-cap/${supplier.id}` : undefined },
                  { label: 'Nhập gần nhất', value: last ? formatDate(last.date) : 'Chưa nhập' },
                  { label: 'Số giao dịch', value: row.transaction_count },
                ]}
              />
              <div className={styles.sectionHead}>
                <h3 className={styles.sectionTitle}>Giao dịch gần đây</h3>
                {txs.length > 5 ? (
                  <button type="button" className={styles.textBtn} onClick={() => setTab('lich-su')}>
                    Xem tất cả {txs.length}
                  </button>
                ) : null}
              </div>
              {historyTable(txs.slice(0, 5), `5 giao dịch gần nhất của ${row.name}`)}
              <p className={`${styles.remain} num`}>
                Tồn hiện tại <strong>{formatQty(row.quantity, row.unit)}</strong>
              </p>
            </Panel>
            <div className={styles.side}>
              <FolderCard
                title="Phiếu nhập"
                meta={`${posted.length} phiếu đã chốt${draftsIn ? ` · ${draftsIn} nháp` : ''}`}
                to="/kho/phieu-nhap"
              />
              <FolderCard
                title="Phiếu xuất"
                meta={`${issued.length} phiếu đã chốt${draftsOut ? ` · ${draftsOut} nháp` : ''}`}
                to="/kho/phieu-xuat"
              />
              <Panel title="Dùng trong món">
                {usedIn.length ? (
                  <ul className={styles.dishes}>
                    {usedIn.map((d) => (
                      <li key={d.id} className={styles.dish}>
                        <Link to={`/mon-an?sua=${d.id}`}>{d.name}</Link>
                        <span className={`${styles.dishQty} num`}>
                          {formatQty(d.qty, row.unit, 6)} / suất
                          {!d.active ? ' · ngừng dùng' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.note}>Chưa có món nào dùng mặt hàng này.</p>
                )}
              </Panel>
            </div>
          </div>
        ) : (
          <Panel>
            {historyTable(
              filteredTx,
              tab === 'lich-su' ? `Lịch sử giao dịch của ${row.name}` : `Giao dịch ${TX_LABELS[tab as TxType].toLowerCase()} của ${row.name}`,
            )}
            {tab !== 'lich-su' && filteredTx.length ? (
              <p className={`${styles.note} num`}>
                {filteredTx.length} giao dịch · gần nhất {formatShortDate(filteredTx[0].date)}
              </p>
            ) : null}
          </Panel>
        )}
      </div>
    </>
  );
}
