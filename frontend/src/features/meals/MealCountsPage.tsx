/**
 * FE-08 /lop-hoc/so-suat: số suất theo ngày (meal_views.py, SF46/BE-12).
 * - ?ngay=YYYY-MM-DD. Ngày chưa mở → nút "Mở ngày" (chụp sĩ số các lớp đang học).
 * - Mỗi lớp nhập dự kiến/thực tế từ 0 tới sĩ số chụp. Ô trống = chưa nhập (null), KHÁC 0.
 * - Lưu kèm version; ai đó vừa sửa → 409, màn tải lại số mới nhất. Chốt dự kiến trước, rồi chốt thực tế.
 * - Mở lại số đã chốt phải ghi lý do (vào nhật ký). Hiệu trưởng chỉ xem.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { IconCalendar, IconCheck, IconLock } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Skeleton,
  Stack,
  TextareaField,
  TextField,
  Toolbar,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { formatDate, formatDateTime, formatNumber, todayISO } from '../../lib/format';
import { ApiError, fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { mealsApi, STAFF_MAX, type CountKind, type CountLine, type CountsInput, type OpenMealDay } from '../../services/meals';
import { ClassTabs } from '../common/FeatureLayouts';
import { useQueryParam } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import styles from './MealCountsPage.module.css';

const KIND_LABEL: Record<CountKind, string> = { planned: 'dự kiến', actual: 'thực tế' };
const STAFF_KEY = 'staff';

type Draft = Record<string, { planned: string; actual: string }>;

const toText = (n: number | null) => (n === null ? '' : String(n));

function draftOf(day: OpenMealDay): Draft {
  const d: Draft = {};
  for (const l of day.lines) d[String(l.class_id)] = { planned: toText(l.planned), actual: toText(l.actual) };
  d[STAFF_KEY] = { planned: toText(day.staff_planned), actual: toText(day.staff_actual) };
  return d;
}

/** "" → null (chưa nhập); số nguyên 0…max; còn lại → lỗi. */
function parseCount(text: string, max: number): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: true, value: null };
  if (!/^\d+$/.test(t)) return { ok: false, error: 'Nhập số nguyên.' };
  const n = Number(t);
  if (n > max) return { ok: false, error: `Tối đa ${max}.` };
  return { ok: true, value: n };
}

