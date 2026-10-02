/**
 * FE-06 /lop-hoc/hoc-sinh: học sinh và email phụ huynh (student_views.py, BE-14).
 * - Danh sách chỉ hiện email đã che ("ng•••@gmail.com"). "Hiện email" chỉ Quản lý, mỗi lần xem được ghi nhật ký.
 * - Chỉ lưu email khi phụ huynh đã đồng ý; tối đa 2 email/bé. "Cho nghỉ học" xoá hẳn học sinh và email.
 * - Nhập CSV (?nhap-csv=1): chọn file → kiểm tra (dry-run) → chỉ lưu khi không có dòng lỗi (lưu tất cả hoặc không gì).
 * ?lop=ID lọc lớp, ?tao=1 thêm, ?sua=ID sửa.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { IconPlus } from '../../components/icons';
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
  Modal,
  PageHeader,
  SearchField,
  SelectField,
  Skeleton,
  Stack,
  TextField,
  Toolbar,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { formatDate } from '../../lib/format';
import { ApiError, fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { catalogApi, type SchoolClass } from '../../services/catalog';
import {
  CSV_COLUMNS,
  CSV_MAX_BYTES,
  studentsApi,
  type Contact,
  type ImportResult,
  type ImportRow,
  type Student,
  type StudentInput,
} from '../../services/students';
import { ClassTabs } from '../common/FeatureLayouts';
import { focusFirstInvalid, useQueryParam, useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import styles from './StudentsPage.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function StudentsPage() {
  const [classId] = useQueryParam('lop', '');
  const [create] = useQueryParam('tao');
  const [edit] = useQueryParam('sua');
  const [importing] = useQueryParam('nhap-csv');
  const updateParams = useUpdateParams();
  const classes = useApiQuery(catalogApi.classes, []);
  const q = useApiQuery(() => studentsApi.list(classId), [classId]);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [revealing, setRevealing] = useState<{ student: Student; contact: Contact } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const toast = useToast();

  const editing = q.data?.find((st) => String(st.id) === edit) ?? null;
  const closeForm = () => updateParams({ tao: null, sua: null });
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi');
    return (q.data ?? []).filter((st) => !term || st.full_name.toLocaleLowerCase('vi').includes(term));
  }, [q.data, search]);
  const withEmail = (q.data ?? []).filter((st) => st.contacts.some((c) => !c.unsubscribed_at)).length;

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setDeleteError('');
    try {
      await studentsApi.remove(deleting.id);
      toast.show(`Đã xoá ${deleting.full_name} và email phụ huynh.`);
      setDeleting(null);
      q.reload();
    } catch (err) {
      setDeleteError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const addButton = (
    <Button write icon={<IconPlus size={18} strokeWidth={2.4} />} onClick={() => updateParams({ tao: '1', sua: null })}>
      Thêm học sinh
    </Button>
  );

  const columns: Column<Student>[] = [
    { key: 'name', header: 'Họ tên', wrap: true, cell: (st) => <span className={tableText.strong}>{st.full_name}</span> },
    { key: 'class', header: 'Lớp', cell: (st) => st.class_code },
    {
      key: 'contacts',
      header: 'Email phụ huynh',
      wrap: true,
      cell: (st) =>
        st.contacts.length ? (
          <ul className={styles.contacts}>
            {st.contacts.map((c) => (
              <li key={c.id} className={styles.contact}>
                <span className={styles.hint}>{c.email_hint}</span>
                {c.unsubscribed_at ? <Badge>Đã huỷ nhận</Badge> : <Badge tone="ok">Đang nhận</Badge>}
                <Button write size="xs" variant="ghost" onClick={() => setRevealing({ student: st, contact: c })}>
                  Hiện email
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <span className={tableText.muted}>Chưa có email</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Thao tác</span>,
      align: 'right',
      cell: (st) => (
        <span className={s.inlineGroup}>
          <Button write size="xs" variant="secondary" onClick={() => updateParams({ sua: String(st.id), tao: null })}>
            Sửa
          </Button>
          <Button
            write
            size="xs"
            variant="danger"
            onClick={() => {
              setDeleteError('');
              setDeleting(st);
            }}
          >
            Cho nghỉ học
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Học sinh"
        actions={
          <>
            <Button write variant="secondary" onClick={() => updateParams({ 'nhap-csv': '1' })}>
              Nhập từ CSV
            </Button>
            {addButton}
          </>
        }
      />
      <ClassTabs />
      <Stack gap="lg">
        <Toolbar>
          {classes.error ? (
            <ErrorState message={classes.error} onRetry={classes.reload} />
          ) : (
            <SelectField
              label="Lớp"
              value={classId}
              disabled={classes.loading}
              onChange={(e) => updateParams({ lop: e.target.value || null, sua: null, tao: null })}
            >
              <option value="">Tất cả lớp</option>
              {(classes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                  {c.is_active ? '' : ' (ngừng)'}
                </option>
              ))}
            </SelectField>
          )}
          <SearchField value={search} onValueChange={setSearch} placeholder="Tìm theo họ tên" aria-label="Tìm học sinh theo họ tên" />
        </Toolbar>

        {q.data ? (
          <p className={s.muted}>
            {q.data.length} học sinh · {withEmail} bé có email đang nhận thư.
          </p>
        ) : null}

        {q.loading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState message={q.error} onRetry={q.reload} />
        ) : !q.data?.length ? (
          <EmptyState title={classId ? 'Lớp này chưa có học sinh' : 'Chưa có học sinh'} action={addButton} />
        ) : !rows.length ? (
          <EmptyState title="Không có học sinh khớp tìm kiếm" />
        ) : (
          <DataTable caption="Danh sách học sinh" rows={rows} rowKey={(st) => st.id} columns={columns} minWidth="720px" />
        )}
      </Stack>

      {create || editing ? (
        <StudentForm
          key={editing?.id ?? 'new'}
          student={editing}
          defaultClassId={classId}
          classes={classes.data ?? []}
          onClose={closeForm}
          onSaved={() => {
            closeForm();
            q.reload();
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Cho ${deleting.full_name} nghỉ học?`}
          confirmLabel="Xoá hẳn học sinh"
          tone="danger"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        >
          <p>Học sinh và mọi email phụ huynh của bé bị xoá hẳn khỏi hệ thống, không khôi phục được.</p>
          {deleteError ? (
            <Callout tone="danger" role="alert">
              {deleteError}
            </Callout>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {revealing ? <RevealModal student={revealing.student} contact={revealing.contact} onClose={() => setRevealing(null)} /> : null}

      {importing ? (
        <ImportModal
          classes={classes.data ?? []}
          onClose={() => updateParams({ 'nhap-csv': null })}
          onSaved={() => {
            updateParams({ 'nhap-csv': null });
            q.reload();
          }}
        />
      ) : null}
    </>
  );
}

function StudentForm({
  student,
  defaultClassId,
  classes,
  onClose,
  onSaved,
}: {
  student: Student | null;
  defaultClassId: string;
  classes: SchoolClass[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(student?.full_name ?? '');
  const [classId, setClassId] = useState(student ? String(student.class_id) : defaultClassId);
  // Sửa học sinh: mặc định giữ nguyên email; chỉ gửi contacts khi chọn "Thay email".
  const [replaceEmails, setReplaceEmails] = useState(!student);
  const [emails, setEmails] = useState(['', '']);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!name.trim()) next.full_name = 'Hãy nhập họ tên học sinh.';
    if (!classId) next.class_id = 'Hãy chọn lớp.';
    const filled = emails.map((email, slot) => ({ email: email.trim(), slot })).filter((c) => c.email);
    if (replaceEmails) {
      filled.forEach((c) => {
        if (!EMAIL_RE.test(c.email)) next[`email_${c.slot}`] = 'Email chưa đúng định dạng.';
      });
      if (filled.length === 2 && filled[0].email.toLowerCase() === filled[1].email.toLowerCase()) {
        next.email_1 = 'Hai email bị trùng nhau.';
      }
      if (filled.length && !consent) next.consent = 'Chỉ lưu email khi phụ huynh đã đồng ý nhận thư.';
    }
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstInvalid('student-form');
      return;
    }

    const body: Partial<StudentInput> = { full_name: name.trim() };
    if (!student || student.class_id !== Number(classId)) body.class_id = Number(classId);
    if (replaceEmails) body.contacts = filled.map((c) => ({ email: c.email, consent: true }));
    setBusy(true);
    try {
      if (student) await studentsApi.update(student.id, body);
      else await studentsApi.create(body as StudentInput);
      toast.show(student ? `Đã lưu ${name.trim()}.` : `Đã thêm ${name.trim()}.`);
      onSaved();
    } catch (err) {
      const fields = fieldsOf(err);
      // contacts[i] là vị trí trong danh sách đã lọc ô trống → đổi về ô nhập tương ứng.
      filled.forEach((c, i) => {
        if (fields[`contacts[${i}].email`]) fields[`email_${c.slot}`] = fields[`contacts[${i}].email`];
        if (fields[`contacts[${i}].consent`]) fields.consent = fields[`contacts[${i}].consent`];
      });
      if (fields.contacts) fields.email_0 = fields.contacts;
      setErrors(fields);
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const classOptions = classes.filter((c) => c.is_active || c.id === student?.class_id);

  return (
    <Drawer
      title={student ? `Sửa học sinh ${student.full_name}` : 'Thêm học sinh'}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button write type="submit" form="student-form" busy={busy}>
            {student ? 'Lưu thay đổi' : 'Thêm học sinh'}
          </Button>
        </>
      }
    >
      <form id="student-form" className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        ) : null}
        <TextField label="Họ tên học sinh" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} error={errors.full_name} required />
        <SelectField label="Lớp" value={classId} onChange={(e) => setClassId(e.target.value)} error={errors.class_id} required>
          <option value="">Chọn lớp</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </SelectField>

        {student ? (
          <div className={styles.current}>
            <p className={s.subhead}>Email hiện có</p>
            {student.contacts.length ? (
              <ul className={styles.contacts}>
                {student.contacts.map((c) => (
                  <li key={c.id} className={styles.contact}>
                    <span className={styles.hint}>{c.email_hint}</span>
                    <span className={s.muted}>đồng ý {formatDate(c.consent_at)}</span>
                    {c.unsubscribed_at ? <Badge>Đã huỷ nhận</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.muted}>Chưa có email.</p>
            )}
            <Checkbox label="Thay danh sách email phụ huynh" checked={replaceEmails} onChange={(e) => setReplaceEmails(e.target.checked)} />
          </div>
        ) : null}

        {replaceEmails ? (
          <>
            {student ? (
              <Callout tone="info">
                Nhập lại mọi email muốn giữ (tối đa 2). Email trùng email cũ giữ nguyên ngày đồng ý và trạng thái huỷ nhận; để trống cả hai ô sẽ
                xoá hết email của bé.
              </Callout>
            ) : null}
            {emails.map((email, slot) => (
              <TextField
                key={slot}
                label={`Email phụ huynh ${slot + 1}`}
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                value={email}
                maxLength={254}
                onChange={(e) => setEmails((prev) => prev.map((v, i) => (i === slot ? e.target.value : v)))}
                error={errors[`email_${slot}`]}
                hint={slot === 1 ? 'Không bắt buộc.' : undefined}
              />
            ))}
            <div className={styles.consent}>
              <Checkbox
                label="Phụ huynh đã đồng ý nhận email thực đơn (có phiếu đồng ý)"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={errors.consent ? 'consent-error' : undefined}
              />
              {errors.consent ? (
                <p className={styles.error} id="consent-error">
                  {errors.consent}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </form>
    </Drawer>
  );
}

function RevealModal({ student, contact, onClose }: { student: Student; contact: Contact; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reveal = async () => {
    setBusy(true);
    setError('');
    try {
      setEmail((await studentsApi.reveal(contact.id)).email);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Xem email phụ huynh"
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Đóng
          </Button>
          {!email ? (
            <Button write busy={busy} onClick={reveal}>
              Hiện email đầy đủ
            </Button>
          ) : null}
        </>
      }
    >
      <Stack>
        <p>
          Phụ huynh của <strong>{student.full_name}</strong> ({student.class_code}): {contact.email_hint}
        </p>
        <Callout tone="warn">Mỗi lần xem email đầy đủ đều được ghi vào nhật ký. Chỉ dùng để liên hệ về bữa trưa của bé.</Callout>
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
        {email ? (
          <p className={styles.revealed} aria-live="polite">
            {email}
          </p>
        ) : null}
      </Stack>
    </Modal>
  );
}

function ImportModal({ classes, onClose, onSaved }: { classes: SchoolClass[]; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const check = async (selected: File | null) => {
    setFile(selected);
    setResult(null);
    setError('');
    if (!selected) return;
    if (selected.size > CSV_MAX_BYTES) {
      setError('File CSV tối đa 1 MB.');
      return;
    }
    setBusy(true);
    try {
      setResult(await studentsApi.importCsv(selected, true));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const saved = await studentsApi.importCsv(file, false);
      toast.show(`Đã nhập ${saved.summary.ok} học sinh (${saved.summary.with_email} bé có email).`);
      onSaved();
    } catch (err) {
      setError(messageOf(err));
      // 400 có rows/summary: dữ liệu đổi từ lúc kiểm tra (ví dụ trùng học sinh vừa thêm) → hiện lại kết quả.
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'rows' in err.body) setResult(err.body as ImportResult);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const sampleClass = classes.find((c) => c.is_active)?.code ?? '1A1';
    downloadCsv('mau-nhap-hoc-sinh.csv', [
      [...CSV_COLUMNS],
      ['Nguyễn Văn An', sampleClass, 'phuhuynh.an@example.com', '', 'co'],
      ['Trần Thị Bình', sampleClass, '', '', 'khong'],
    ]);
  };

  const canSave = Boolean(result && result.summary.rows > 0 && result.summary.errors === 0);
  const errorColumns: Column<ImportRow>[] = [
    { key: 'line', header: 'Dòng', align: 'right', cell: (r) => r.line },
    { key: 'name', header: 'Họ tên', wrap: true, cell: (r) => r.full_name || '—' },
    { key: 'class', header: 'Lớp', cell: (r) => r.class_code || '—' },
    { key: 'emails', header: 'Email lưu', align: 'right', cell: (r) => r.emails },
    {
      key: 'status',
      header: 'Kết quả',
      wrap: true,
      cell: (r) =>
        r.status === 'ok' ? (
          <Badge tone="ok">Hợp lệ</Badge>
        ) : (
          <span className={styles.rowErrors}>
            <Badge tone="danger">Lỗi</Badge>
            {Object.entries(r.errors)
              .map(([col, msg]) => `${col}: ${msg}`)
              .join(' · ')}
          </span>
        ),
    },
  ];

  return (
    <Modal
      title="Nhập học sinh từ CSV"
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Đóng
          </Button>
          <Button write busy={busy} disabled={!canSave} onClick={save}>
            {result ? `Lưu ${result.summary.ok} học sinh` : 'Lưu'}
          </Button>
        </>
      }
    >
      <Stack>
        <p>
          Cột: <code>{CSV_COLUMNS.join(', ')}</code>. <code>da_dong_y</code> nhận <code>co</code> hoặc <code>khong</code>; <code>khong</code> chỉ lưu học
          sinh, không lưu email. File UTF-8, tối đa 1 MB.
        </p>
        <span className={s.inlineGroup}>
          <Button variant="secondary" size="sm" onClick={downloadTemplate}>
            Tải file mẫu
          </Button>
        </span>
        <TextField label="Chọn file CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => void check(e.target.files?.[0] ?? null)} />
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
        {busy && !result ? <Skeleton rows={2} label="Đang kiểm tra file" /> : null}
        {result ? (
          <>
            <Callout tone={result.summary.errors ? 'danger' : 'ok'} role="status">
              {result.summary.rows} dòng · {result.summary.ok} hợp lệ · {result.summary.errors} lỗi · {result.summary.with_email} bé có email.{' '}
              {result.summary.errors
                ? 'Sửa các dòng lỗi trong file rồi chọn lại; chưa lưu dòng nào.'
                : 'Chưa lưu: bấm Lưu để ghi toàn bộ.'}
            </Callout>
            {result.rows.length ? (
              <DataTable caption="Kết quả kiểm tra từng dòng" rows={result.rows} rowKey={(r) => r.line} columns={errorColumns} />
            ) : (
              <EmptyState title="File không có dòng dữ liệu" />
            )}
          </>
        ) : null}
      </Stack>
    </Modal>
  );
}
