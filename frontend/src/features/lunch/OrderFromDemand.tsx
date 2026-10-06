/**
 * SF78 "Đặt hàng" trong màn Nhu cầu & đề xuất (thay hộp thoại "Tạo đơn từ đề xuất").
 * Bản thiết kế có so sánh báo giá nhiều NCC và bản đồ nguồn gốc — hệ thống không lưu báo giá nên KHÔNG làm;
 * thay bằng giá nhập thật gần đây của từng mặt hàng (phiếu nhập đã chốt, theo NCC).
 * Khung dính bên phải: giá gần nhất, chọn NCC, số lượng tự tính (chỉ đọc: đơn từ đề xuất lấy đúng phần "Phải mua"),
 * thành tiền ước tính theo giá gần nhất, ngày giao, nút tạo đơn nháp.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconCart, IconHistory, IconTruck } from '../../components/icons';
import {
  Button,
  Callout,
  DataTable,
  EmptyState,
  ErrorState,
  Panel,
  SelectField,
  Skeleton,
  TextField,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { mul, parseDec, round, sum, toFixed, type Dec } from '../../lib/decimal';
import { formatDate, formatMoney, formatNumber, formatQty, formatShortDate, formatWeekdayShort, unitLabel } from '../../lib/format';
import { fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { catalogApi } from '../../services/catalog';
import { inventoryApi } from '../../services/inventory';
import { lunchApi, type DemandLine, type DemandRevision } from '../../services/lunch';
import { shiftDate } from '../../services/menus';
import { isZero } from './shared';
import styles from './OrderFromDemand.module.css';

type PriceRow = { key: string; supplierId: number; supplier: string; date: string; price: string; qty: string; receiptId: number };

export function OrderFromDemand({ revision, date }: { revision: DemandRevision; date: string }) {
  const toBuy = revision.lines.filter((l) => !isZero(l.to_buy_qty));
  const covered = revision.lines.length - toBuy.length;
  const refs = useApiQuery(() => Promise.all([inventoryApi.receipts(), catalogApi.suppliers()]), []);
  const [pickedFood, setPickedFood] = useState<number>(toBuy[0]?.food_id ?? 0);
  const picked = toBuy.find((l) => l.food_id === pickedFood) ?? toBuy[0];

  // Giá nhập thật của từng mặt hàng: dòng phiếu nhập đã chốt, mới nhất trước.
  const prices = useMemo(() => {
    const map = new Map<number, PriceRow[]>();
    if (!refs.data) return map;
    const [receipts, suppliers] = refs.data;
    const names = new Map(suppliers.map((x) => [x.id, x.name]));
    for (const r of receipts) {
      if (r.status !== 'POSTED') continue;
      for (const l of r.lines) {
        const list = map.get(l.food_id) ?? [];
        list.push({ key: `${r.id}-${l.id}`, supplierId: r.supplier_id, supplier: r.supplier_name ?? names.get(r.supplier_id) ?? '—', date: r.date, price: l.unit_price, qty: l.quantity, receiptId: r.id });
        map.set(l.food_id, list);
      }
    }
    for (const list of map.values()) list.sort((a, b) => b.date.localeCompare(a.date) || b.receiptId - a.receiptId);
    return map;
  }, [refs.data]);

  if (!picked) return null;
  const history = prices.get(picked.food_id) ?? [];
  const columns: Column<PriceRow>[] = [
    {
      key: 'supplier',
      header: 'Nhà cung cấp',
      width: '36%',
      sort: (r) => r.supplier,
      cell: (r) => (
        <span className={tableText.thumbCell}>
          <span className={styles.truck} aria-hidden="true">
            <IconTruck size={15} />
          </span>
          <Link className={tableText.rowButton} to={`/nha-cung-cap/${r.supplierId}`}>
            {r.supplier}
          </Link>
        </span>
      ),
    },
    { key: 'price', header: 'Đơn giá', width: '20%', align: 'right', sort: (r) => Number(r.price), cell: (r) => <span className={tableText.strong}>{formatMoney(r.price)}/{unitLabel(picked.unit)}</span> },
    { key: 'date', header: 'Ngày nhập', width: '18%', align: 'right', sort: (r) => r.date, cell: (r) => formatDate(r.date) },
    { key: 'qty', header: 'Đã nhập', width: '14%', align: 'right', sort: (r) => Number(r.qty), cell: (r) => formatQty(r.qty, picked.unit) },
    { key: 'doc', header: 'Phiếu', width: '12%', align: 'right', cell: (r) => <Link className={tableText.rowLink} to={`/kho/phieu-nhap?phieu=${r.receiptId}`}>#{r.receiptId}</Link> },
  ];

  return (
    <section className={styles.wrap} aria-labelledby="dat-hang-title">
      <div className={styles.head}>
        <h2 className={styles.title} id="dat-hang-title">
          Đặt hàng cho {formatWeekdayShort(date)}
        </h2>
        <span className={`${styles.count} num`}>{toBuy.length} mặt hàng cần mua</span>
      </div>
      <div className={styles.chips} role="group" aria-label="Mặt hàng cần mua">
        {toBuy.map((l) => (
          <button
            key={l.food_id}
            type="button"
            className={styles.chip}
            aria-pressed={l.food_id === picked.food_id}
            onClick={() => setPickedFood(l.food_id)}
          >
            <span className={styles.chipName}>{l.food_name}</span>
            <span className={`${styles.chipQty} num`}>{formatQty(l.to_buy_qty, l.unit)}</span>
          </button>
        ))}
      </div>
      <div className={styles.grid}>
        <Panel title={`Giá nhập gần đây · ${picked.food_name} · ${formatQty(picked.to_buy_qty, picked.unit)}`} action={<span className={styles.muted}>từ phiếu nhập đã chốt</span>}>
          {refs.loading && !refs.data ? (
            <Skeleton rows={3} />
          ) : refs.error ? (
            <ErrorState message={refs.error} onRetry={refs.reload} />
          ) : history.length ? (
            <DataTable caption={`Giá nhập gần đây của ${picked.food_name}`} rows={history.slice(0, 8)} rowKey={(r) => r.key} columns={columns} minWidth="560px" />
          ) : (
            <EmptyState title="Chưa có giá nhập">Mặt hàng này chưa có phiếu nhập đã chốt nào.</EmptyState>
          )}
          <DemandBreakdown line={picked} />
        </Panel>
        <OrderPanel revision={revision} date={date} toBuy={toBuy} picked={picked} prices={prices} covered={covered} suppliersData={refs.data?.[1]} />
      </div>
    </section>
  );
}

/** Nhu cầu của mặt hàng đang chọn: cần dùng + dự phòng = lấy từ tồn + hàng chờ về + phải mua. */
function DemandBreakdown({ line }: { line: DemandLine }) {
  const items = [
    { label: 'Cần dùng', value: formatQty(line.required_qty, line.unit) },
    { label: 'Dự phòng', value: isZero(line.reserve_qty) ? '—' : formatQty(line.reserve_qty, line.unit) },
    { label: 'Lấy từ tồn', value: formatQty(line.from_stock_qty, line.unit) },
    { label: 'Hàng chờ về', value: formatQty(line.from_pending_qty, line.unit) },
    { label: 'Phải mua', value: formatQty(line.to_buy_qty, line.unit), strong: true },
  ];
  return (
    <dl className={styles.breakdown}>
      {items.map((it) => (
        <div key={it.label} className={styles.bItem}>
          <dt>{it.label}</dt>
          <dd className={`num ${it.strong ? styles.bStrong : ''}`}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function OrderPanel({
  revision,
  date,
  toBuy,
  picked,
  prices,
  covered,
  suppliersData,
}: {
  revision: DemandRevision;
  date: string;
  toBuy: DemandLine[];
  picked: DemandLine;
  prices: Map<number, PriceRow[]>;
  covered: number;
  suppliersData: { id: number; name: string; is_active: boolean }[] | undefined;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [supplierId, setSupplierId] = useState('');
  const [expected, setExpected] = useState(shiftDate(date, -1));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const last = prices.get(picked.food_id)?.[0] ?? null;
  // Ước tính = Σ phải mua × giá nhập gần nhất (Decimal, làm tròn 2 số lẻ). Mặt hàng chưa có giá: không tính, báo riêng.
  const priced = toBuy.filter((l) => prices.get(l.food_id)?.length);
  const estimate: Dec = round(
    sum(priced.map((l) => mul(parseDec(l.to_buy_qty) ?? { v: 0n, s: 0 }, parseDec(prices.get(l.food_id)![0].price) ?? { v: 0n, s: 0 }))),
    2,
  );
  const unpriced = toBuy.length - priced.length;

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!supplierId) next.supplier_id = 'Chọn nhà cung cấp.';
    if (!expected) next.expected_date = 'Chọn ngày giao.';
    else if (expected > date) next.expected_date = 'Hàng phải về trước hoặc đúng ngày ăn.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setError('');
    try {
      const po = await lunchApi.orderFromDemand({ revision_id: revision.id, supplier_id: Number(supplierId), expected_date: expected });
      toast.show(`Đã tạo đơn ${po.code} (nháp).`);
      navigate(`/bua-trua/don-dat?don=${po.id}`);
    } catch (err) {
      setError(messageOf(err));
      setErrors(fieldsOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={styles.panel} aria-label="Tạo đơn từ đề xuất">
      <div className={styles.priceBox}>
        <div className={styles.priceHead}>
          <span>Giá gần nhất · {picked.food_name}</span>
          {last ? <span className="num">nhập {formatShortDate(last.date)}</span> : null}
        </div>
        <p className={`${styles.price} num`}>
          {last ? formatMoney(last.price) : '—'}
          {last ? <span className={styles.priceUnit}> / {unitLabel(picked.unit)}</span> : null}
        </p>
      </div>
      {suppliersData ? (
        <SelectField label="Nhà cung cấp" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} error={errors.supplier_id} required>
          <option value="">Chọn nhà cung cấp</option>
          {suppliersData
            .filter((x) => x.is_active)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </SelectField>
      ) : (
        <Skeleton rows={1} />
      )}
      <div className={styles.qtyBox}>
        <span className={styles.qtyLabel}>Số lượng · tự tính cho {formatNumber(revision.servings, 0)} suất</span>
        <span className={`${styles.qty} num`}>{formatQty(picked.to_buy_qty, picked.unit)}</span>
      </div>
      <TextField label="Ngày giao dự kiến" type="date" max={date} value={expected} onChange={(e) => setExpected(e.target.value)} error={errors.expected_date} required />
      <dl className={styles.sums}>
        <div>
          <dt>Ước tính thành tiền</dt>
          <dd className="num">{priced.length ? formatMoney(toFixed(estimate, 2)) : '—'}</dd>
        </div>
        <div>
          <dt>Gồm</dt>
          <dd className="num">{toBuy.length} mặt hàng</dd>
        </div>
      </dl>
      {error ? (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      ) : null}
      <Button write block icon={<IconCart size={18} />} busy={busy} onClick={submit}>
        Tạo đơn từ đề xuất
      </Button>
      <div className={styles.grayBtns}>
        <Button variant="outline" block icon={<IconHistory size={18} />} onClick={() => navigate('/bua-trua/don-dat')}>
          Lịch sử đơn
        </Button>
        <Button variant="outline" block icon={<IconTruck size={18} />} onClick={() => navigate(supplierId ? `/nha-cung-cap/${supplierId}` : '/nha-cung-cap')}>
          Nhà cung cấp
        </Button>
      </div>
      {covered ? (
        <p className={styles.hintGood}>
          <strong>Đủ hàng cho {covered} nguyên liệu</strong>
          Tồn và hàng đang chờ về đã đủ, không phải mua.
        </p>
      ) : null}
      <p className={styles.hintDue}>
        <strong>Hàng phải về trước {formatDate(date)}</strong>
        {unpriced ? `${unpriced} mặt hàng chưa có giá nhập nên chưa tính vào ước tính.` : 'Đơn tạo ở trạng thái nháp; duyệt và gửi NCC ở màn Đơn đặt.'}
      </p>
    </aside>
  );
}
