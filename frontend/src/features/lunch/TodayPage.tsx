/**
 * SF69 /bua-trua?ngay=: "Hôm nay" — một ngày ăn đi qua 7 bước Suất → Thực đơn → Nhu cầu → Đơn → Nhận → Xuất → Đóng ngày.
 * Mỗi bước đọc trạng thái thật từ API (số suất, thực đơn, nhu cầu, đơn đặt, phiếu xuất, chi phí); không lưu gì riêng.
 * Chi phí ngày = giá trị xuất cho bếp của ngày; chi phí/suất chia cho số suất THỰC TẾ đã chốt.
 * Đóng ngày cần chốt thực tế và mọi phiếu xuất đã chốt; có chênh lệch (đã xuất − cần) thì phải ghi chú. Mở lại cần lý do.
 * SF73: ảnh suất ăn thực tế của ngày (MealPhotos). Đây là trang mở đầu sau đăng nhập.
 * SF78: bố cục "Tổng quan" — số suất theo khối, kho theo nhóm, việc trong ngày, chi phí mỗi suất, thực đơn tuần.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconCheck, IconLock, IconPlus } from '../../components/icons';
import {
  Badge,
  type BadgeTone,
  BarChart,
  type BarDatum,
  Button,
  Callout,
  DonutChart,
  type DonutSegment,
  ErrorState,
  HBars,
  InfoTiles,
  KeyValueList,
  Modal,
  PageHeader,
  Panel,
  SearchField,
  Segmented,
  Skeleton,
  Stack,
  Stat,
  Tabs,
  TextareaField,
  TimedTask,
  Tray,
  type TrayTone,
  useToast,
} from '../../components/ui';
import { parseDec, toFixed } from '../../lib/decimal';
import {
  formatAxisMoney,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNowStamp,
  formatNumber,
  formatQty,
  formatShortDate,
  formatWeekdayShort,
  todayISO,
} from '../../lib/format';
import { matchesQuery } from '../../lib/text';
import { catalogApi } from '../../services/catalog';
import { fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi, type Issue } from '../../services/inventory';
import { lunchApi, type DayCost, type DayDemand, type PurchaseOrder } from '../../services/lunch';
import { mealsApi, type MealDay } from '../../services/meals';
import { isSchoolDay, menusApi, shiftDate, type MenuDay } from '../../services/menus';
import { MealPhotos } from './MealPhotos';
import { ReasonModal } from './OrdersPage';
import { DayPicker, isZero, useLunchDate } from './shared';
import styles from './TodayPage.module.css';

type StepState = 'done' | 'doing' | 'todo' | 'warn' | 'skip';
type Step = { key: string; title: string; state: StepState; detail: ReactNode; link?: { to: string; label: string } };

const STATE_BADGE: Record<StepState, { label: string; tone: BadgeTone }> = {
  done: { label: 'Xong', tone: 'done' },
  doing: { label: 'Đang làm', tone: 'info' },
  todo: { label: 'Chưa làm', tone: 'neutral' },
  warn: { label: 'Cần xem lại', tone: 'warn' },
  skip: { label: 'Không cần', tone: 'neutral' },
};

/** Ghép trạng thái thật của các API thành 7 bước. Ngày nghỉ: chỉ bước Thực đơn có nghĩa. */
function buildSteps(
  date: string,
  meal: MealDay | undefined,
  menu: MenuDay | undefined,
  demand: DayDemand | undefined,
  orders: PurchaseOrder[],
  issues: Issue[],
  cost: DayCost | null,
): Step[] {
  const q = `?ngay=${date}`;
  const steps: Step[] = [];

  // 1. Số suất
  if (!meal || meal.status === 'not_open') {
    steps.push({ key: 'suat', title: 'Số suất', state: 'todo', detail: 'Ngày chưa mở.', link: { to: `/lop-hoc/so-suat${q}`, label: 'Mở ngày, nhập số suất' } });
  } else {
    const planned = meal.planned_confirmed_at ? `Dự kiến ${formatNumber(meal.planned_total, 0)} suất (đã chốt)` : 'Dự kiến chưa chốt';
    const actual = meal.actual_confirmed_at ? `thực tế ${formatNumber(meal.actual_total, 0)} suất (đã chốt)` : 'thực tế chưa chốt';
    steps.push({
      key: 'suat',
      title: 'Số suất',
      state: meal.actual_confirmed_at ? 'done' : meal.planned_confirmed_at ? 'doing' : 'todo',
      detail: `${planned}; ${actual}.`,
      link: { to: `/lop-hoc/so-suat${q}`, label: 'Số suất' },
    });
  }

  // 2. Thực đơn
  if (menu && menu.status !== 'menu') {
    steps.push({ key: 'menu', title: 'Thực đơn', state: 'skip', detail: menu.status === 'holiday' ? `Ngày nghỉ: ${menu.holiday_name ?? 'ngày lễ'}.` : 'Nghỉ cuối tuần.' });
  } else {
    steps.push({
      key: 'menu',
      title: 'Thực đơn',
      state: menu?.dishes.length ? 'done' : 'todo',
      detail: menu?.dishes.length ? menu.dishes.map((d) => d.dish_name).join(', ') : 'Chưa có thực đơn cho ngày này.',
      link: { to: `/mon-an/thuc-don?tuan=${date}`, label: 'Thực đơn tuần' },
    });
  }

  // 3. Nhu cầu
  const current = demand?.current ?? null;
  const approved = current?.status === 'approved' ? current : null;
  steps.push({
    key: 'nhu-cau',
    title: 'Nhu cầu & đề xuất',
    state: demand?.is_outdated ? 'warn' : approved ? 'done' : current ? 'doing' : 'todo',
    detail: demand?.is_outdated
      ? 'Số suất hoặc thực đơn đã đổi sau khi tính: tính lại.'
      : approved
        ? `Đã duyệt bản ${approved.revision} (${formatNumber(approved.servings, 0)} suất).`
        : current
          ? `Bản tính ${current.revision} chưa duyệt.`
          : 'Chưa tính nhu cầu.',
    link: { to: `/bua-trua/nhu-cau${q}`, label: 'Nhu cầu & đề xuất' },
  });

  // 4. Đơn đặt & 5. Nhận hàng
  const needBuy = approved ? approved.lines.some((l) => !isZero(l.to_buy_qty)) : false;
  const live = orders.filter((o) => o.status !== 'cancelled');
  if (approved && !needBuy && !live.length) {
    steps.push({ key: 'don', title: 'Đơn đặt', state: 'skip', detail: 'Tồn và hàng chờ về đã đủ, không cần mua.' });
    steps.push({ key: 'nhan', title: 'Nhận hàng', state: 'skip', detail: 'Không có đơn cho ngày này.' });
  } else {
    const sentOrDone = live.length > 0 && live.every((o) => o.status === 'sent' || o.status === 'closed');
    steps.push({
      key: 'don',
      title: 'Đơn đặt',
      state: !live.length ? 'todo' : sentOrDone ? 'done' : 'doing',
      detail: live.length ? live.map((o) => `${o.code} (${o.supplier_name})`).join(', ') : needBuy ? 'Cần tạo đơn cho phần phải mua.' : 'Chưa có đề xuất đã duyệt.',
      link: { to: live.length === 1 ? `/bua-trua/don-dat?don=${live[0].id}` : '/bua-trua/don-dat', label: 'Đơn đặt' },
    });
    const allIn = live.length > 0 && live.every((o) => o.status === 'closed');
    const open = live.flatMap((o) => o.lines.filter((l) => !isZero(l.qty_open)).map((l) => `${l.food_name} còn ${formatQty(l.qty_open, l.unit)}`));
    steps.push({
      key: 'nhan',
      title: 'Nhận hàng',
      state: allIn ? 'done' : live.some((o) => o.status === 'sent') ? 'doing' : 'todo',
      detail: allIn ? 'Đã nhận đủ / đã đóng đơn.' : open.length ? open.join(' · ') : 'Chưa có hàng về.',
      link: { to: live.length === 1 ? `/bua-trua/nhan-hang?don=${live[0].id}` : '/bua-trua/nhan-hang', label: 'Nhận hàng' },
    });
  }

  // 6. Xuất bếp
  const posted = issues.filter((i) => i.status === 'POSTED');
  const drafts = issues.filter((i) => i.status === 'DRAFT');
  const missing = (cost?.foods ?? []).filter((f) => f.variance.startsWith('-'));
  steps.push({
    key: 'xuat',
    title: 'Xuất bếp',
    state: drafts.length ? 'doing' : posted.length && !missing.length ? 'done' : posted.length ? 'doing' : 'todo',
    detail: drafts.length
      ? `Có ${drafts.length} phiếu xuất nháp chưa chốt.`
      : posted.length
        ? missing.length
          ? `Còn thiếu: ${missing.map((f) => `${f.food_name} ${formatQty(f.variance.slice(1), f.unit)}`).join(', ')}.`
          : `Đã xuất ${posted.map((i) => i.code).join(', ')}.`
        : 'Chưa xuất cho bếp.',
    link: { to: `/bua-trua/xuat-bep${q}`, label: 'Xuất bếp' },
  });

  // 7. Đóng ngày
  steps.push({
    key: 'dong',
    title: 'Đóng ngày',
    state: cost?.closed ? 'done' : 'todo',
    detail: cost?.closed && cost.close ? `Đóng bởi ${cost.close.closed_by} lúc ${formatDateTime(cost.close.closed_at)}.` : 'Chưa đóng ngày.',
  });
  return steps;
}

