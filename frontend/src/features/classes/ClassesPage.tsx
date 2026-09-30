/**
 * Lớp học (thay ClassPage cũ). Sĩ số 0–200 (contract SF43). Mã lớp không đổi sau khi tạo (API PATCH không nhận code).
 * Đổi sĩ số không làm thay đổi sĩ số đã chụp của các ngày ăn đã mở (snapshot ở backend).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { IconPencil, IconPlus, IconUsers } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  SearchField,
  Segmented,
  Skeleton,
  Stack,
  TextField,
  Toolbar,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { formatNumber } from '../../lib/format';
import { messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { catalogApi, ENROLLED_MAX, type SchoolClass } from '../../services/catalog';
import { focusFirstInvalid, useQueryParam, useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import styles from './ClassesPage.module.css';

export function ClassesPage() {
  const query = useApiQuery(() => catalogApi.classes(), []);
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [createParam] = useQueryParam('tao');
  const [editParam] = useQueryParam('sua');
  const updateParams = useUpdateParams();

  const classes = query.data ?? [];
  const active = classes.filter((c) => c.is_active);
  const totalEnrolled = active.reduce((n, c) => n + c.enrolled, 0);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes
      .filter((c) => (status === 'all' ? true : status === 'active' ? c.is_active : !c.is_active))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code, 'vi', { numeric: true }));
  }, [classes, status, search]);
  const editing = classes.find((c) => String(c.id) === editParam) ?? null;

  const columns: Column<SchoolClass>[] = [
    {
      key: 'name',
      header: 'Lớp',
      width: '38%',
      cell: (c) => (
        <button type="button" className={tableText.rowButton} onClick={() => updateParams({ sua: String(c.id), tao: null })}>
          {c.name}
        </button>
      ),
    },
    { key: 'code', header: 'Mã', width: '18%', cell: (c) => <span className={tableText.muted}>{c.code}</span> },
    { key: 'enrolled', header: 'Sĩ số', width: '16%', align: 'right', cell: (c) => <span className={tableText.strong}>{c.enrolled}</span> },
    { key: 'status', header: 'Trạng thái', width: '18%', cell: (c) => (c.is_active ? <Badge tone="ok">Đang học</Badge> : <Badge>Ngừng</Badge>) },
    {
      key: 'actions',
      header: <span className="sr-only">Thao tác</span>,
      width: '56px',
      className: tableText.actionCell,
      align: 'right',
      cell: (c) => (
        <IconButton label={`Sửa ${c.name}`} ghost write onClick={() => updateParams({ sua: String(c.id), tao: null })}>
          <IconPencil size={18} />
        </IconButton>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Lớp học"
        actions={
          <Button write icon={<IconPlus size={18} strokeWidth={2.4} />} onClick={() => updateParams({ tao: '1', sua: null })}>
            Thêm lớp
          </Button>
        }
      />
      <Stack gap="lg">
        {query.data ? (
          <section className={styles.stat} aria-label="Tổng sĩ số">
            <p className={`${styles.bigNumber} num`}>
              {formatNumber(totalEnrolled, 0)}
              <span className={styles.bigUnit}> học sinh · {active.length} lớp đang học</span>
            </p>
            <p className={styles.statHint}>Số suất ăn mỗi ngày được nhập theo lớp và không vượt sĩ số.</p>
          </section>
        ) : null}
        <Toolbar>
          <Segmented
            label="Lọc theo trạng thái"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: 'Đang học' },
              { value: 'inactive', label: 'Ngừng', count: classes.length - active.length },
              { value: 'all', label: 'Tất cả' },
            ]}
          />
          <SearchField value={search} onValueChange={setSearch} placeholder="Tìm lớp…" />
        </Toolbar>
        {query.loading ? (
          <Skeleton rows={6} />
        ) : query.error ? (
          <ErrorState message={query.error} onRetry={query.reload} />
        ) : classes.length === 0 ? (
          <EmptyState
            icon={<IconUsers size={32} />}
            title="Chưa có lớp nào"
            action={
              <Button write icon={<IconPlus size={18} />} onClick={() => updateParams({ tao: '1' })}>
                Thêm lớp
              </Button>
            }
          >
            Thêm lớp và sĩ số để nhập suất ăn hằng ngày.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="Không có lớp phù hợp">Thử đổi bộ lọc hoặc từ khoá.</EmptyState>
        ) : (
          <DataTable caption="Danh sách lớp học" rows={filtered} rowKey={(c) => c.id} columns={columns} minWidth="560px" />
        )}
      </Stack>

      {createParam || editing ? (
        <ClassForm
          key={editing?.id ?? 'new'}
          schoolClass={editing}
          onClose={() => updateParams({ tao: null, sua: null })}
          onSaved={() => {
            query.reload();
            updateParams({ tao: null, sua: null });
          }}
        />
      ) : null}
    </>
  );
}

function ClassForm({ schoolClass, onClose, onSaved }: { schoolClass: SchoolClass | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState(schoolClass?.code ?? '');
  const [name, setName] = useState(schoolClass?.name ?? '');
  const [enrolled, setEnrolled] = useState(schoolClass ? String(schoolClass.enrolled) : '');
  const [active, setActive] = useState(schoolClass?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!schoolClass && !code.trim()) next.code = 'Hãy nhập mã lớp.';
    if (!name.trim()) next.name = 'Hãy nhập tên lớp.';
    const n = enrolled.trim();
    if (!/^\d+$/.test(n)) next.enrolled = 'Sĩ số là số nguyên, ví dụ 30.';
    else if (Number(n) > ENROLLED_MAX) next.enrolled = `Sĩ số tối đa ${ENROLLED_MAX}.`;
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstInvalid('class-form');
      return;
    }
    setBusy(true);
    try {
      if (schoolClass) await catalogApi.updateClass(schoolClass.id, { name: name.trim(), enrolled: Number(n), is_active: active });
      else await catalogApi.createClass({ code: code.trim(), name: name.trim(), enrolled: Number(n) });
      toast.show(schoolClass ? `Đã lưu lớp ${name.trim()}.` : `Đã thêm lớp ${name.trim()}.`);
      onSaved();
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      kicker={schoolClass ? `Mã ${schoolClass.code}` : 'Lớp mới'}
      title={schoolClass ? schoolClass.name : 'Thêm lớp'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="class-form" write busy={busy}>
            {schoolClass ? 'Lưu thay đổi' : 'Thêm lớp'}
          </Button>
        </>
      }
    >
      <form id="class-form" className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        ) : null}
        <TextField
          data-autofocus
          label="Mã lớp"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={errors.code}
          required={!schoolClass}
          readOnly={Boolean(schoolClass)}
          hint={schoolClass ? 'Mã lớp không đổi được sau khi tạo.' : 'Ví dụ 2A1'}
          maxLength={32}
        />
        <TextField label="Tên lớp" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required maxLength={120} placeholder="Lớp 2A1" />
        <TextField
          label="Sĩ số"
          inputMode="numeric"
          numeric
          suffix="HS"
          value={enrolled}
          onChange={(e) => setEnrolled(e.target.value)}
          error={errors.enrolled}
          required
          hint={`Từ 0 đến ${ENROLLED_MAX}. Đổi sĩ số không làm thay đổi các ngày ăn đã mở.`}
        />
        {schoolClass ? <Checkbox label="Đang học (bỏ chọn khi lớp không còn ăn bán trú)" checked={active} onChange={(e) => setActive(e.target.checked)} /> : null}
      </form>
    </Drawer>
  );
}
