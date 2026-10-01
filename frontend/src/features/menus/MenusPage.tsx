import { useState, type FormEvent } from 'react';
import { Badge, Button, Callout, Checkbox, ConfirmDialog, DataTable, Drawer, EmptyState, ErrorState, PageHeader, SectionTitle, Skeleton, Stack, TextareaField, TextField, Toolbar, useToast } from '../../components/ui';
import { formatDate, todayISO } from '../../lib/format';
import { fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { catalogApi, type Dish } from '../../services/catalog';
import { menusApi, type MenuVersion } from '../../services/menus';
import { useQueryParam, useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import styles from './MenusPage.module.css';

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return todayISO();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const weekdays = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu'];

export function MenusPage() {
  const [week, setWeek] = useQueryParam('tuan', todayISO());
  const [create] = useQueryParam('sua-thuc-don');
  const [holiday] = useQueryParam('ngay-nghi');
  const update = useUpdateParams();
  const q = useApiQuery(() => menusApi.week(week), [week]);
  const versions = useApiQuery(menusApi.versions, []);
  const holidays = useApiQuery(menusApi.holidays, []);
  const dishes = useApiQuery(catalogApi.dishes, []);
  const [deleting, setDeleting] = useState<{ kind: 'version' | 'holiday'; id: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const reload = () => { q.reload(); versions.reload(); holidays.reload(); };
  async function remove() {
    if (!deleting) return;
    setBusy(true); setError('');
    try {
      if (deleting.kind === 'version') await menusApi.deleteVersion(deleting.id);
      else await menusApi.deleteHoliday(deleting.id);
      toast.show('Đã xóa.'); setDeleting(null); reload();
    } catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  }
  const addMenu = <Button write onClick={() => update({ 'sua-thuc-don': '1' })}>Sửa thực đơn cố định</Button>;
  const addHoliday = <Button write variant="secondary" onClick={() => update({ 'ngay-nghi': '1' })}>Thêm ngày nghỉ</Button>;
  return <>
    <PageHeader title="Thực đơn tuần" actions={addMenu} />
    <Stack gap="lg">
      <Toolbar>
        <Button variant="secondary" onClick={() => setWeek(shiftDate(q.data?.week_start ?? week, -7))}>Tuần trước</Button>
        <TextField label="Tuần chứa ngày" type="date" value={week} onChange={e => setWeek(e.target.value || todayISO())} />
        <Button variant="secondary" onClick={() => setWeek(shiftDate(q.data?.week_start ?? week, 7))}>Tuần sau</Button>
      </Toolbar>
      {q.loading ? <Skeleton /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : q.data ? <>
        <div className={styles.week}>{q.data.days.filter(d => d.weekday < 5).map(d => <section key={d.date} className={styles.day}>
          <h2>{d.weekday_label}</h2><p>{formatDate(d.date)}</p>
          {d.status === 'holiday' ? <Badge tone="warn">{d.holiday_name || 'Ngày nghỉ'}</Badge> : d.source === 'none' ? <p>Chưa lập thực đơn</p> : <ul>{d.dishes.map(dish => <li key={dish.dish_id}>{dish.dish_name}</li>)}</ul>}
          {d.source === 'snapshot' ? <Badge tone="info">Đã chụp</Badge> : null}
        </section>)}</div>
        <details className={styles.weekend}><summary>Thứ Bảy / Chủ nhật · Nghỉ</summary>{q.data.days.filter(d => d.weekday >= 5).map(d => <p key={d.date}>{d.weekday_label} {formatDate(d.date)} — Nghỉ</p>)}</details>
      </> : null}
      <SectionTitle>Lịch sử thực đơn</SectionTitle>
      {versions.loading ? <Skeleton /> : versions.error ? <ErrorState message={versions.error} onRetry={versions.reload} /> : !versions.data?.length ? <EmptyState title="Chưa có thực đơn cố định" action={addMenu} /> : <DataTable caption="Lịch sử thực đơn" rows={versions.data} rowKey={v => v.id} columns={[
        { key: 'from', header: 'Áp dụng từ', cell: v => formatDate(v.effective_from) },
        { key: 'to', header: 'Đến ngày', cell: v => v.effective_to ? formatDate(v.effective_to) : 'Chưa có ngày kết thúc' },
        { key: 'state', header: 'Trạng thái', cell: v => <Badge tone={v.is_current ? 'ok' : 'neutral'}>{v.is_current ? 'Đang áp dụng' : v.is_editable ? 'Sắp áp dụng' : 'Lịch sử'}</Badge> },
        { key: 'creator', header: 'Người tạo', cell: v => v.created_by },
        { key: 'note', header: 'Ghi chú', wrap: true, cell: v => v.note || '—' },
        { key: 'delete', header: 'Thao tác', cell: v => v.is_editable ? <Button write size="xs" variant="danger" onClick={() => { setError(''); setDeleting({ kind: 'version', id: v.id }); }}>Xóa</Button> : null },
      ]} />}
      <Toolbar><SectionTitle>Ngày nghỉ</SectionTitle>{addHoliday}</Toolbar>
      {holidays.loading ? <Skeleton /> : holidays.error ? <ErrorState message={holidays.error} onRetry={holidays.reload} /> : !holidays.data?.length ? <EmptyState title="Chưa có ngày nghỉ bổ sung" action={addHoliday}>Thứ Bảy và Chủ nhật luôn nghỉ.</EmptyState> : <DataTable caption="Ngày nghỉ" rows={holidays.data} rowKey={h => h.id} columns={[
        { key: 'date', header: 'Ngày', cell: h => formatDate(h.date) }, { key: 'name', header: 'Tên ngày nghỉ', cell: h => h.name },
        { key: 'delete', header: 'Thao tác', cell: h => h.is_editable ? <Button write size="xs" variant="danger" onClick={() => { setError(''); setDeleting({ kind: 'holiday', id: h.id }); }}>Xóa</Button> : null },
      ]} />}
    </Stack>
    {create ? dishes.loading || versions.loading ? <Drawer title="Sửa thực đơn cố định" onClose={() => update({ 'sua-thuc-don': null })}><Skeleton /></Drawer> : dishes.error || versions.error ? <Drawer title="Sửa thực đơn cố định" onClose={() => update({ 'sua-thuc-don': null })}><ErrorState message={dishes.error || versions.error!} onRetry={() => { dishes.reload(); versions.reload(); }} /></Drawer> : <MenuForm dishes={dishes.data ?? []} current={versions.data?.find(v => v.is_current)} onClose={() => update({ 'sua-thuc-don': null })} onSaved={() => { update({ 'sua-thuc-don': null }); reload(); }} /> : null}
    {holiday ? <HolidayForm onClose={() => update({ 'ngay-nghi': null })} onSaved={() => { update({ 'ngay-nghi': null }); reload(); }} /> : null}
    {deleting ? <ConfirmDialog title={deleting.kind === 'version' ? 'Xóa thực đơn chưa áp dụng?' : 'Xóa ngày nghỉ?'} confirmLabel="Xóa" tone="danger" busy={busy} onCancel={() => setDeleting(null)} onConfirm={remove}>{error ? <Callout tone="danger" role="alert">{error}</Callout> : <p>Thay đổi này sẽ cập nhật lịch cho các ngày tương lai.</p>}</ConfirmDialog> : null}
  </>;
}

function MenuForm({ dishes, current, onClose, onSaved }: { dishes: Dish[]; current?: MenuVersion; onClose: () => void; onSaved: () => void }) {
  const available = dishes.filter(d => d.is_active && d.has_recipe);
  const tomorrow = shiftDate(todayISO(), 1);
  const [date, setDate] = useState(tomorrow);
  const [note, setNote] = useState('');
  const [days, setDays] = useState<Record<string, number[]>>(() => Object.fromEntries(weekdays.map((_, i) => [String(i), (current?.days[String(i)] ?? []).map(d => d.dish_id).filter(id => available.some(d => d.id === id))])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    const next: Record<string, string> = {};
    if (!date || date < tomorrow) next.effective_from = 'Ngày áp dụng phải từ ngày mai trở đi.';
    weekdays.forEach((_, i) => { if (!days[String(i)].length) next[`days.${i}`] = 'Chọn ít nhất một món.'; });
    setErrors(next); if (Object.keys(next).length) return;
    setBusy(true);
    try { await menusApi.create({ effective_from: date, note: note.trim(), days }); toast.show('Đã lưu thực đơn cố định mới.'); onSaved(); }
    catch (err) { setError(messageOf(err)); setErrors(fieldsOf(err)); } finally { setBusy(false); }
  }
  return <Drawer title="Sửa thực đơn cố định" subtitle="Thực đơn mới lặp lại mỗi tuần từ ngày áp dụng." onClose={busy ? () => undefined : onClose} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button><Button write form="menu-form" type="submit" busy={busy} disabled={!available.length}>Lưu thực đơn</Button></>}>
    <form id="menu-form" className={s.form} onSubmit={submit} noValidate>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <TextField label="Ngày áp dụng" type="date" min={tomorrow} value={date} onChange={e => setDate(e.target.value)} error={errors.effective_from} required />
      {!available.length ? <EmptyState title="Chưa có món đang dùng có công thức">Thêm món và công thức trước khi lập thực đơn.</EmptyState> : weekdays.map((label, i) => <fieldset key={i} className={styles.choices} aria-describedby={errors[`days.${i}`] ? `day-error-${i}` : undefined}>
        <legend>{label}</legend>
        {available.map(d => <Checkbox key={d.id} label={d.name} checked={days[String(i)].includes(d.id)} onChange={e => setDays(prev => ({ ...prev, [i]: e.target.checked ? [...prev[String(i)], d.id] : prev[String(i)].filter(id => id !== d.id) }))} />)}
        {errors[`days.${i}`] ? <p className={styles.error} role="alert" id={`day-error-${i}`}>{errors[`days.${i}`]}</p> : null}
      </fieldset>)}
      <TextareaField label="Ghi chú" value={note} onChange={e => setNote(e.target.value)} maxLength={500} error={errors.note} />
    </form>
  </Drawer>;
}

function HolidayForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    const next: Record<string, string> = {};
    if (!date || date < todayISO()) next.date = 'Chọn hôm nay hoặc ngày tương lai.';
    if (!name.trim()) next.name = 'Hãy nhập tên ngày nghỉ.';
    setErrors(next); if (Object.keys(next).length) return;
    setBusy(true);
    try { await menusApi.addHoliday({ date, name: name.trim() }); toast.show('Đã thêm ngày nghỉ.'); onSaved(); }
    catch (err) { setError(messageOf(err)); setErrors(fieldsOf(err)); } finally { setBusy(false); }
  }
  return <Drawer title="Thêm ngày nghỉ" onClose={busy ? () => undefined : onClose} footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button><Button write form="holiday-form" type="submit" busy={busy}>Lưu</Button></>}><form id="holiday-form" className={s.form} onSubmit={submit} noValidate>
    {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
    <TextField label="Ngày nghỉ" type="date" min={todayISO()} value={date} onChange={e => setDate(e.target.value)} error={errors.date} required />
    <TextField label="Tên ngày nghỉ" value={name} onChange={e => setName(e.target.value)} error={errors.name} maxLength={120} required />
  </form></Drawer>;
}