export function TodayPage() {
  const [date, setDate] = useLunchDate();
  const meal = useApiQuery(() => mealsApi.get(date), [date]);
  const week = useApiQuery(() => menusApi.week(date), [date]);
  const demand = useApiQuery(() => lunchApi.demand(date), [date]);
  const orders = useApiQuery(() => lunchApi.orders(), []);
  const issues = useApiQuery(() => inventoryApi.issues(), []);
  // Ngày chưa mở → API chi phí trả 409; coi như chưa có số liệu chi phí.
  const cost = useApiQuery(() => lunchApi.cost(date).catch(() => null), [date]);
  const [dialog, setDialog] = useState<'close' | 'reopen' | null>(null);
  const toast = useToast();

  const loading = meal.loading || week.loading || demand.loading || orders.loading || issues.loading || cost.loading;
  const error = meal.error || week.error || demand.error || orders.error || issues.error;
  const reloadAll = () => {
    meal.reload();
    demand.reload();
    orders.reload();
    issues.reload();
    cost.reload();
  };

  const menuDay = week.data?.days.find((d) => d.date === date);
  const dayOrders = (orders.data ?? []).filter((o) => o.lunch_date === date);
  const dayIssues = (issues.data ?? []).filter((i) => i.lunch_date === date);
  const c = cost.data ?? null;
  const steps = loading || error ? [] : buildSteps(date, meal.data, menuDay, demand.data, dayOrders, dayIssues, c);

  return (
    <>
      <PageHeader
        title="Tổng quan"
        meta={formatNowStamp()}
        actions={
          c?.closed ? (
            <Button write variant="secondary" icon={<IconLock size={18} />} onClick={() => setDialog('reopen')}>
              Mở lại ngày
            </Button>
          ) : (
            <Button write icon={<IconCheck size={18} />} disabled={!c} title={!c ? 'Ngày chưa mở số suất.' : undefined} onClick={() => setDialog('close')}>
              Đóng ngày {formatShortDate(date)}
            </Button>
          )
        }
      />
      <DayPicker date={date} onChange={setDate} />
      {loading && !meal.data ? (
        <Skeleton rows={7} label="Đang tải tổng quan ngày ăn" />
      ) : error ? (
        <ErrorState message={error} onRetry={reloadAll} />
      ) : (
        <>
          <div className={styles.grid}>
            <div className={styles.col}>
              <MealCard date={date} meal={meal.data} />
              <StockCard />
            </div>
            <StepsCard key={date} steps={steps} />
            <CostCard date={date} cost={c} />
          </div>
          <WeekMenuCard date={date} week={week.data?.days ?? []} />
          <Panel>
            <MealPhotos date={date} dayOpen={Boolean(meal.data && meal.data.status !== 'not_open')} closed={Boolean(c?.closed)} />
            {c?.close ? (
              <KeyValueList
                items={[
                  { label: 'Đóng ngày lúc', value: `${formatDateTime(c.close.closed_at)} · ${c.close.closed_by}` },
                  { label: 'Ghi chú khi đóng', value: c.close.note || '—' },
                ]}
              />
            ) : null}
          </Panel>
        </>
      )}

      {dialog === 'close' && c ? (
        <CloseDayModal
          cost={c}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast.show(`Đã đóng ngày ${formatDate(date)}.`);
            reloadAll();
          }}
        />
      ) : null}
      {dialog === 'reopen' ? (
        <ReopenDay
          date={date}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast.show(`Đã mở lại ngày ${formatDate(date)}.`);
            reloadAll();
          }}
        />
      ) : null}
    </>
  );
}