function sumText(values: string[]): number | null {
  const nums = values.map((v) => v.trim()).filter(Boolean).map(Number);
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

export function MealCountsPage() {
  const today = todayISO();
  const [date, setDate] = useQueryParam('ngay', today);
  const q = useApiQuery(() => mealsApi.get(date), [date]);
  const { canWrite } = useAuth();
  const [draft, setDraft] = useState<Draft>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'danger' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [locking, setLocking] = useState<CountKind | null>(null);
  const [reopening, setReopening] = useState<CountKind | null>(null);
  const toast = useToast();

  const day = q.data && q.data.status !== 'not_open' ? (q.data as OpenMealDay) : null;
  // Mỗi lần có dữ liệu mới từ máy chủ (tải, lưu, chốt, 409) thì đặt lại bản nháp theo số trên máy chủ.
  useEffect(() => {
    setDraft(day ? draftOf(day) : {});
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.id, day?.version]);

  const plannedLocked = Boolean(day?.planned_confirmed_at);
  const actualLocked = Boolean(day?.actual_confirmed_at);
  const original = day ? draftOf(day) : {};
  const dirty = day ? Object.keys(original).some((k) => original[k].planned !== draft[k]?.planned || original[k].actual !== draft[k]?.actual) : false;

  const handleConflict = (err: unknown) => {
    if (err instanceof ApiError && err.status === 409) {
      setNotice({ tone: 'warn', text: `${err.message} Đã tải lại số mới nhất.` });
      q.reload();
      return true;
    }
    return false;
  };

  const openDay = async () => {
    setBusy('open');
    setNotice(null);
    try {
      await mealsApi.open(date);
      toast.show(`Đã mở ngày ${formatDate(date)}.`);
      q.reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: messageOf(err) });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!day) return;
    setNotice(null);
    const next: Record<string, string> = {};
    const body: CountsInput = { version: day.version, lines: [] };
    for (const line of day.lines) {
      const key = String(line.class_id);
      const row: CountsInput['lines'][number] = { class_id: line.class_id };
      for (const kind of ['planned', 'actual'] as const) {
        if (kind === 'planned' ? plannedLocked : actualLocked) continue;
        if (draft[key]?.[kind] === original[key][kind]) continue;
        const parsed = parseCount(draft[key]?.[kind] ?? '', line.enrolled_snapshot);
        if (parsed.ok) row[kind] = parsed.value;
        else next[`${key}.${kind}`] = parsed.error;
      }
      if (row.planned !== undefined || row.actual !== undefined) body.lines.push(row);
    }
    for (const kind of ['planned', 'actual'] as const) {
      if (kind === 'planned' ? plannedLocked : actualLocked) continue;
      if (draft[STAFF_KEY]?.[kind] === original[STAFF_KEY][kind]) continue;
      const parsed = parseCount(draft[STAFF_KEY]?.[kind] ?? '', STAFF_MAX);
      if (parsed.ok) body[kind === 'planned' ? 'staff_planned' : 'staff_actual'] = parsed.value;
      else next[`${STAFF_KEY}.${kind}`] = parsed.error;
    }
    setErrors(next);
    if (Object.keys(next).length) {
      setNotice({ tone: 'danger', text: 'Kiểm tra lại các ô được đánh dấu.' });
      return;
    }
    setBusy('save');
    try {
      await mealsApi.save(date, body);
      toast.show('Đã lưu số suất.');
      q.reload();
    } catch (err) {
      if (handleConflict(err)) return;
      // errors["lines[i].planned"] → ô của lớp tương ứng.
      const fields = fieldsOf(err);
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        const m = /^lines\[(\d+)\]\.(planned|actual|class_id)$/.exec(k);
        if (m) {
          const line = body.lines[Number(m[1])];
          if (line) mapped[`${line.class_id}.${m[2] === 'class_id' ? 'planned' : m[2]}`] = v;
        } else if (k === 'staff_planned' || k === 'staff_actual') mapped[`${STAFF_KEY}.${k.slice(6)}`] = v;
      }
      setErrors(mapped);
      setNotice({ tone: 'danger', text: messageOf(err) });
    } finally {
      setBusy(null);
    }
  };

  const lock = async () => {
    if (!day || !locking) return;
    setBusy('lock');
    setNotice(null);
    try {
      await mealsApi.lock(date, locking, day.version);
      toast.show(`Đã chốt số ${KIND_LABEL[locking]}.`);
      setLocking(null);
      q.reload();
    } catch (err) {
      setLocking(null);
      if (!handleConflict(err)) setNotice({ tone: 'danger', text: messageOf(err) });
    } finally {
      setBusy(null);
    }
  };

  const setCell = (key: string, kind: CountKind, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { planned: '', actual: '' }), [kind]: value } }));

  const cellInput = (key: string, kind: CountKind, label: string, max: number) => {
    const locked = kind === 'planned' ? plannedLocked : actualLocked;
    return (
      <TextField
        label={label}
        fieldClassName={styles.cell}
        className={styles.countInput}
        inputMode="numeric"
        numeric
        value={draft[key]?.[kind] ?? ''}
        placeholder="Chưa nhập"
        disabled={locked || !canWrite}
        title={!canWrite ? 'Hiệu trưởng chỉ xem' : locked ? `Số ${KIND_LABEL[kind]} đã chốt` : `0 đến ${max}; để trống nếu chưa có số`}
        onChange={(e) => setCell(key, kind, e.target.value)}
        error={errors[`${key}.${kind}`]}
      />
    );
  };

  const columns: Column<CountLine>[] = [
    {
      key: 'class',
      header: 'Lớp',
      cell: (l) => (
        <span>
          <span className={tableText.strong}>{l.class_code}</span> <span className={tableText.muted}>{l.class_name}</span>
        </span>
      ),
    },
    { key: 'enrolled', header: 'Sĩ số', align: 'right', cell: (l) => l.enrolled_snapshot },
    { key: 'planned', header: 'Dự kiến', cell: (l) => cellInput(String(l.class_id), 'planned', `Dự kiến lớp ${l.class_code}`, l.enrolled_snapshot) },
    { key: 'actual', header: 'Thực tế', cell: (l) => cellInput(String(l.class_id), 'actual', `Thực tế lớp ${l.class_code}`, l.enrolled_snapshot) },
  ];

  const plannedSum = sumText(Object.values(draft).map((d) => d.planned));
  const actualSum = sumText(Object.values(draft).map((d) => d.actual));
  const missing = (kind: CountKind) => (day ? day.lines.filter((l) => !(draft[String(l.class_id)]?.[kind] ?? '').trim()).length : 0);

  return (
    <>
      <PageHeader title="Số suất" description="Số suất ăn trưa theo lớp: dự kiến (để tính nguyên liệu) và thực tế (để tính chi phí/suất)." />
      <ClassTabs />
      <Stack gap="lg">
        <Toolbar>
          <TextField label="Ngày" type="date" value={date} onChange={(e) => setDate(e.target.value || today)} />
          <span className={s.inlineGroup}>
            <Button variant="ghost" icon={<IconCalendar size={18} />} onClick={() => setDate(today)}>
              Hôm nay
            </Button>
          </span>
        </Toolbar>

        {notice ? (
          <Callout tone={notice.tone} role="alert">
            {notice.text}
          </Callout>
        ) : null}

        {q.loading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState message={q.error} onRetry={q.reload} />
        ) : !day ? (
          <EmptyState
            title={`Ngày ${formatDate(date)} chưa mở`}
            action={
              <Button write busy={busy === 'open'} onClick={openDay}>
                Mở ngày
              </Button>
            }
          >
            Mở ngày để chụp sĩ số các lớp đang học và bắt đầu nhập số suất.
          </EmptyState>
        ) : (
          <>
            <div className={styles.summary}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Dự kiến</span>
                <span className={`${styles.statValue} num`}>{plannedSum === null ? '—' : formatNumber(plannedSum, 0)}</span>
                {plannedLocked ? (
                  <Badge tone="ok">Đã chốt {formatDateTime(day.planned_confirmed_at)}</Badge>
                ) : (
                  <Badge tone="warn">Chưa chốt · {missing('planned')} lớp chưa nhập</Badge>
                )}
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Thực tế</span>
                <span className={`${styles.statValue} num`}>{actualSum === null ? '—' : formatNumber(actualSum, 0)}</span>
                {actualLocked ? (
                  <Badge tone="ok">Đã chốt {formatDateTime(day.actual_confirmed_at)}</Badge>
                ) : (
                  <Badge tone="warn">Chưa chốt · {missing('actual')} lớp chưa nhập</Badge>
                )}
              </div>
            </div>

            {day.lines.length ? (
              <DataTable caption={`Số suất ngày ${formatDate(day.date)}`} rows={day.lines} rowKey={(l) => l.class_id} columns={columns} minWidth="560px" />
            ) : (
              <EmptyState title="Ngày này không có lớp nào">Lớp mở sau khi mở ngày không có trong danh sách của ngày.</EmptyState>
            )}

            <fieldset className={styles.staff}>
              <legend className={s.subhead}>Suất nhân viên</legend>
              {cellInput(STAFF_KEY, 'planned', 'Dự kiến', STAFF_MAX)}
              {cellInput(STAFF_KEY, 'actual', 'Thực tế', STAFF_MAX)}
            </fieldset>

            <p className={s.muted}>Ô trống nghĩa là chưa nhập, khác với 0 suất. Phải nhập đủ mọi lớp mới chốt được.</p>

            <div className={styles.actions}>
              <Button write busy={busy === 'save'} disabled={!dirty || busy !== null} onClick={save}>
                Lưu số suất
              </Button>
              {!plannedLocked ? (
                <Button
                  write
                  variant="secondary"
                  icon={<IconCheck size={18} />}
                  disabled={dirty || busy !== null}
                  title={dirty ? 'Lưu thay đổi trước khi chốt' : undefined}
                  onClick={() => setLocking('planned')}
                >
                  Chốt dự kiến
                </Button>
              ) : !actualLocked ? (
                <Button
                  write
                  variant="secondary"
                  icon={<IconCheck size={18} />}
                  disabled={dirty || busy !== null}
                  title={dirty ? 'Lưu thay đổi trước khi chốt' : undefined}
                  onClick={() => setLocking('actual')}
                >
                  Chốt thực tế
                </Button>
              ) : null}
              {actualLocked ? (
                <Button write variant="ghost" icon={<IconLock size={18} />} disabled={busy !== null} onClick={() => setReopening('actual')}>
                  Mở lại số thực tế
                </Button>
              ) : plannedLocked ? (
                <Button write variant="ghost" icon={<IconLock size={18} />} disabled={busy !== null} onClick={() => setReopening('planned')}>
                  Mở lại số dự kiến
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Stack>

      {locking && day ? (
        <ConfirmDialog
          title={`Chốt số ${KIND_LABEL[locking]} ngày ${formatDate(day.date)}?`}
          confirmLabel={`Chốt ${KIND_LABEL[locking]}`}
          busy={busy === 'lock'}
          onCancel={() => setLocking(null)}
          onConfirm={lock}
        >
          <p>
            Tổng {KIND_LABEL[locking]}: <strong>{formatNumber((locking === 'planned' ? plannedSum : actualSum) ?? 0, 0)}</strong> suất. Sau khi
            chốt, muốn sửa phải mở lại và ghi lý do.
          </p>
        </ConfirmDialog>
      ) : null}

      {reopening && day ? (
        <ReopenModal
          day={day}
          kind={reopening}
          onClose={() => setReopening(null)}
          onDone={() => {
            setReopening(null);
            q.reload();
          }}
          onConflict={(err) => {
            setReopening(null);
            handleConflict(err);
          }}
        />
      ) : null}
    </>
  );
}

function ReopenModal({
  day,
  kind,
  onClose,
  onDone,
  onConflict,
}: {
  day: OpenMealDay;
  kind: CountKind;
  onClose: () => void;
  onDone: () => void;
  onConflict: (err: unknown) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async () => {
    if (!reason.trim()) {
      setError('Hãy ghi lý do mở lại.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await mealsApi.reopen(day.date, kind, day.version, reason.trim());
      toast.show(`Đã mở lại số ${KIND_LABEL[kind]}.`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) onConflict(err);
      else setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Mở lại số ${KIND_LABEL[kind]} ngày ${formatDate(day.date)}`}
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button write busy={busy} onClick={submit}>
            Mở lại
          </Button>
        </>
      }
    >
      <Stack>
        <p>Lý do được ghi vào nhật ký để Hiệu trưởng theo dõi.</p>
        <TextareaField label="Lý do mở lại" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} error={error} required />
      </Stack>
    </Modal>
  );
}
