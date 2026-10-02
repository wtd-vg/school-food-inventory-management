/**
 * Báo cáo (bản vẽ 08, dùng dữ liệu thật của sổ kho StockTransaction).
 * Chưa có số suất thực tế/mức thu nên chưa tính "chi mỗi suất"; thay bằng giá trị xuất cho bếp theo ngày.
 * ?thang=YYYY-MM chọn tháng, ?muc=tong-quan|ton-kho|so-giao-dich|theo-ngay chọn mục.
 * "Theo ngày ăn" (SF70): GET /api/reports/daily/?from=&to= — chi phí ngày, suất thực tế, chi phí/suất, đã đóng ngày.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconChart, IconChevronLeft, IconChevronRight } from '../../components/icons';
import {
  Badge,
  BarChart,
  Button,
  Callout,
  CostBar,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Pagination,
  SearchField,
  SectionTitle,
  Segmented,
  SelectField,
  Skeleton,
  Stack,
  Toolbar,
  tableText,
  type BarDatum,
  type Column,
  type Segment,
} from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { add, parseDec, sub, sum, toFixed, ZERO, type Dec } from '../../lib/decimal';
import { formatDate, formatMoney, formatMoneyShort, formatNumber, formatQty, formatShortDate, todayISO } from '../../lib/format';
import { useApiQuery } from '../../lib/useApiQuery';
import { lunchApi, type DailyReport } from '../../services/lunch';
import { inventoryApi, TX_LABELS, txReference, type StockRow, type Transaction, type TxType } from '../../services/inventory';
import { useQueryParam } from '../inventory/shared';
import styles from './ReportsPage.module.css';

type Section = 'tong-quan' | 'ton-kho' | 'so-giao-dich' | 'theo-ngay';
const SECTIONS: Section[] = ['tong-quan', 'ton-kho', 'so-giao-dich', 'theo-ngay'];
const TONES: Segment['tone'][] = [1, 2, 3, 4, 5];

const dec = (v: string) => parseDec(v) ?? ZERO;
const neg = (d: Dec): Dec => ({ v: -d.v, s: d.s });
const decNum = (d: Dec) => Number(toFixed(d, 2)); // chỉ để vẽ hình, không dùng tính tiền

function monthRange(ym: string): { from: string; to: string; label: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}`, label: `Tháng ${m}/${y}` };
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Tuần ISO của ngày YYYY-MM-DD và ngày đầu/cuối tuần trong tháng đó. */
function isoWeek(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function axisMoney(v: number): string {
  if (v >= 1_000_000) return `${formatNumber(String(Math.round(v / 100_000) / 10), 1)} tr`;
  if (v >= 1_000) return `${formatNumber(String(Math.round(v / 1_000)), 0)} k`;
  return formatNumber(String(Math.round(v)), 0);
}

export function ReportsPage() {
  const [monthParam, setMonthParam] = useQueryParam('thang');
  const [sectionParam, setSectionParam] = useQueryParam('muc');
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayISO().slice(0, 7);
  const section: Section = SECTIONS.includes(sectionParam as Section) ? (sectionParam as Section) : 'tong-quan';
  const range = monthRange(month);
  const current = todayISO().slice(0, 7);

  const stock = useApiQuery(() => inventoryApi.stock(), []);
  const txQuery = useApiQuery(() => inventoryApi.transactions({ from: range.from, to: range.to }), [range.from, range.to]);
  const dailyQuery = useApiQuery(
    () => (section === 'theo-ngay' ? lunchApi.dailyReport(range.from, range.to) : Promise.resolve(null)),
    [range.from, range.to, section],
  );

  const stockRows = stock.data ?? [];
  const foodById = useMemo(() => new Map(stockRows.map((r) => [r.id, r])), [stockRows]);
  const txs = txQuery.data ?? [];

  const exportCsv = () => {
    if (section === 'theo-ngay') {
      const r = dailyQuery.data;
      if (!r) return;
      downloadCsv(`chi-phi-theo-ngay-${month}.csv`, [
        ['Ngày', 'Suất dự kiến', 'Suất thực tế', 'Chi phí ngày', 'Chi phí/suất', 'Đã đóng ngày'],
        ...r.days.map((d) => [d.date, d.planned_total ?? '', d.actual_total ?? '', d.cost, d.cost_per_serving ?? '', d.closed ? 'có' : 'không']),
        ['Tổng', '', r.total_servings, r.total_cost, r.avg_cost_per_serving ?? '', ''],
      ]);
      return;
    }
    downloadCsv(`so-kho-${month}.csv`, [
      ['Ngày', 'Loại', 'Mã hàng', 'Tên hàng', 'Số lượng', 'Đơn vị', 'Đơn giá', 'Giá trị', 'Chứng từ'],
      ...txs.map((t) => {
        const f = foodById.get(t.food_id);
        return [t.date, TX_LABELS[t.transaction_type], f?.code ?? '', f?.name ?? '', t.quantity_change, f?.unit ?? '', t.cost, t.value_delta, txReference(t)];
      }),
    ]);
  };

  return (
    <>
      <PageHeader
        overline={section === 'ton-kho' ? 'Số liệu hiện tại' : range.label}
        title="Báo cáo kho"
        actions={
          <>
            {section !== 'ton-kho' ? (
              <div className={styles.monthNav}>
                <IconButton label="Tháng trước" onClick={() => setMonthParam(shiftMonth(month, -1))}>
                  <IconChevronLeft size={18} />
                </IconButton>
                <span className={`${styles.monthLabel} num`} aria-live="polite">
                  {range.label}
                </span>
                <IconButton label="Tháng sau" disabled={month >= current} onClick={() => setMonthParam(shiftMonth(month, 1))}>
                  <IconChevronRight size={18} />
                </IconButton>
              </div>
            ) : null}
            <Button
              variant="secondary"
              onClick={exportCsv}
              disabled={section === 'ton-kho' || (section === 'theo-ngay' ? !dailyQuery.data?.days.length : txs.length === 0)}
            >
              Xuất CSV
            </Button>
          </>
        }
      />
      <Segmented
        label="Chọn mục báo cáo"
        value={section}
        onChange={(v) => setSectionParam(v)}
        options={[
          { value: 'tong-quan', label: 'Tổng quan tháng' },
          { value: 'ton-kho', label: 'Tồn kho' },
          { value: 'so-giao-dich', label: 'Sổ giao dịch' },
          { value: 'theo-ngay', label: 'Theo ngày ăn' },
        ]}
      />
      {section === 'theo-ngay' ? (
        dailyQuery.loading ? (
          <Skeleton rows={8} />
        ) : dailyQuery.error ? (
          <ErrorState message={dailyQuery.error} onRetry={dailyQuery.reload} />
        ) : dailyQuery.data ? (
          <DailySection report={dailyQuery.data} label={range.label} />
        ) : null
      ) : stock.loading || (section !== 'ton-kho' && txQuery.loading) ? (
        <Skeleton rows={8} />
      ) : stock.error || txQuery.error ? (
        <ErrorState
          message={stock.error ?? txQuery.error ?? ''}
          onRetry={() => {
            stock.reload();
            txQuery.reload();
          }}
        />
      ) : section === 'tong-quan' ? (
        <Overview txs={txs} stockRows={stockRows} foodById={foodById} label={range.label} />
      ) : section === 'ton-kho' ? (
        <StockSection stockRows={stockRows} />
      ) : (
        <Ledger txs={txs} foodById={foodById} />
      )}
    </>
  );
}

/* ---------------- Theo ngày ăn (SF70) ---------------- */
function DailySection({ report, label }: { report: DailyReport; label: string }) {
  const chart = useMemo(() => {
    const rows = report.days.filter((d) => d.cost_per_serving);
    const values = rows.map((d) => decNum(dec(d.cost_per_serving ?? '0')));
    const maxV = Math.max(...values, 0);
    return rows.map<BarDatum>((d, i) => ({
      key: d.date,
      label: formatShortDate(d.date),
      value: values[i],
      display: formatMoney(d.cost_per_serving),
      highlight: values[i] === maxV && maxV > 0,
    }));
  }, [report]);

  if (!report.days.length) {
    return (
      <EmptyState title={`Chưa có ngày ăn nào trong ${label.toLowerCase()}`} icon={<IconChart size={28} />}>
        Ngày ăn xuất hiện ở đây khi đã mở số suất cho ngày đó.
      </EmptyState>
    );
  }
  return (
    <Stack gap="lg">
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Tổng chi phí</span>
          <span className={`${styles.kpiValue} num`}>{formatMoney(report.total_cost)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Tổng suất thực tế</span>
          <span className={`${styles.kpiValue} num`}>{formatNumber(report.total_servings, 0)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Bình quân / suất</span>
          <span className={`${styles.kpiValue} num`}>{report.avg_cost_per_serving ? formatMoney(report.avg_cost_per_serving) : '—'}</span>
        </div>
      </div>
      {chart.length ? (
        <>
          <SectionTitle>Chi phí mỗi suất theo ngày</SectionTitle>
          <BarChart data={chart} caption="Chi phí mỗi suất theo ngày ăn" axis={axisMoney} />
        </>
      ) : (
        <Callout tone="info">Chưa có ngày nào chốt số suất thực tế nên chưa tính được chi phí/suất.</Callout>
      )}
      <DataTable
        caption={`Chi phí theo ngày ăn, ${label}`}
        rows={report.days}
        rowKey={(d) => d.date}
        columns={[
          { key: 'date', header: 'Ngày', cell: (d) => <Link to={`/bua-trua?ngay=${d.date}`}>{formatDate(d.date)}</Link> },
          { key: 'planned', header: 'Dự kiến', align: 'right', cell: (d) => (d.planned_total == null ? '—' : formatNumber(d.planned_total, 0)) },
          { key: 'actual', header: 'Thực tế', align: 'right', cell: (d) => (d.actual_total == null ? '—' : formatNumber(d.actual_total, 0)) },
          { key: 'cost', header: 'Chi phí ngày', align: 'right', cell: (d) => <span className={tableText.strong}>{formatMoney(d.cost)}</span> },
          { key: 'per', header: 'Chi phí/suất', align: 'right', cell: (d) => (d.cost_per_serving ? formatMoney(d.cost_per_serving) : '—') },
          { key: 'closed', header: 'Đóng ngày', cell: (d) => (d.closed ? <Badge tone="done">Đã đóng</Badge> : <Badge tone="warn">Chưa đóng</Badge>) },
        ]}
      />
    </Stack>
  );
}

/* ---------------- Tổng quan tháng ---------------- */
function Overview({ txs, stockRows, foodById, label }: { txs: Transaction[]; stockRows: StockRow[]; foodById: Map<number, StockRow>; label: string }) {
  const by = (t: TxType) => txs.filter((x) => x.transaction_type === t);
  const ins = by('IN');
  const outs = by('OUT');
  const adjs = by('ADJUST');
  const inTotal = sum(ins.map((t) => dec(t.value_delta)));
  const outTotal = neg(sum(outs.map((t) => dec(t.value_delta))));
  const adjMinus = neg(sum(adjs.map((t) => dec(t.value_delta)).filter((d) => d.v < 0n)));
  const adjPlus = sum(adjs.map((t) => dec(t.value_delta)).filter((d) => d.v > 0n));
  const docCount = (list: Transaction[]) => new Set(list.map((t) => t.reference)).size;
  const stockValue = sum(stockRows.map((r) => dec(r.stock_value)));

  // Giá trị xuất cho bếp theo ngày.
  const daily = useMemo(() => {
    const m = new Map<string, Dec>();
    outs.forEach((t) => m.set(t.date, add(m.get(t.date) ?? ZERO, neg(dec(t.value_delta)))));
    const rows = Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
    const maxV = Math.max(...rows.map(([, v]) => decNum(v)), 0);
    return rows.map<BarDatum>(([date, v]) => ({ key: date, label: formatShortDate(date), value: decNum(v), display: formatMoney(toFixed(v, 2)), highlight: decNum(v) === maxV && maxV > 0 }));
  }, [outs]);

  // Xuất vào đâu: theo nhóm hàng.
  const byCategory = useMemo(() => {
    const m = new Map<string, Dec>();
    outs.forEach((t) => {
      const cat = foodById.get(t.food_id)?.category_name || 'Khác';
      m.set(cat, add(m.get(cat) ?? ZERO, neg(dec(t.value_delta))));
    });
    return Array.from(m.entries())
      .sort(([, a], [, b]) => decNum(b) - decNum(a))
      .map<Segment>(([cat, v], i) => ({ key: cat, label: cat, value: decNum(v), display: formatMoneyShort(toFixed(v, 2)), tone: TONES[i] ?? 'other' }));
  }, [outs, foodById]);

  // Theo tuần.
  const weekly = useMemo(() => {
    const m = new Map<number, { week: number; first: string; last: string; inV: Dec; outV: Dec; adjV: Dec }>();
    txs.forEach((t) => {
      const w = isoWeek(t.date);
      const row = m.get(w) ?? { week: w, first: t.date, last: t.date, inV: ZERO, outV: ZERO, adjV: ZERO };
      if (t.date < row.first) row.first = t.date;
      if (t.date > row.last) row.last = t.date;
      const v = dec(t.value_delta);
      if (t.transaction_type === 'IN') row.inV = add(row.inV, v);
      else if (t.transaction_type === 'OUT') row.outV = sub(row.outV, v);
      else row.adjV = add(row.adjV, v);
      m.set(w, row);
    });
    return Array.from(m.values()).sort((a, b) => a.week - b.week);
  }, [txs]);

  if (txs.length === 0) {
    return (
      <EmptyState icon={<IconChart size={32} />} title={`${label} chưa có giao dịch kho`}>
        Số liệu xuất hiện khi chốt phiếu nhập, phiếu xuất hoặc kiểm kê trong tháng.
      </EmptyState>
    );
  }

  type Week = (typeof weekly)[number];
  const weekColumns: Column<Week>[] = [
    {
      key: 'week',
      header: 'Tuần',
      width: '28%',
      cell: (w) => (
        <>
          <span className={tableText.primaryText}>Tuần {w.week}</span>
          <span className={tableText.secondaryText}>
            {formatShortDate(w.first)}–{formatShortDate(w.last)}
          </span>
        </>
      ),
    },
    { key: 'in', header: 'Nhập', align: 'right', cell: (w) => formatMoney(toFixed(w.inV, 2)) },
    { key: 'out', header: 'Xuất cho bếp', align: 'right', cell: (w) => <span className={tableText.strong}>{formatMoney(toFixed(w.outV, 2))}</span> },
    { key: 'adj', header: 'Kiểm kê', align: 'right', cell: (w) => (w.adjV.v === 0n ? <span className={tableText.muted}>—</span> : formatMoney(toFixed(w.adjV, 2))) },
  ];

  return (
    <Stack gap="lg">
      <p className={`${styles.summary} num`}>
        {label} kho nhập <strong>{formatMoneyShort(toFixed(inTotal, 2))}</strong> ({docCount(ins)} phiếu), xuất cho bếp{' '}
        <strong>{formatMoneyShort(toFixed(outTotal, 2))}</strong> ({docCount(outs)} phiếu)
        {adjs.length ? (
          <>
            , kiểm kê điều chỉnh <strong>{adjMinus.v ? `−${formatMoney(toFixed(adjMinus, 2))}` : '0 đ'}</strong> thiếu
            {adjPlus.v ? <> và <strong>{formatMoney(toFixed(adjPlus, 2))}</strong> thừa</> : null}
          </>
        ) : null}
        . Giá trị tồn hiện tại <strong>{formatMoneyShort(toFixed(stockValue, 2))}</strong>.
      </p>

      <div className={styles.grid}>
        <section aria-labelledby="daily-title" className={styles.mainCol}>
          <div className={styles.sectionHead}>
            <SectionTitle id="daily-title">Giá trị xuất cho bếp theo ngày</SectionTitle>
            {daily.length ? <span className={styles.note}>Ghi số ở ngày xuất nhiều nhất · rê chuột hoặc Tab để xem từng ngày</span> : null}
          </div>
          {daily.length ? (
            <BarChart data={daily} caption="Giá trị xuất cho bếp theo ngày" axis={axisMoney} />
          ) : (
            <p className={styles.empty}>Chưa có phiếu xuất đã chốt trong tháng.</p>
          )}

          <div className={styles.sectionHead}>
            <SectionTitle id="weekly-title">Theo tuần</SectionTitle>
          </div>
          <DataTable caption="Nhập, xuất, kiểm kê theo tuần" rows={weekly} rowKey={(w) => w.week} columns={weekColumns} minWidth="520px" />
        </section>

        <aside className={styles.sideCol} aria-label="Cơ cấu và hao hụt">
          <section aria-labelledby="where-title">
            <div className={styles.sectionHead}>
              <SectionTitle id="where-title">Xuất vào đâu</SectionTitle>
            </div>
            {byCategory.length ? <CostBar segments={byCategory} caption="Cơ cấu giá trị xuất theo nhóm hàng" /> : <p className={styles.empty}>Chưa có dữ liệu xuất.</p>}
          </section>
          <section aria-labelledby="loss-title">
            <div className={styles.sectionHead}>
              <SectionTitle id="loss-title">Hao hụt qua kiểm kê</SectionTitle>
            </div>
            {adjs.length ? (
              <ul className={styles.lossList}>
                <li>
                  <span>Thiếu so với sổ</span>
                  <strong className="num">{adjMinus.v ? `−${formatMoney(toFixed(adjMinus, 2))}` : '0 đ'}</strong>
                </li>
                <li>
                  <span>Thừa so với sổ</span>
                  <strong className="num">{formatMoney(toFixed(adjPlus, 2))}</strong>
                </li>
                <li>
                  <span>Số dòng điều chỉnh</span>
                  <strong className="num">{adjs.length}</strong>
                </li>
              </ul>
            ) : (
              <p className={styles.empty}>Tháng này chưa có kiểm kê có chênh lệch.</p>
            )}
            {adjMinus.v ? (
              <Callout tone="warn">Chênh lệch thiếu không tự khẳng định thất thoát; hãy đối chiếu với phiếu xuất và cân đo thực tế.</Callout>
            ) : null}
          </section>
        </aside>
      </div>
    </Stack>
  );
}

/* ---------------- Tồn kho ---------------- */
function StockSection({ stockRows }: { stockRows: StockRow[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; count: number; value: Dec; empty: number }>();
    stockRows.forEach((r) => {
      const name = r.category_name || 'Khác';
      const g = m.get(name) ?? { name, count: 0, value: ZERO, empty: 0 };
      g.count += 1;
      g.value = add(g.value, dec(r.stock_value));
      if (dec(r.quantity).v === 0n) g.empty += 1;
      m.set(name, g);
    });
    return Array.from(m.values()).sort((a, b) => decNum(b.value) - decNum(a.value));
  }, [stockRows]);
  const total = sum(groups.map((g) => g.value));
  type Group = (typeof groups)[number];
  const columns: Column<Group>[] = [
    { key: 'name', header: 'Nhóm hàng', width: '36%', cell: (g) => <span className={tableText.primaryText}>{g.name}</span> },
    { key: 'count', header: 'Số mặt hàng', align: 'right', cell: (g) => g.count },
    { key: 'empty', header: 'Đang hết', align: 'right', cell: (g) => (g.empty ? <Badge tone="danger">{g.empty}</Badge> : <span className={tableText.muted}>0</span>) },
    { key: 'value', header: 'Giá trị tồn', align: 'right', cell: (g) => <span className={tableText.strong}>{formatMoney(toFixed(g.value, 2))}</span> },
  ];
  if (stockRows.length === 0) return <EmptyState title="Kho chưa có mặt hàng" />;
  return (
    <Stack gap="lg">
      <p className={`${styles.summary} num`}>
        Kho có <strong>{stockRows.length}</strong> mặt hàng, tổng giá trị tồn <strong>{formatMoney(toFixed(total, 2))}</strong> theo giá vốn bình quân.
      </p>
      <div className={styles.grid}>
        <div className={styles.mainCol}>
          <DataTable caption="Giá trị tồn theo nhóm hàng" rows={groups} rowKey={(g) => g.name} columns={columns} minWidth="520px" />
          <p className={styles.note}>
            Xem từng mặt hàng ở <Link to="/kho">Kho hàng</Link>.
          </p>
        </div>
        <aside className={styles.sideCol} aria-label="Cơ cấu tồn kho">
          <SectionTitle>Cơ cấu giá trị tồn</SectionTitle>
          <CostBar
            caption="Cơ cấu giá trị tồn theo nhóm hàng"
            segments={groups.map((g, i) => ({ key: g.name, label: g.name, value: decNum(g.value), display: formatMoneyShort(toFixed(g.value, 2)), tone: TONES[i] ?? 'other' }))}
          />
        </aside>
      </div>
    </Stack>
  );
}

/* ---------------- Sổ giao dịch ---------------- */
function Ledger({ txs, foodById }: { txs: Transaction[]; foodById: Map<number, StockRow> }) {
  const [type, setType] = useState<'all' | TxType>('all');
  const [food, setFood] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE = 15;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...txs]
      .reverse()
      .filter((t) => type === 'all' || t.transaction_type === type)
      .filter((t) => !food || String(t.food_id) === food)
      .filter((t) => !q || txReference(t).toLowerCase().includes(q) || (foodById.get(t.food_id)?.name ?? '').toLowerCase().includes(q));
  }, [txs, type, food, search, foodById]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pageCount);
  const visible = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  const foodsInMonth = Array.from(new Set(txs.map((t) => t.food_id)))
    .map((id) => foodById.get(id))
    .filter((f): f is StockRow => Boolean(f))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const columns: Column<Transaction>[] = [
    { key: 'date', header: 'Ngày', width: '11%', cell: (t) => <span className="num">{formatDate(t.date)}</span> },
    {
      key: 'type',
      header: 'Loại',
      width: '11%',
      cell: (t) => <Badge tone={t.transaction_type === 'IN' ? 'ok' : t.transaction_type === 'OUT' ? 'info' : 'warn'}>{TX_LABELS[t.transaction_type]}</Badge>,
    },
    { key: 'food', header: 'Mặt hàng', width: '24%', cell: (t) => <span className={tableText.primaryText}>{foodById.get(t.food_id)?.name ?? `#${t.food_id}`}</span> },
    { key: 'ref', header: 'Chứng từ', width: '18%', cell: (t) => <span className={tableText.muted}>{txReference(t)}</span> },
    { key: 'qty', header: 'Số lượng', width: '12%', align: 'right', cell: (t) => formatQty(t.quantity_change, foodById.get(t.food_id)?.unit) },
    { key: 'cost', header: 'Đơn giá', width: '12%', align: 'right', cell: (t) => <span className={tableText.muted}>{formatMoney(t.cost)}</span> },
    { key: 'value', header: 'Giá trị', width: '12%', align: 'right', cell: (t) => <span className={tableText.strong}>{formatMoney(t.value_delta)}</span> },
  ];

  return (
    <Stack gap="lg">
      <Toolbar>
        <Segmented
          label="Lọc theo loại giao dịch"
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'Tất cả', count: txs.length },
            { value: 'IN', label: 'Nhập' },
            { value: 'OUT', label: 'Xuất' },
            { value: 'ADJUST', label: 'Kiểm kê' },
          ]}
        />
        <div className={styles.filters}>
          <SelectField
            label={<span className="sr-only">Mặt hàng</span>}
            value={food}
            onChange={(e) => {
              setFood(e.target.value);
              setPage(1);
            }}
            fieldClassName={styles.foodFilter}
          >
            <option value="">Mọi mặt hàng</option>
            {foodsInMonth.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </SelectField>
          <SearchField
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Tìm chứng từ…"
          />
        </div>
      </Toolbar>
      {filtered.length === 0 ? (
        <EmptyState icon={<IconChart size={32} />} title="Không có giao dịch phù hợp">
          Đổi tháng hoặc bộ lọc để xem thêm.
        </EmptyState>
      ) : (
        <>
          <DataTable caption="Sổ giao dịch kho" rows={visible} rowKey={(t) => t.id} columns={columns} minWidth="860px" />
          <Pagination page={cur} pageCount={pageCount} onPageChange={setPage} summary={`Đang hiện ${visible.length} trong ${filtered.length} giao dịch, mới nhất trước`} />
        </>
      )}
    </Stack>
  );
}
