/**
 * FE-04/05 /mon-an/thuc-don: thực đơn cố định T2–T6 lặp hằng tuần (R10, menu_views.py).
 * - Lưới tuần ?tuan=YYYY-MM-DD (tuần chứa ngày đó). Ngày đã qua/hôm nay hiện bản chụp, không đổi khi sửa công thức.
 * - "Sửa thực đơn cố định" (?sua-thuc-don=1) tạo phiên bản mới áp dụng từ ngày mai trở đi; bản đã áp dụng là lịch sử.
 * - Lịch sử phiên bản (?phien-ban=ID xem chi tiết), ngày nghỉ (?ngay-nghi=1 thêm). Định lượng hiện tới 6 số lẻ.
 * Hiệu trưởng xem được mọi thứ; nút ghi khoá ("Hiệu trưởng chỉ xem").
 */
import { useState, type FormEvent } from 'react';
import { IconCalendar, IconChevronLeft, IconChevronRight, IconPencil, IconPlus } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionTitle,
  Skeleton,
  Stack,
  TextareaField,
  TextField,
  Toolbar,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { formatDate, formatDateTime, formatShortDate, todayISO } from '../../lib/format';
import { fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { catalogApi, type Dish } from '../../services/catalog';
import { menusApi, shiftDate, WEEKDAY_LABELS, type Holiday, type MenuDay, type MenuVersion } from '../../services/menus';
import { DishTabs, dishCrumbs } from '../common/FeatureLayouts';
import { formatPortion } from '../dishes/DishesPage';
import { useQueryParam, useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import styles from './MenusPage.module.css';

type Deleting = { kind: 'version'; item: MenuVersion } | { kind: 'holiday'; item: Holiday };

export function MenusPage() {
  const today = todayISO();
  const [week, setWeek] = useQueryParam('tuan', today);
  const [editingMenu] = useQueryParam('sua-thuc-don');
  const [addingHoliday] = useQueryParam('ngay-nghi');
  const [versionId] = useQueryParam('phien-ban');
  const updateParams = useUpdateParams();
  const weekQ = useApiQuery(() => menusApi.week(week), [week]);
  const versions = useApiQuery(menusApi.versions, []);
  const holidays = useApiQuery(() => menusApi.holidays(), []);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const toast = useToast();

  const reloadAll = () => {
    weekQ.reload();
    versions.reload();
    holidays.reload();
  };
  const viewing = versions.data?.find((v) => String(v.id) === versionId) ?? null;
  const weekStart = weekQ.data?.week_start ?? week;

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setDeleteError('');
    try {
      const res =
        deleting.kind === 'version' ? await menusApi.deleteVersion(deleting.item.id) : await menusApi.deleteHoliday(deleting.item.id);
      toast.show(res.message);
      setDeleting(null);
      reloadAll();
    } catch (err) {
      setDeleteError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const editButton = (
    <Button write icon={<IconPencil size={18} />} onClick={() => updateParams({ 'sua-thuc-don': '1' })}>
      Sửa thực đơn cố định
    </Button>
  );
  const holidayButton = (
    <Button write variant="secondary" icon={<IconPlus size={18} />} onClick={() => updateParams({ 'ngay-nghi': '1' })}>
      Thêm ngày nghỉ
    </Button>
  );

  const versionColumns: Column<MenuVersion>[] = [
    {
      key: 'range',
      header: 'Áp dụng',
      width: '26%',
      cell: (v) => (
        <span className={tableText.strong}>
          {formatDate(v.effective_from)} → {v.effective_to ? formatDate(v.effective_to) : 'nay'}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'Trạng thái',
      width: '16%',
      cell: (v) =>
        v.is_current ? <Badge tone="ok">Đang áp dụng</Badge> : v.is_editable ? <Badge tone="info">Sắp áp dụng</Badge> : <Badge>Lịch sử</Badge>,
    },
    { key: 'note', header: 'Ghi chú', wrap: true, cell: (v) => v.note || '—' },
    {
      key: 'by',
      header: 'Người lập',
      width: '22%',
      cell: (v) => (
        <>
          <span className={`${tableText.primaryText} ${styles.byName}`}>{v.created_by}</span>
          <span className={`${styles.byTime} num`}>{formatDateTime(v.created_at)}</span>
        </>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Thao tác</span>,
      align: 'right',
      cell: (v) => (
        <span className={s.inlineGroup}>
          <Button size="xs" variant="outline" onClick={() => updateParams({ 'phien-ban': String(v.id) })}>
            Xem
          </Button>
          {v.is_editable ? (
            <Button
              write
              size="xs"
              variant="danger"
              onClick={() => {
                setDeleteError('');
                setDeleting({ kind: 'version', item: v });
              }}
            >
              Xoá
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  const holidayColumns: Column<Holiday>[] = [
    { key: 'date', header: 'Ngày', cell: (h) => <span className={tableText.strong}>{formatDate(h.date)}</span> },
    { key: 'name', header: 'Tên ngày nghỉ', wrap: true, cell: (h) => h.name },
    {
      key: 'actions',
      header: <span className="sr-only">Thao tác</span>,
      align: 'right',
      cell: (h) =>
        h.is_editable ? (
          <Button
            write
            size="xs"
            variant="danger"
            onClick={() => {
              setDeleteError('');
              setDeleting({ kind: 'holiday', item: h });
            }}
          >
            Xoá
          </Button>
        ) : (
          <span className={tableText.muted}>Đã qua</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader variant="banner" scene="dong" breadcrumb={dishCrumbs('Thực đơn tuần')} title="Thực đơn tuần" actions={editButton} />
      <DishTabs />
      <Stack gap="lg">
        <Toolbar>
          <span className={s.inlineGroup}>
            <Button variant="outline" icon={<IconChevronLeft size={18} />} onClick={() => setWeek(shiftDate(weekStart, -7))}>
              Tuần trước
            </Button>
            <Button variant="ghost" icon={<IconCalendar size={18} />} onClick={() => setWeek(today)}>
              Tuần này
            </Button>
            <Button variant="outline" onClick={() => setWeek(shiftDate(weekStart, 7))}>
              Tuần sau
              <IconChevronRight size={18} />
            </Button>
          </span>
          <TextField label="Xem tuần có ngày" type="date" value={week} onChange={(e) => setWeek(e.target.value || today)} />
        </Toolbar>

        {weekQ.loading ? (
          <Skeleton rows={4} label="Đang tải thực đơn tuần" />
        ) : weekQ.error ? (
          <ErrorState message={weekQ.error} onRetry={weekQ.reload} />
        ) : weekQ.data ? (
          <WeekGrid days={weekQ.data.days} today={today} />
        ) : null}

        <SectionTitle>Lịch sử thực đơn cố định</SectionTitle>
        {versions.loading ? (
          <Skeleton rows={2} />
        ) : versions.error ? (
          <ErrorState message={versions.error} onRetry={versions.reload} />
        ) : !versions.data?.length ? (
          <EmptyState title="Chưa lập thực đơn cố định" action={editButton}>
            Lập thực đơn cho Thứ Hai đến Thứ Sáu; thực đơn lặp lại mỗi tuần.
          </EmptyState>
        ) : (
          <DataTable caption="Lịch sử thực đơn cố định" rows={versions.data} rowKey={(v) => v.id} columns={versionColumns} minWidth="720px" />
        )}

        <div className={styles.sectionHead}>
          <SectionTitle>Ngày nghỉ</SectionTitle>
          {holidayButton}
        </div>
        <p className={s.muted}>Thứ Bảy và Chủ nhật luôn nghỉ. Ngày lễ, nghỉ bù thêm ở đây; ngày nghỉ không gửi thư thực đơn.</p>
        {holidays.loading ? (
          <Skeleton rows={2} />
        ) : holidays.error ? (
          <ErrorState message={holidays.error} onRetry={holidays.reload} />
        ) : !holidays.data?.length ? (
          <EmptyState title="Chưa có ngày nghỉ bổ sung" action={holidayButton} />
        ) : (
          <DataTable caption="Ngày nghỉ bổ sung" rows={holidays.data} rowKey={(h) => h.id} columns={holidayColumns} />
        )}
      </Stack>

      {editingMenu ? (
        <MenuForm
          current={versions.data?.find((v) => v.is_current) ?? versions.data?.[0] ?? null}
          onClose={() => updateParams({ 'sua-thuc-don': null })}
          onSaved={(v) => {
            updateParams({ 'sua-thuc-don': null, tuan: v.effective_from });
            reloadAll();
          }}
        />
      ) : null}
      {addingHoliday ? (
        <HolidayForm
          onClose={() => updateParams({ 'ngay-nghi': null })}
          onSaved={() => {
            updateParams({ 'ngay-nghi': null });
            reloadAll();
          }}
        />
      ) : null}
      {viewing ? <VersionDrawer version={viewing} onClose={() => updateParams({ 'phien-ban': null })} /> : null}
      {deleting ? (
        <ConfirmDialog
          title={
            deleting.kind === 'version'
              ? `Xoá thực đơn áp dụng từ ${formatDate(deleting.item.effective_from)}?`
              : `Xoá ngày nghỉ ${formatDate(deleting.item.date)}?`
          }
          confirmLabel="Xoá"
          tone="danger"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        >
          <p>
            {deleting.kind === 'version'
              ? 'Thực đơn này chưa áp dụng. Sau khi xoá, các ngày đó dùng lại thực đơn đang áp dụng.'
              : 'Ngày này sẽ trở lại thành ngày học và có thực đơn theo thứ.'}
          </p>
          {deleteError ? (
            <Callout tone="danger" role="alert">
              {deleteError}
            </Callout>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function sourceBadge(day: MenuDay) {
  if (day.status !== 'menu') return null;
  if (day.source === 'snapshot') return <Badge tone="done">Đã chốt cho ngày</Badge>;
  if (day.source === 'version') return <Badge tone="info">Theo thực đơn cố định</Badge>;
  return <Badge tone="warn">Chưa lập thực đơn</Badge>;
}

function WeekGrid({ days, today }: { days: MenuDay[]; today: string }) {
  const school = days.filter((d) => d.weekday < 5);
  const weekend = days.filter((d) => d.weekday >= 5);
  return (
    <>
      <ol className={styles.week} aria-label="Thực đơn Thứ Hai đến Thứ Sáu">
        {school.map((d) => (
          <li key={d.date} className={`${styles.day} ${d.date === today ? styles.today : ''} ${d.status !== 'menu' ? styles.off : ''}`}>
            <div className={styles.dayHead}>
              <h3 className={styles.dayName}>{d.weekday_label}</h3>
              <span className={styles.dayDate}>
                {formatShortDate(d.date)}
                {d.date === today ? ' · Hôm nay' : ''}
              </span>
            </div>
            {d.status === 'holiday' ? (
              <Badge tone="warn">Nghỉ: {d.holiday_name || 'ngày lễ'}</Badge>
            ) : d.dishes.length ? (
              <ul className={styles.dishes}>
                {d.dishes.map((dish) => (
                  <li key={dish.dish_id}>
                    <span className={styles.dishName}>{dish.dish_name}</span>
                    <span className={styles.recipe}>
                      {dish.components.map((c) => `${c.food_name} ${formatPortion(c.quantity, c.unit)}`).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.muted}>Chưa có món.</p>
            )}
            {sourceBadge(d)}
          </li>
        ))}
      </ol>
      <p className={s.muted}>
        {weekend.map((d) => `${d.weekday_label} ${formatShortDate(d.date)}`).join(' · ')}: nghỉ cuối tuần.
      </p>
    </>
  );
}

function VersionDrawer({ version, onClose }: { version: MenuVersion; onClose: () => void }) {
  return (
    <Drawer
      title={`Thực đơn từ ${formatDate(version.effective_from)}`}
      subtitle={version.effective_to ? `Áp dụng tới ${formatDate(version.effective_to)}` : 'Chưa có ngày kết thúc'}
      onClose={onClose}
    >
      <Stack gap="lg">
        {version.note ? <p>{version.note}</p> : null}
        <dl className={styles.versionDays}>
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{(version.days[String(i)] ?? []).map((d) => d.dish_name).join(', ') || '—'}</dd>
            </div>
          ))}
        </dl>
        <p className={s.muted}>
          Lập bởi {version.created_by} lúc {formatDateTime(version.created_at)}.
        </p>
      </Stack>
    </Drawer>
  );
}

function MenuForm({
  current,
  onClose,
  onSaved,
}: {
  current: MenuVersion | null;
  onClose: () => void;
  onSaved: (v: MenuVersion) => void;
}) {
  const dishesQ = useApiQuery(catalogApi.dishes, []);
  const tomorrow = shiftDate(todayISO(), 1);
  const [date, setDate] = useState(tomorrow);
  const [note, setNote] = useState('');
  const [days, setDays] = useState<Record<string, number[]> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const available: Dish[] = (dishesQ.data ?? []).filter((d) => d.is_active && d.has_recipe);
  // Mặc định chép thực đơn đang áp dụng (chỉ giữ món còn dùng được) để sửa ít thao tác.
  const chosen: Record<string, number[]> =
    days ??
    Object.fromEntries(
      WEEKDAY_LABELS.map((_, i) => [
        String(i),
        (current?.days[String(i)] ?? []).map((d) => d.dish_id).filter((id) => available.some((d) => d.id === id)),
      ]),
    );

  const toggle = (weekday: string, dishId: number, on: boolean) => {
    const base = chosen[weekday] ?? [];
    setDays({ ...chosen, [weekday]: on ? [...base, dishId] : base.filter((id) => id !== dishId) });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!date || date < tomorrow) next.effective_from = 'Ngày áp dụng phải từ ngày mai trở đi.';
    WEEKDAY_LABELS.forEach((label, i) => {
      if (!chosen[String(i)]?.length) next[`days.${i}`] = `${label} cần ít nhất một món.`;
    });
    setErrors(next);
    if (Object.keys(next).length) {
      setFormError('Kiểm tra lại các ô được đánh dấu.');
      return;
    }
    setBusy(true);
    try {
      const v = await menusApi.createVersion({ effective_from: date, note: note.trim(), days: chosen });
      toast.show(`Đã lưu thực đơn áp dụng từ ${formatDate(v.effective_from)}.`);
      onSaved(v);
    } catch (err) {
      setFormError(messageOf(err));
      setErrors(fieldsOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title="Sửa thực đơn cố định"
      subtitle="Tạo phiên bản mới lặp lại mỗi tuần từ ngày áp dụng. Ngày đã qua giữ nguyên thực đơn cũ."
      width="640px"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button write type="submit" form="menu-form" busy={busy} disabled={!available.length}>
            Lưu thực đơn
          </Button>
        </>
      }
    >
      {dishesQ.loading ? (
        <Skeleton rows={4} />
      ) : dishesQ.error ? (
        <ErrorState message={dishesQ.error} onRetry={dishesQ.reload} />
      ) : (
        <form id="menu-form" className={s.form} onSubmit={onSubmit} noValidate>
          {formError ? (
            <Callout tone="danger" role="alert">
              {formError}
            </Callout>
          ) : null}
          <TextField
            label="Áp dụng từ ngày"
            type="date"
            min={tomorrow}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={errors.effective_from}
            hint="Sớm nhất là ngày mai. Không sửa lùi thực đơn đã áp dụng."
            required
          />
          {!available.length ? (
            <EmptyState title="Chưa có món đang dùng có công thức">Thêm món và công thức ở tab Món & công thức trước.</EmptyState>
          ) : (
            WEEKDAY_LABELS.map((label, i) => {
              const key = String(i);
              const err = errors[`days.${i}`] ?? errors[`days.${key}`];
              return (
                <fieldset key={label} className={styles.choices} aria-invalid={err ? true : undefined} aria-describedby={err ? `menu-day-${i}-error` : undefined}>
                  <legend className={styles.legend}>
                    {label} <span className={s.muted}>({chosen[key]?.length ?? 0} món)</span>
                  </legend>
                  <div className={styles.choiceGrid}>
                    {available.map((d) => (
                      <Checkbox
                        key={d.id}
                        label={d.name}
                        checked={chosen[key]?.includes(d.id) ?? false}
                        onChange={(e) => toggle(key, d.id, e.target.checked)}
                      />
                    ))}
                  </div>
                  {err ? (
                    <p className={styles.error} id={`menu-day-${i}-error`}>
                      {err}
                    </p>
                  ) : null}
                </fieldset>
              );
            })
          )}
          <TextareaField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} error={errors.note} rows={2} />
        </form>
      )}
    </Drawer>
  );
}

function HolidayForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const today = todayISO();
  const [date, setDate] = useState(shiftDate(today, 1));
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!date || date < today) next.date = 'Chọn hôm nay hoặc ngày sắp tới.';
    if (!name.trim()) next.name = 'Hãy nhập tên ngày nghỉ, ví dụ Nghỉ lễ Quốc khánh.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const h = await menusApi.addHoliday({ date, name: name.trim() });
      toast.show(`Đã thêm ngày nghỉ ${formatDate(h.date)}.`);
      onSaved();
    } catch (err) {
      setFormError(messageOf(err));
      setErrors(fieldsOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title="Thêm ngày nghỉ"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button write type="submit" form="holiday-form" busy={busy}>
            Lưu ngày nghỉ
          </Button>
        </>
      }
    >
      <form id="holiday-form" className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        ) : null}
        <TextField
          label="Ngày nghỉ"
          type="date"
          min={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
          hint="Không chọn Thứ Bảy/Chủ nhật (đã nghỉ sẵn) hay ngày đã gửi thực đơn."
          required
        />
        <TextField label="Tên ngày nghỉ" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={120} required />
      </form>
    </Drawer>
  );
}