/* ---------- Số suất theo khối (biểu đồ vòng) ---------- */
function MealCard({ date, meal }: { date: string; meal: MealDay | undefined }) {
  const classes = useApiQuery(() => catalogApi.classes(), []);
  const link = `/lop-hoc/so-suat?ngay=${date}`;
  if (!meal || meal.status === 'not_open') {
    return (
      <Panel title="Số suất" action={<Badge>Chưa mở ngày</Badge>}>
        <p className={styles.note}>Ngày {formatDate(date)} chưa mở để nhập số suất.</p>
        <Link className={styles.more} to={link}>
          Mở ngày, nhập số suất
        </Link>
      </Panel>
    );
  }
  const useActual = Boolean(meal.actual_confirmed_at);
  const grade = new Map((classes.data ?? []).map((k) => [k.id, k.grade]));
  const byGrade = new Map<number | null, number>();
  for (const l of meal.lines) {
    const n = (useActual ? l.actual : l.planned) ?? 0;
    const g = grade.get(l.class_id) ?? null;
    byGrade.set(g, (byGrade.get(g) ?? 0) + n);
  }
  const staff = (useActual ? meal.staff_actual : meal.staff_planned) ?? 0;
  const grades = [...byGrade.entries()].sort((a, b) => (a[0] ?? 99) - (b[0] ?? 99));
  const segments: DonutSegment[] = [
    ...grades.map(([g, n]) => ({
      key: `g${g}`,
      label: g ? `Khối ${g}` : 'Chưa xếp khối',
      value: n,
      display: formatNumber(n, 0),
      tone: g && g >= 1 && g <= 5 ? (g as 1 | 2 | 3 | 4 | 5) : ('other' as const),
    })),
    ...(staff ? [{ key: 'staff', label: 'Nhân viên', value: staff, display: formatNumber(staff, 0), tone: 'other' as const }] : []),
  ];
  const total = segments.reduce((n, sg) => n + sg.value, 0);
  const missing = meal.lines.filter((l) => (useActual ? l.actual : l.planned) === null).length;
  const chip = meal.actual_confirmed_at ? (
    <Badge tone="done">Thực tế đã chốt</Badge>
  ) : meal.planned_confirmed_at ? (
    <Badge tone="info">Dự kiến đã chốt</Badge>
  ) : missing ? (
    <Badge tone="warn">{missing} lớp chưa nhập</Badge>
  ) : (
    <Badge tone="warn">Dự kiến chưa chốt</Badge>
  );
  return (
    <Panel title={date === todayISO() ? 'Sĩ số hôm nay' : `Số suất ${formatShortDate(date)}`} action={chip}>
      <DonutChart
        segments={segments}
        caption={`Số suất ${useActual ? 'thực tế' : 'dự kiến'} theo khối, tổng ${total}`}
        centerValue={formatNumber(total, 0)}
        centerLabel={useActual ? 'suất thực tế' : 'suất dự kiến'}
      />
      <Link className={styles.more} to={link}>
        Xem số suất từng lớp
      </Link>
    </Panel>
  );
}

