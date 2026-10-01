import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Callout, Checkbox, ConfirmDialog, DataTable, Drawer, EmptyState, ErrorState, Modal, PageHeader, SelectField, Skeleton, Stack, TextField, Toolbar, useToast } from '../../components/ui';
import { ApiError, fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { catalogApi, type SchoolClass } from '../../services/catalog';
import { studentsApi, type ImportResult, type Student, type StudentInput } from '../../services/students';
import { useQueryParam, useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';

export function StudentsPage() {
  const { canWrite } = useAuth();
  const [classId] = useQueryParam('lop', '');
  const [create] = useQueryParam('tao');
  const [edit] = useQueryParam('sua');
  const [importing] = useQueryParam('nhap-csv');
  const update = useUpdateParams();
  const classes = useApiQuery(catalogApi.classes, []);
  const q = useApiQuery(() => studentsApi.list(classId), [classId]);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [revealId, setRevealId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const editing = q.data?.find(s => String(s.id) === edit);
  const close = () => update({ tao: null, sua: null });
  async function remove() {
    if (!deleting || !canWrite) return;
    setBusy(true); setError('');
    try { await studentsApi.delete(deleting.id); toast.show('Đã xóa học sinh và email phụ huynh.'); setDeleting(null); q.reload(); }
    catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  }
  const add = <Button write onClick={() => update({ tao: '1', sua: null })}>Thêm học sinh</Button>;
  return <>
    <PageHeader title="Học sinh" actions={<>{add}<Button write variant="secondary" onClick={() => update({ 'nhap-csv': '1' })}>Nhập từ CSV</Button></>} />
    <Stack gap="lg">
      {classes.error ? <ErrorState message={classes.error} onRetry={classes.reload} /> : classes.loading ? <Skeleton rows={1} /> : <Toolbar><SelectField label="Lớp" value={classId} onChange={e => update({ lop: e.target.value || null, sua: null, tao: null })}><option value="">Tất cả lớp</option>{classes.data?.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}{c.is_active ? '' : ' (ngừng)'}</option>)}</SelectField></Toolbar>}
      {q.loading ? <Skeleton /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState title="Chưa có học sinh" action={add} /> : <DataTable caption="Danh sách học sinh" rows={q.data} rowKey={r => r.id} columns={[
        { key: 'name', header: 'Họ tên', cell: r => r.full_name },
        { key: 'class', header: 'Lớp', cell: r => r.class_code },
        { key: 'contacts', header: 'Email phụ huynh', wrap: true, cell: r => r.contacts.length ? <Stack gap="sm">{r.contacts.map(c => <div key={c.id}><p>{c.email_hint}</p><Badge tone={c.unsubscribed_at ? 'neutral' : 'ok'}>{c.unsubscribed_at ? 'Đã hủy nhận' : 'Đang nhận thư'}</Badge>{canWrite ? <Button variant="ghost" size="xs" onClick={() => setRevealId(c.id)}>Hiện email</Button> : null}</div>)}</Stack> : 'Chưa có email' },
        { key: 'actions', header: 'Thao tác', wrap: true, cell: r => <Stack gap="sm"><Button write size="xs" variant="secondary" onClick={() => update({ sua: String(r.id), tao: null })}>Sửa</Button><Button write size="xs" variant="danger" onClick={() => { setError(''); setDeleting(r); }}>Cho nghỉ học</Button></Stack> },
      ]} />}
    </Stack>
    {(create || editing) && canWrite ? classes.loading ? <Drawer title="Học sinh" onClose={close}><Skeleton /></Drawer> : classes.error ? <Drawer title="Học sinh" onClose={close}><ErrorState message={classes.error} onRetry={classes.reload} /></Drawer> : <StudentForm key={editing?.id ?? 'new'} student={editing ?? null} classId={classId} classes={classes.data ?? []} onClose={close} onSaved={() => { close(); q.reload(); }} /> : null}
    {deleting ? <ConfirmDialog title={`Cho ${deleting.full_name} nghỉ học?`} confirmLabel="Xóa hẳn dữ liệu" tone="danger" busy={busy} onCancel={() => setDeleting(null)} onConfirm={remove}><p>Học sinh và toàn bộ email phụ huynh sẽ bị xóa hẳn. Không thể hoàn tác.</p>{error ? <Callout tone="danger" role="alert">{error}</Callout> : null}</ConfirmDialog> : null}
    {revealId !== null && canWrite ? <RevealModal id={revealId} onClose={() => setRevealId(null)} /> : null}
    {importing && canWrite ? <ImportModal onClose={() => update({ 'nhap-csv': null })} onSaved={() => { q.reload(); update({ 'nhap-csv': null }); }} /> : null}
  </>;
}

function StudentForm({ student, classId, classes, onClose, onSaved }: { student: Student | null; classId: string; classes: SchoolClass[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(student?.full_name ?? '');
  const [klass, setKlass] = useState(student ? String(student.class_id) : classId);
  const [replace, setReplace] = useState(!student);
  const [emails, setEmails] = useState(['', '']);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    const next: Record<string, string> = {};
    if (!name.trim()) next.full_name = 'Hãy nhập họ tên.';
    if (!klass) next.class_id = 'Hãy chọn lớp.';
    const contacts = emails.map((email, index) => ({ email: email.trim(), index })).filter(c => c.email);
    if (replace && contacts.length && !consent) next.consent = 'Cần xác nhận phụ huynh đã đồng ý nhận email.';
    if (replace) contacts.forEach(c => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) next[`email_${c.index}`] = 'Địa chỉ email chưa hợp lệ.'; });
    setErrors(next); if (Object.keys(next).length) return;
    const body: StudentInput = { full_name: name.trim(), class_id: Number(klass) };
    if (replace) body.contacts = contacts.map(c => ({ email: c.email, consent }));
    setBusy(true);
    try {
      // Không gửi lại lớp ngừng hoạt động nếu chỉ sửa tên/liên hệ.
      if (student) {
        const patch: Partial<StudentInput> = { ...body };
        if (student.class_id === body.class_id) delete patch.class_id;
        await studentsApi.update(student.id, patch);
      } else await studentsApi.create(body);
      toast.show('Đã lưu học sinh.'); onSaved();
    } catch (err) {
      const fields = fieldsOf(err);
      contacts.forEach((c, i) => { if (fields[`contacts[${i}].email`]) fields[`email_${c.index}`] = fields[`contacts[${i}].email`]; if (fields[`contacts[${i}].consent`]) fields.consent = fields[`contacts[${i}].consent`]; });
      setError(messageOf(err)); setErrors(fields);
    } finally { setBusy(false); }
  }
  return <Drawer title={student ? 'Sửa học sinh' : 'Thêm học sinh'} onClose={busy ? () => undefined : onClose} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button><Button write type="submit" form="student-form" busy={busy}>Lưu</Button></>}>
    <form id="student-form" className={s.form} onSubmit={submit} noValidate>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <TextField label="Họ tên học sinh" value={name} maxLength={120} onChange={e => setName(e.target.value)} error={errors.full_name} required />
      <SelectField label="Lớp" value={klass} onChange={e => setKlass(e.target.value)} error={errors.class_id} required><option value="">Chọn lớp</option>{classes.filter(c => c.is_active || c.id === student?.class_id).map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</SelectField>
      {student ? <><p>Email hiện tại: {student.contacts.map(c => c.email_hint).join(', ') || 'Chưa có'}</p><Checkbox label="Thay danh sách email phụ huynh" checked={replace} onChange={e => setReplace(e.target.checked)} /></> : null}
      {replace ? <>
        {student ? <Callout tone="info">Nhập lại toàn bộ email muốn giữ (tối đa 2). Để trống cả hai ô sẽ xóa các liên hệ hiện tại.</Callout> : null}
        {emails.map((email, i) => <TextField key={i} label={`Email phụ huynh ${i + 1}`} type="email" value={email} maxLength={254} onChange={e => setEmails(prev => prev.map((v, index) => index === i ? e.target.value : v))} error={errors[`email_${i}`]} />)}
        <Checkbox label="Phụ huynh đã đồng ý nhận email" checked={consent} onChange={e => setConsent(e.target.checked)} aria-describedby={errors.consent ? 'consent-error' : undefined} aria-invalid={!!errors.consent} />
        {errors.consent ? <Callout tone="danger" role="alert"><span id="consent-error">{errors.consent}</span></Callout> : null}
      </> : null}
    </form>
  </Drawer>;
}

function RevealModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  async function reveal() {
    setBusy(true); setError('');
    try { const result = await studentsApi.reveal(id); setEmail(result.email); toast.show('Đã mở email phụ huynh.'); }
    catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  }
  return <Modal title="Email phụ huynh" onClose={busy ? () => undefined : onClose} actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Đóng</Button>{!email ? <Button write busy={busy} onClick={reveal}>Hiện email</Button> : null}</>}>
    <Stack><Callout tone="warn">Thao tác xem email đầy đủ được ghi nhật ký.</Callout>{error ? <Callout tone="danger" role="alert">{error}</Callout> : null}{email ? <p>{email}</p> : <p>Chỉ dùng email để liên hệ về bữa trưa của học sinh.</p>}</Stack>
  </Modal>;
}

function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  async function preview(selected: File | null) {
    setFile(selected); setResult(null); setError('');
    if (!selected) return;
    if (selected.size > 1024 * 1024) { setError('File CSV tối đa 1 MB.'); return; }
    setBusy(true);
    try { setResult(await studentsApi.import(selected, true)); }
    catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  }
  async function save() {
    if (!file || !result || result.summary.errors || !result.summary.rows) return;
    setBusy(true); setError('');
    try { const saved = await studentsApi.import(file, false); if (saved.saved) { toast.show(`Đã nhập ${saved.summary.ok} học sinh.`); onSaved(); } else setResult(saved); }
    catch (err) {
      setError(messageOf(err));
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'rows' in err.body && 'summary' in err.body) setResult(err.body as ImportResult);
    } finally { setBusy(false); }
  }
  function sample() {
    const blob = new Blob(['\uFEFFho_ten,ma_lop,email_1,email_2,da_dong_y\r\nHọc sinh mẫu,1A,phuhuynh@example.test,,co\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'mau-hoc-sinh.csv'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <Modal title="Nhập học sinh từ CSV" onClose={busy ? () => undefined : onClose} actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Đóng</Button><Button write busy={busy} disabled={!result || !!result.summary.errors || !result.summary.rows} onClick={save}>Lưu</Button></>}>
    <Stack>
      <Button variant="ghost" onClick={sample}>Tải file mẫu CSV</Button>
      <TextField label="File CSV (UTF-8, tối đa 1 MB)" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => void preview(e.target.files?.[0] ?? null)} />
      <Callout tone="info">Đổi mã lớp trong file mẫu thành mã lớp đang học. Cột da_dong_y nhận co hoặc khong; khong sẽ không lưu email.</Callout>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {busy ? <Skeleton rows={2} /> : result ? <>
        <p>{result.summary.rows} dòng · {result.summary.ok} hợp lệ · {result.summary.errors} lỗi. Chưa lưu cho đến khi bấm Lưu.</p>
        {result.rows.length ? <DataTable caption="Kết quả kiểm tra CSV" rows={result.rows} rowKey={r => r.line} columns={[
          { key: 'line', header: 'Dòng', cell: r => r.line }, { key: 'name', header: 'Họ tên', wrap: true, cell: r => r.full_name }, { key: 'class', header: 'Lớp', cell: r => r.class_code },
          { key: 'status', header: 'Kết quả', cell: r => <Badge tone={r.status === 'ok' ? 'ok' : 'danger'}>{r.status === 'ok' ? 'Hợp lệ' : 'Lỗi'}</Badge> },
          ...['ho_ten', 'ma_lop', 'email_1', 'email_2', 'da_dong_y'].map(key => ({ key, header: key, wrap: true, cell: (r: ImportResult['rows'][number]) => r.errors[key] || '—' })),
        ]} /> : <EmptyState title="File không có dòng dữ liệu" />}
      </> : <EmptyState title="Chọn file để kiểm tra trước khi lưu" />}
    </Stack>
  </Modal>;
}
