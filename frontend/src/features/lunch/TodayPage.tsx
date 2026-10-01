/**
 * SF69 /bua-trua?ngay=: "Hôm nay" — một ngày ăn đi qua 7 bước Suất → Thực đơn → Nhu cầu → Đơn → Nhận → Xuất → Đóng ngày.
 * Mỗi bước đọc trạng thái thật từ API (số suất, thực đơn, nhu cầu, đơn đặt, phiếu xuất, chi phí); không lưu gì riêng.
 * Chi phí ngày = giá trị xuất cho bếp của ngày; chi phí/suất chia cho số suất THỰC TẾ đã chốt.
 * Đóng ngày cần chốt thực tế và mọi phiếu xuất đã chốt; có chênh lệch (đã xuất − cần) thì phải ghi chú. Mở lại cần lý do.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconCheck, IconLock } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  ErrorState,
  KeyValueList,
  Modal,
  PageHeader,
  SectionTitle,
  Skeleton,
  Stack,
  TextareaField,
  useToast,
} from '../../components/ui';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatQty, todayISO } from '../../lib/format';
import { fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi, type Issue } from '../../services/inventory';
import { lunchApi, type DayCost, type DayDemand, type PurchaseOrder } from '../../services/lunch';
import { mealsApi, type MealDay } from '../../services/meals';
import { menusApi, type MenuDay } from '../../services/menus';
import { LunchTabs } from '../common/FeatureLayouts';
import s from '../inventory/shared.module.css';
import { ReasonModal } from './OrdersPage';
import { DayPicker, isZero, useLunchDate } from './shared';
import styles from './TodayPage.module.css';

type StepState = 'done' | 'doing' | 'todo' | 'warn' | 'skip';
type Step = { key: string; title: string; state: StepState; detail: ReactNode; link?: { to: string; label: string } };

const STATE_BADGE: Record<StepState, { label: string; tone: 'ok' | 'info' | 'neutral' | 'warn' }> = {
  done: { label: 'Xong', tone: 'ok' },
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
  const doneCount = steps.filter((st) => st.state === 'done' || st.state === 'skip').length;

  return (
    <>
      <PageHeader
        overline={date === todayISO() ? 'Hôm nay' : undefined}
        title={`Bữa trưa ${formatDate(date)}`}
        description="Theo dõi một ngày ăn từ số suất tới đóng ngày, chi phí mỗi suất theo số suất thực tế."
        actions={
          c?.closed ? (
            <Button write variant="secondary" icon={<IconLock size={18} />} onClick={() => setDialog('reopen')}>
              Mở lại ngày
            </Button>
          ) : (
            <Button write icon={<IconCheck size={18} />} disabled={!c} onClick={() => setDialog('close')}>
              Đóng ngày
            </Button>
          )
        }
      />
      <LunchTabs date={date} />
      <Stack gap="lg">
        <DayPicker date={date} onChange={setDate} />
        {loading ? (
          <Skeleton rows={7} label="Đang tải trạng thái ngày ăn" />
        ) : error ? (
          <ErrorState message={error} onRetry={reloadAll} />
        ) : (
          <>
            <section className={styles.cost} aria-label="Chi phí ngày">
              <div className={styles.costItem}>
                <span className={styles.costLabel}>Chi phí ngày</span>
                <span className={`${styles.costValue} num`}>{c ? formatMoney(c.cost) : '—'}</span>
              </div>
              <div className={styles.costItem}>
                <span className={styles.costLabel}>Suất thực tế</span>
                <span className={`${styles.costValue} num`}>{c?.actual_total != null ? formatNumber(c.actual_total, 0) : '—'}</span>
              </div>
              <div className={styles.costItem}>
                <span className={styles.costLabel}>Chi phí / suất</span>
                <span className={`${styles.costValue} num`}>{c?.cost_per_serving ? formatMoney(c.cost_per_serving) : '—'}</span>
                {c && !c.cost_per_serving && c.cost_per_serving_reason ? <span className={s.muted}>{c.cost_per_serving_reason}</span> : null}
              </div>
              <div className={styles.costItem}>
                <span className={styles.costLabel}>Trạng thái</span>
                {c?.closed ? <Badge tone="ok">Đã đóng ngày</Badge> : <Badge tone="warn">Chưa đóng</Badge>}
              </div>
            </section>

            <SectionTitle>
              Tiến độ ({doneCount}/{steps.length} bước)
            </SectionTitle>
            <ol className={styles.timeline}>
              {steps.map((st, i) => (
                <li key={st.key} className={`${styles.step} ${styles[st.state]}`}>
                  <span className={styles.marker} aria-hidden="true">
                    {st.state === 'done' ? <IconCheck size={16} /> : i + 1}
                  </span>
                  <div className={styles.stepBody}>
                    <div className={styles.stepHead}>
                      <h3 className={styles.stepTitle}>{st.title}</h3>
                      <Badge tone={STATE_BADGE[st.state].tone}>{STATE_BADGE[st.state].label}</Badge>
                    </div>
                    <p className={styles.stepDetail}>{st.detail}</p>
                    {st.link ? (
                      <Link className={styles.stepLink} to={st.link.to}>
                        {st.link.label}
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>

            {c?.close ? (
              <KeyValueList
                items={[
                  { label: 'Đóng ngày lúc', value: `${formatDateTime(c.close.closed_at)} · ${c.close.closed_by}` },
                  { label: 'Ghi chú khi đóng', value: c.close.note || '—' },
                ]}
              />
            ) : null}
          </>
        )}
      </Stack>

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
          <Button variant="secondary" disabled={busy} onClick={onClose}>
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