/* ---------- Kho theo nhóm (thanh ngang: số mặt hàng mỗi nhóm) ---------- */
function StockCard() {
  const stock = useApiQuery(() => Promise.all([inventoryApi.stock(), inventoryApi.foods()]), []);
  const rows = useMemo(() => {
    if (!stock.data) return [];
    const [list, foods] = stock.data;
    const active = new Set(foods.filter((f) => f.is_active).map((f) => f.id));
    const counts = new Map<string, number>();
    for (const r of list) if (active.has(r.id)) counts.set(r.category_name || 'Chưa xếp nhóm', (counts.get(r.category_name || 'Chưa xếp nhóm') ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'));
  }, [stock.data]);
  const out = useMemo(() => {
    if (!stock.data) return 0;
    const [list, foods] = stock.data;
    const active = new Set(foods.filter((f) => f.is_active).map((f) => f.id));
    return list.filter((r) => active.has(r.id) && isZero(r.quantity)).length;
  }, [stock.data]);
  return (
    <Panel
      title="Kho theo nhóm"
      action={
        <Link className={styles.headLink} to="/kho">
          Mở kho
        </Link>
      }
    >
      {stock.loading && !stock.data ? (
        <Skeleton rows={3} />
      ) : stock.error ? (
        <ErrorState message={stock.error} onRetry={stock.reload} />
      ) : rows.length ? (
        <>
          <HBars caption="Số mặt hàng đang dùng theo nhóm" rows={rows.slice(0, 5).map(([name, n]) => ({ key: name, label: name, value: n, display: formatNumber(n, 0) }))} />
          {out ? (
            <Link to="/kho?nhom=het-hang" className={styles.chipLink}>
              <Badge tone="danger">{out} mặt hàng đang hết</Badge>
            </Link>
          ) : null}
        </>
      ) : (
        <p className={styles.note}>Chưa có mặt hàng.</p>
      )}
    </Panel>
  );
}

/* ---------- Việc trong ngày: 7 bước, mục chưa xong lên trước, xa hơn nhạt dần ---------- */
function StepsCard({ steps }: { steps: Step[] }) {
  const done = steps.filter((st) => st.state === 'done' || st.state === 'skip').length;
  const warn = steps.filter((st) => st.state === 'warn').length;
  const left = steps.length - done;
  const [picked, setView] = useState<'todo' | 'all' | null>(null);
  // Mặc định "Cần làm"; ngày đã xong hết thì hiện "Tất cả" để vẫn thấy lại 7 bước.
  const view = picked ?? (left ? 'todo' : 'all');
  const numbered = steps.map((st, i) => ({ ...st, n: i + 1 }));
  const shown = view === 'all' ? numbered : numbered.filter((st) => st.state !== 'done' && st.state !== 'skip');
  return (
    <Panel title="Việc trong ngày" action={<span className={`${styles.muted} num`}>{done}/{steps.length} bước</span>}>
      <div className={styles.counts}>
        <Stat value={done} label="Đã xong" />
        <Stat value={left} label="Còn lại" />
        <Stat value={warn} label="Cần xem lại" />
      </div>
      <Segmented
        label="Lọc bước"
        value={view}
        onChange={setView}
        options={[
          { value: 'todo', label: 'Cần làm', count: left },
          { value: 'all', label: 'Tất cả' },
        ]}
      />
      {shown.length ? (
        <ol className={styles.tasks}>
          {shown.map((st, i) => {
            const isDone = st.state === 'done' || st.state === 'skip';
            return (
              <TimedTask
                key={st.key}
                title={
                  <>
                    {st.title}
                    {st.state === 'warn' ? <span className="sr-only"> (cần xem lại)</span> : null}
                    {isDone ? <span className="sr-only"> ({STATE_BADGE[st.state].label.toLowerCase()})</span> : null}
                  </>
                }
                detail={st.detail}
                period="BƯỚC"
                time={String(st.n)}
                fade={view === 'all' ? 0 : (Math.min(i, 2) as 0 | 1 | 2)}
                done={isDone}
                to={st.link?.to}
                tone={st.key === 'dong' ? 'close' : 'default'}
              />
            );
          })}
        </ol>
      ) : (
        <p className={styles.note}>Đã xong mọi bước của ngày.</p>
      )}
    </Panel>
  );
}

/* ---------- Chi phí mỗi suất: ngày đang xem + cả tháng ---------- */
function CostCard({ date, cost }: { date: string; cost: DayCost | null }) {
  // 30 ngày tính tới ngày đang xem: đầu tháng vẫn có đủ cột để so sánh.
  const from = shiftDate(date, -29);
  const report = useApiQuery(() => lunchApi.dailyReport(from, date), [from, date]);
  const bars: BarDatum[] = (report.data?.days ?? [])
    .filter((d) => d.cost_per_serving)
    .map((d) => {
      const dec = parseDec(d.cost_per_serving ?? '0');
      return {
        key: d.date,
        label: formatShortDate(d.date),
        value: dec ? Number(toFixed(dec, 2)) : 0, // chỉ để vẽ cột
        display: formatMoney(d.cost_per_serving),
        highlight: d.date === date,
        tone: d.date === date ? ('current' as const) : undefined,
      };
    });
  return (
    <Panel
      title="Chi phí mỗi suất"
      action={
        <Link className={styles.headLink} to={`/bao-cao?thang=${date.slice(0, 7)}&muc=theo-ngay`}>
          Báo cáo
        </Link>
      }
    >
      <div className={styles.counts}>
        <Stat size="lg" value={cost?.cost_per_serving ? formatMoney(cost.cost_per_serving) : '—'} label={`Ngày ${formatShortDate(date)}`} />
        <Stat size="lg" value={report.data?.avg_cost_per_serving ? formatMoney(report.data.avg_cost_per_serving) : '—'} label="Bình quân 30 ngày" />
      </div>
      {cost && !cost.cost_per_serving && cost.cost_per_serving_reason ? <p className={styles.note}>{cost.cost_per_serving_reason}</p> : null}
      {report.loading && !report.data ? (
        <Skeleton rows={2} />
      ) : report.error ? (
        <ErrorState message={report.error} onRetry={report.reload} />
      ) : bars.length ? (
        <BarChart compact data={bars} caption={`Chi phí mỗi suất từng ngày ăn từ ${formatDate(from)} tới ${formatDate(date)}`} axis={formatAxisMoney} />
      ) : (
        <p className={styles.note}>30 ngày qua chưa có ngày nào tính được chi phí mỗi suất.</p>
      )}
      <InfoTiles
        items={[
          { label: 'Chi phí ngày', value: cost ? formatMoney(cost.cost) : '—' },
          { label: 'Suất thực tế', value: cost?.actual_total != null ? formatNumber(cost.actual_total, 0) : '—' },
        ]}
      />
    </Panel>
  );
}

/* ---------- Thực đơn tuần: thẻ món kèm khay cơm ---------- */
function WeekMenuCard({ date, week }: { date: string; week: MenuDay[] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [day, setDay] = useState<'all' | string>('all');
  const school = week.filter(isSchoolDay); // T2–T6, cộng Thứ Bảy khi có bữa trưa (SF79)
  const today = todayISO();
  const month = date.slice(0, 7);
  const report = useApiQuery(() => lunchApi.dailyReport(school[0]?.date ?? date, school[school.length - 1]?.date ?? date), [school[0]?.date, month]);
  const closed = new Set((report.data?.days ?? []).filter((d) => d.closed).map((d) => d.date));
  const cards = school.filter((d) => (day === 'all' || d.date === day) && (!q.trim() || d.dishes.some((x) => matchesQuery(q, x.dish_name))));
  const chip = (d: MenuDay) => {
    if (d.status === 'holiday') return <Badge tone="paused">Nghỉ</Badge>;
    if (closed.has(d.date)) return <Badge tone="done">Đã đóng</Badge>;
    if (d.date === today) return <Badge tone="info">Hôm nay</Badge>;
    if (!d.dishes.length) return <Badge tone="warn">Chưa có thực đơn</Badge>;
    return d.date < today ? <Badge>Đã qua</Badge> : <Badge>Đã lên thực đơn</Badge>;
  };
  const range = school.length ? `${formatShortDate(school[0].date)}–${formatShortDate(school[school.length - 1].date)}` : '';
  return (
    <Panel
      title={`Thực đơn tuần ${range}`}
      action={
        <Link className={styles.headLink} to={`/mon-an/thuc-don?tuan=${date}`}>
          Mở thực đơn tuần
        </Link>
      }
    >
      <div className={styles.menuTools}>
        <SearchField value={q} onValueChange={setQ} placeholder="Tìm món ăn" />
        <Button write icon={<IconPlus size={18} />} onClick={() => navigate('/mon-an?tao=1')}>
          Thêm món
        </Button>
      </div>
      <Tabs
        idPrefix="tuan"
        label="Ngày trong tuần"
        value={day}
        onChange={setDay}
        items={[{ value: 'all', label: 'Cả tuần' }, ...school.map((d) => ({ value: d.date, label: d.weekday_label }))]}
      />
      <div id="tuan-panel" role="tabpanel" aria-labelledby={`tuan-tab-${day}`}>
        {cards.length ? (
          <ul className={styles.dishGrid}>
            {cards.map((d) => {
              const names = d.dishes.map((x) => x.dish_name);
              const main = d.dishes[0]?.dish_id ?? 0;
              return (
                <li key={d.date}>
                  <Link to={`/bua-trua?ngay=${d.date}`} className={`${styles.dishCard} ${d.date === date ? styles.dishCurrent : ''}`} aria-current={d.date === date ? 'date' : undefined}>
                    <span className={styles.dishArt}>
                      <Tray main={((main % 5) + 1) as TrayTone} bg={((d.weekday % 5) + 1) as TrayTone} />
                    </span>
                    <span className={styles.dishBody}>
                      <span className={styles.dishHead}>
                        <span className={`${styles.dishDate} num`}>{formatWeekdayShort(d.date)}</span>
                        {chip(d)}
                      </span>
                      <span className={styles.dishName}>
                        {d.status === 'holiday' ? d.holiday_name || 'Ngày nghỉ' : names.length ? names[0] : 'Chưa có món'}
                      </span>
                      {names.length > 1 ? <span className={styles.dishMore}>{names.slice(1).join(', ')}</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.note}>{q.trim() ? `Không có món nào khớp “${q.trim()}” trong tuần này.` : 'Tuần này chưa có ngày học.'}</p>
        )}
      </div>
    </Panel>
  );
}

function CloseDayModal({ cost, onClose, onDone }: { cost: DayCost; onClose: () => void; onDone: () => void }) {
  const variances = cost.foods.filter((f) => !isZero(f.variance));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (variances.length && !note.trim()) {
      setFieldError('Có chênh lệch giữa lượng cần và đã xuất: ghi chú giải thích.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await lunchApi.close(cost.date, note.trim());
      onDone();
    } catch (err) {
      setError(messageOf(err));
      setFieldError(fieldsOf(err).note ?? '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Đóng ngày ${formatDate(cost.date)}?`}
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button write busy={busy} onClick={submit}>
            Đóng ngày
          </Button>
        </>
      }
    >
      <Stack>
        <p>Cần đã chốt số suất thực tế và mọi phiếu xuất của ngày đã chốt. Đóng xong không xuất thêm cho ngày này.</p>
        {variances.length ? (
          <Callout tone="warn" title="Chênh lệch giữa cần và đã xuất">
            {variances
              .map((f) => `${f.food_name}: cần ${formatQty(f.required, f.unit)}, đã xuất ${formatQty(f.issued, f.unit)}`)
              .join(' · ')}
          </Callout>
        ) : null}
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
        <TextareaField
          label="Ghi chú"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={3}
          error={fieldError}
          required={variances.length > 0}
          hint={variances.length ? undefined : 'Không bắt buộc khi không có chênh lệch.'}
        />
      </Stack>
    </Modal>
  );
}

function ReopenDay({ date, onClose, onDone }: { date: string; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <ReasonModal
        title={`Mở lại ngày ${formatDate(date)}?`}
        description={error || 'Lần đóng cũ vẫn giữ trong lịch sử kèm lý do mở lại.'}
        confirmLabel="Mở lại ngày"
        busy={busy}
        onCancel={onClose}
        onConfirm={async (reason) => {
          setBusy(true);
          setError('');
          try {
            await lunchApi.reopenClose(date, reason);
            onDone();
          } catch (err) {
            setError(messageOf(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
