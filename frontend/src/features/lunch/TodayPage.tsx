/**
 * SF69 /bua-trua?ngay=: "Hôm nay" — một ngày ăn đi qua 7 bước Suất → Thực đơn → Nhu cầu → Đơn → Nhận → Xuất → Đóng ngày.
 * Mỗi bước đọc trạng thái thật từ API (số suất, thực đơn, nhu cầu, đơn đặt, phiếu xuất, chi phí); không lưu gì riêng.
 * Chi phí ngày = giá trị xuất cho bếp của ngày; chi phí/suất chia cho số suất THỰC TẾ đã chốt.
 * Đóng ngày cần chốt thực tế và mọi phiếu xuất đã chốt; có chênh lệch (đã xuất − cần) thì phải ghi chú. Mở lại cần lý do.
 * SF73: ảnh suất ăn thực tế của ngày (MealPhotos). Đây là trang mở đầu sau đăng nhập.
 * SF78: dải ô số liệu, thanh tiến trình 7 bước nằm ngang, thẻ "Việc tiếp theo", thẻ thực đơn, chi tiết từng bước.
 */
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { IconArrowOut, IconBowl, IconChart, IconCheck, IconChevronRight, IconLock, IconUsers } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  ErrorState,
  KeyValueList,
  Modal,
  PageHeader,
  Skeleton,
  Stack,
  StatGrid,
  StatTile,
  TextareaField,
  useToast,
} from '../../components/ui';
import { formatDate, formatDateTime, formatMoney, formatMoneyShort, formatNumber, formatQty, todayISO } from '../../lib/format';
import { fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi } from '../../services/inventory';
import { lunchApi, type DayCost } from '../../services/lunch';
import { mealsApi } from '../../services/meals';
import { menusApi, type MenuDay } from '../../services/menus';
import { LunchTabs } from '../common/FeatureLayouts';
import { MealPhotos } from './MealPhotos';
import { ReasonModal } from './OrdersPage';
import { DayPicker, isZero, useLunchDate } from './shared';
import { STATE_BADGE, buildSteps, type Step } from './todaySteps';
import styles from './TodayPage.module.css';

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
  const nextIndex = steps.findIndex((st) => st.state === 'todo' || st.state === 'doing' || st.state === 'warn');
  const openMeal = meal.data && meal.data.status !== 'not_open' ? meal.data : null;

  return (
    <>
      <PageHeader
        overline={date === todayISO() ? 'Hôm nay' : 'Ngày ăn'}
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
            <StatGrid label="Số liệu ngày ăn">
              <StatTile
                label="Suất dự kiến"
                icon={<IconUsers size={18} />}
                tone="accent"
                value={openMeal?.planned_total != null ? formatNumber(openMeal.planned_total, 0) : 'chưa có'}
                muted={openMeal?.planned_total == null}
                hint={openMeal?.planned_confirmed_at ? 'đã chốt' : 'chưa chốt'}
              />
              <StatTile
                label="Suất thực tế"
                icon={<IconCheck size={18} />}
                tone="ok"
                value={openMeal?.actual_confirmed_at && openMeal.actual_total != null ? formatNumber(openMeal.actual_total, 0) : 'chưa chốt'}
                muted={!openMeal?.actual_confirmed_at}
                hint={openMeal?.actual_confirmed_at ? 'đã chốt sau bữa trưa' : 'nhập sau bữa trưa'}
              />
              <StatTile
                label="Chi phí ngày"
                icon={<IconArrowOut size={18} />}
                tone="warn"
                value={c ? formatMoneyShort(c.cost) : '—'}
                muted={!c}
                hint="giá trị xuất cho bếp"
              />
              <StatTile
                label="Chi phí / suất"
                icon={<IconChart size={18} />}
                tone="info"
                value={c?.cost_per_serving ? formatMoney(c.cost_per_serving) : '—'}
                muted={!c?.cost_per_serving}
                hint={c?.cost_per_serving ? 'theo suất thực tế' : (c?.cost_per_serving_reason ?? 'chưa có số liệu')}
              />
            </StatGrid>

            <section className={styles.progress} aria-labelledby="today-progress">
              <div className={styles.progressHead}>
                <h2 className={styles.progressTitle} id="today-progress">
                  Tiến độ ngày ăn
                </h2>
                <span className={styles.progressCount}>
                  {doneCount}/{steps.length} bước
                </span>
                {c?.closed ? <Badge tone="ok">Đã đóng ngày</Badge> : <Badge tone="warn">Chưa đóng</Badge>}
              </div>
              <div
                className={styles.bar}
                role="progressbar"
                aria-label="Số bước đã xong"
                aria-valuemin={0}
                aria-valuemax={steps.length}
                aria-valuenow={doneCount}
              >
                <span className={styles.barFill} style={{ '--p': `${(doneCount / Math.max(1, steps.length)) * 100}%` } as CSSProperties} />
              </div>
              <ol className={styles.tracker}>
                {steps.map((st, i) => (
                  <li key={st.key} className={`${styles.node} ${styles[st.state]} ${i === nextIndex ? styles.current : ''}`}>
                    <span className={styles.dot} aria-hidden="true">
                      {st.state === 'done' ? <IconCheck size={16} strokeWidth={2.6} /> : i + 1}
                    </span>
                    <span className={styles.nodeTitle}>{st.title}</span>
                    <span className={styles.nodeState}>{STATE_BADGE[st.state].label}</span>
                  </li>
                ))}
              </ol>
            </section>

            <div className={styles.split}>
              <NextStep
                step={nextIndex >= 0 ? steps[nextIndex] : null}
                index={nextIndex}
                total={steps.length}
                closed={Boolean(c?.closed)}
                canClose={Boolean(c)}
                onClose={() => setDialog('close')}
              />
              <MenuCard date={date} menu={menuDay} />
            </div>

            <section aria-labelledby="today-steps">
              <h2 className={styles.sectionHead} id="today-steps">
                Chi tiết từng bước
              </h2>
              <ol className={styles.steps}>
                {steps.map((st, i) => (
                  <li key={st.key} className={`${styles.stepCard} ${styles[st.state]}`}>
                    <div className={styles.stepHead}>
                      <span className={styles.stepNo} aria-hidden="true">
                        {st.state === 'done' ? <IconCheck size={14} strokeWidth={2.6} /> : i + 1}
                      </span>
                      <h3 className={styles.stepTitle}>{st.title}</h3>
                      <Badge tone={STATE_BADGE[st.state].tone}>{STATE_BADGE[st.state].label}</Badge>
                    </div>
                    <p className={styles.stepDetail}>{st.detail}</p>
                    {st.link ? (
                      <Link className={styles.stepLink} to={st.link.to}>
                        {st.link.label}
                        <IconChevronRight size={16} />
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>

            <MealPhotos date={date} dayOpen={Boolean(openMeal)} closed={Boolean(c?.closed)} />

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

/** Thẻ "Việc tiếp theo": bước đầu tiên chưa xong, kèm nút đi thẳng tới màn làm bước đó. */
function NextStep({
  step,
  index,
  total,
  closed,
  canClose,
  onClose,
}: {
  step: Step | null;
  index: number;
  total: number;
  closed: boolean;
  canClose: boolean;
  onClose: () => void;
}) {
  if (!step) {
    return (
      <section className={`${styles.next} ${styles.nextDone}`} aria-label="Việc tiếp theo">
        <p className={styles.nextEyebrow}>Việc tiếp theo</p>
        <p className={styles.nextTitle}>{closed ? 'Ngày ăn đã hoàn tất' : 'Đã xong mọi bước'}</p>
        <p className={styles.nextDetail}>
          {closed ? 'Chi phí mỗi suất đã chốt theo số suất thực tế.' : 'Kiểm tra lại rồi đóng ngày để chốt chi phí.'}
        </p>
      </section>
    );
  }
  return (
    <section className={styles.next} aria-label="Việc tiếp theo">
      <p className={styles.nextEyebrow}>
        Việc tiếp theo · bước {index + 1}/{total}
      </p>
      <p className={styles.nextTitle}>{step.title}</p>
      <p className={styles.nextDetail}>{step.detail}</p>
      {step.link ? (
        <Link className={styles.nextCta} to={step.link.to}>
          Mở {step.link.label.toLowerCase()}
          <IconChevronRight size={18} />
        </Link>
      ) : step.key === 'dong' ? (
        <Button write icon={<IconCheck size={18} />} disabled={!canClose} onClick={onClose}>
          Đóng ngày
        </Button>
      ) : null}
    </section>
  );
}

/** Thực đơn của ngày dạng chip món; ngày nghỉ hiện lý do. */
function MenuCard({ date, menu }: { date: string; menu: MenuDay | undefined }) {
  const off = menu && menu.status !== 'menu';
  return (
    <section className={styles.menu} aria-labelledby="today-menu">
      <div className={styles.menuHead}>
        <span className={styles.menuIcon} aria-hidden="true">
          <IconBowl size={20} />
        </span>
        <h2 className={styles.menuTitle} id="today-menu">
          {menu ? `Thực đơn ${menu.weekday_label}` : 'Thực đơn'}
        </h2>
      </div>
      {off ? (
        <p className={styles.menuEmpty}>{menu.status === 'holiday' ? `Ngày nghỉ: ${menu.holiday_name ?? 'ngày lễ'}.` : 'Nghỉ cuối tuần.'}</p>
      ) : menu?.dishes.length ? (
        <ul className={styles.dishes}>
          {menu.dishes.map((d) => (
            <li key={d.dish_id} className={styles.dish}>
              {d.dish_name}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.menuEmpty}>Chưa có thực đơn cho ngày này.</p>
      )}
      <Link className={styles.stepLink} to={`/mon-an/thuc-don?tuan=${date}`}>
        Thực đơn tuần
        <IconChevronRight size={16} />
      </Link>
    </section>
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
