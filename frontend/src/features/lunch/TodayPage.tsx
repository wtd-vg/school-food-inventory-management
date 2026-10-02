/**
 * SF69 /bua-trua?ngay=: "Hôm nay" — một ngày ăn đi qua 7 bước Suất → Thực đơn → Nhu cầu → Đơn → Nhận → Xuất → Đóng ngày.
 * Mỗi bước đọc trạng thái thật từ API (số suất, thực đơn, nhu cầu, đơn đặt, phiếu xuất, chi phí); không lưu gì riêng.
 * Chi phí ngày = giá trị xuất cho bếp của ngày; chi phí/suất chia cho số suất THỰC TẾ đã chốt.
 * Đóng ngày cần chốt thực tế và mọi phiếu xuất đã chốt; có chênh lệch (đã xuất − cần) thì phải ghi chú. Mở lại cần lý do.
 * SF73: ảnh suất ăn thực tế của ngày (MealPhotos). Đây là trang mở đầu sau đăng nhập.
 * SF78: khối Suất ăn (vòng theo lớp) + Xuất bếp (thanh đã xuất/cần), tiến trình 7 bước bấm được kèm dải "Tiếp theo",
 *   dòng thực đơn. Ít chữ, không hàng thẻ KPI, màu phẳng.
 */
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { IconBowl, IconCheck, IconChevronRight, IconLock } from '../../components/icons';
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
  TextareaField,
  useToast,
} from '../../components/ui';
import { formatDate, formatDateTime, formatQty, todayISO } from '../../lib/format';
import { fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi } from '../../services/inventory';
import { lunchApi, type DayCost } from '../../services/lunch';
import { mealsApi } from '../../services/meals';
import { menusApi } from '../../services/menus';
import { LunchTabs } from '../common/FeatureLayouts';
import { MealPhotos } from './MealPhotos';
import { ReasonModal } from './OrdersPage';
import { DayPicker, isZero, useLunchDate } from './shared';
import { STATE_BADGE, buildSteps } from './todaySteps';
import { IssueBars, MealsRing } from './TodayWidgets';
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
  const next = nextIndex >= 0 ? steps[nextIndex] : null;

  return (
    <>
      <PageHeader
        title={date === todayISO() ? 'Hôm nay' : 'Ngày ăn'}
        subtitle={`Bữa trưa ${formatDate(date)}`}
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
            <div className={styles.widgets}>
              <MealsRing meal={meal.data} date={date} />
              <IssueBars cost={c} date={date} />
            </div>

            <section className={styles.progress} aria-labelledby="today-progress">
              <div className={styles.progressHead}>
                <h2 className={styles.progressTitle} id="today-progress">
                  Tiến độ
                </h2>
                <span className={styles.progressCount}>
                  {doneCount}/{steps.length}
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
                {steps.map((st, i) => {
                  const body = (
                    <>
                      <span className={styles.dot} aria-hidden="true">
                        {st.state === 'done' ? <IconCheck size={16} strokeWidth={2.6} /> : i + 1}
                      </span>
                      <span className={styles.nodeTitle}>{st.title}</span>
                      <span className={styles.nodeState}>{STATE_BADGE[st.state].label}</span>
                    </>
                  );
                  return (
                    <li key={st.key} className={`${styles.node} ${styles[st.state]} ${i === nextIndex ? styles.current : ''}`}>
                      {st.link ? (
                        <Link className={styles.nodeLink} to={st.link.to}>
                          {body}
                        </Link>
                      ) : (
                        <span className={styles.nodeLink}>{body}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {next ? (
                <div className={styles.next}>
                  <span className={styles.nextLabel}>Tiếp theo</span>
                  <span className={styles.nextText}>
                    <strong>{next.title}</strong> · {next.detail}
                  </span>
                  {next.link ? (
                    <Link className={styles.nextCta} to={next.link.to}>
                      Mở
                      <IconChevronRight size={16} />
                    </Link>
                  ) : next.key === 'dong' ? (
                    <Button write size="sm" icon={<IconCheck size={16} />} disabled={!c} onClick={() => setDialog('close')}>
                      Đóng ngày
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className={styles.menu} aria-labelledby="today-menu">
              <h2 className={styles.menuTitle} id="today-menu">
                <IconBowl size={18} />
                {menuDay ? menuDay.weekday_label : 'Thực đơn'}
              </h2>
              {menuDay && menuDay.status !== 'menu' ? (
                <span className={styles.menuEmpty}>{menuDay.status === 'holiday' ? (menuDay.holiday_name ?? 'Ngày lễ') : 'Nghỉ cuối tuần'}</span>
              ) : menuDay?.dishes.length ? (
                <ul className={styles.dishes}>
                  {menuDay.dishes.map((d) => (
                    <li key={d.dish_id} className={styles.dish}>
                      {d.dish_name}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={styles.menuEmpty}>Chưa có thực đơn</span>
              )}
              <Link className={styles.menuLink} to={`/mon-an/thuc-don?tuan=${date}`}>
                Thực đơn tuần
                <IconChevronRight size={16} />
              </Link>
            </section>

            <MealPhotos date={date} dayOpen={Boolean(meal.data && meal.data.status !== 'not_open')} closed={Boolean(c?.closed)} />

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
