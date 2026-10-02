/**
 * Phiếu xuất: danh sách, tạo nháp (?tao=1), xem & chốt (?phieu=ID).
 * Giá vốn mỗi dòng chụp theo bình quân lúc chốt; chốt bị chặn nếu không đủ tồn (409).
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IconArrowOut, IconCheck } from '../../components/icons';
import {
  Button,
  Callout,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  KeyValueList,
  Lead,
  Pagination,
  SearchField,
  Segmented,
  Skeleton,
  Stack,
  TextareaField,
  TextField,
  Toolbar,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { normalizeDecimalInput } from '../../lib/decimal';
import { formatDate, formatDateTime, formatMoney, formatQty, todayISO } from '../../lib/format';
import { messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi, QTY_RULE, type Food, type Issue } from '../../services/inventory';
import { DocStatusBadge, LinesEditor, newLine, focusFirstInvalid, useQueryParam, useUpdateParams, type DraftLine } from './shared';
import s from './shared.module.css';

const PAGE_SIZE = 10;
type StatusFilter = 'all' | 'DRAFT' | 'POSTED';

export function IssuesPage() {
  const toast = useToast();
  const list = useApiQuery(() => inventoryApi.issues(), []);
  const foodsQuery = useApiQuery(() => inventoryApi.foods(), []);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createParam, setCreateParam] = useQueryParam('tao');
  const [docParam, setDocParam] = useQueryParam('phieu');
  const updateParams = useUpdateParams();

  const issues = list.data ?? [];
  const foods = foodsQuery.data ?? [];
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const draftCount = issues.filter((r) => r.status === 'DRAFT').length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!q) return true;
      return r.code.toLowerCase().includes(q) || r.note.toLowerCase().includes(q) || r.lines.some((l) => (l.food_name ?? '').toLowerCase().includes(q));
    });
  }, [issues, status, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selected = issues.find((r) => String(r.id) === docParam) ?? null;

  const columns: Column<Issue>[] = [
    {
      key: 'code',
      header: 'Mã phiếu',
      width: '22%',
      cell: (r) => (
        <button type="button" className={tableText.rowLink} onClick={() => setDocParam(String(r.id))}>
          {r.code}
        </button>
      ),
    },
    { key: 'date', header: 'Ngày', width: '13%', cell: (r) => <span className="num">{formatDate(r.date)}</span> },
    {
      key: 'items',
      header: 'Mặt hàng',
      width: '27%',
      cell: (r) => (
        <span className={tableText.muted}>
          {r.lines[0]?.food_name ?? '—'}
          {r.lines.length > 1 ? ` +${r.lines.length - 1}` : ''}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Giá trị xuất',
      width: '18%',
      align: 'right',
      cell: (r) => (r.status === 'POSTED' ? <span className={tableText.strong}>{formatMoney(r.total_value)}</span> : <span className={tableText.muted}>Tính khi chốt</span>),
    },
    { key: 'status', header: 'Trạng thái', width: '13%', cell: (r) => <DocStatusBadge status={r.status} /> },
  ];

  return (
    <Stack gap="lg">
      {list.data ? (
        <Lead>
          <strong>{issues.length}</strong> phiếu xuất
          {draftCount ? (
            <>
              {' '}
              · <strong>{draftCount}</strong> nháp chờ chốt
            </>
          ) : null}
        </Lead>
      ) : null}

      <Toolbar>
        <Segmented
          label="Lọc theo trạng thái"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'DRAFT', label: 'Nháp', count: draftCount },
            { value: 'POSTED', label: 'Đã chốt' },
          ]}
        />
        <SearchField
          value={search}
          onValueChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Tìm mã phiếu, mặt hàng…"
        />
      </Toolbar>

      {list.loading ? (
        <Skeleton rows={6} />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : issues.length === 0 ? (
        <EmptyState
          icon={<IconArrowOut size={32} />}
          title="Chưa có phiếu xuất nào"
          action={
            <Button write icon={<IconArrowOut size={18} />} onClick={() => setCreateParam('1')}>
              Tạo phiếu xuất
            </Button>
          } />
      ) : filtered.length === 0 ? (
        <EmptyState title="Không có phiếu phù hợp" />
      ) : (
        <>
          <DataTable caption="Danh sách phiếu xuất" rows={visible} rowKey={(r) => r.id} columns={columns} minWidth="720px" />
          <Pagination page={current} pageCount={pageCount} onPageChange={setPage} summary={`Đang hiện ${visible.length} trong ${filtered.length} phiếu, mới nhất trước`} />
        </>
      )}

      {createParam ? (
        <CreateIssueDrawer
          foods={foods.filter((f) => f.is_active)}
          loading={foodsQuery.loading}
          error={foodsQuery.error}
          onClose={() => setCreateParam(null)}
          onCreated={(r) => {
            list.reload();
            toast.show(`Đã lưu nháp phiếu xuất ${r.code}.`);
            updateParams({ tao: null, 'mat-hang': null, phieu: String(r.id) });
          }}
        />
      ) : null}

      {selected ? (
        <IssueDrawer
          issue={selected}
          foodById={foodById}
          onClose={() => setDocParam(null)}
          onPosted={() => {
            list.reload();
            foodsQuery.reload();
          }}
        />
      ) : null}
    </Stack>
  );
}

function CreateIssueDrawer({
  foods,
  loading,
  error,
  onClose,
  onCreated,
}: {
  foods: Food[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onCreated: (r: Issue) => void;
}) {
  const [params, setParams] = useSearchParams();
  const preset = params.get('mat-hang') ?? '';
  const [code, setCode] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine(preset)]);
  const [errors, setErrors] = useState<{ date?: string; lines: Record<number, { food?: string; quantity?: string }> }>({ lines: {} });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (preset) {
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.delete('mat-hang');
        return n;
      }, { replace: true });
    }
  }, [preset, setParams]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = { lines: {} };
    if (!date) next.date = 'Hãy chọn ngày xuất.';
    const payloadLines: { food_id: number; quantity: string }[] = [];
    for (const l of lines) {
      const le: { food?: string; quantity?: string } = {};
      if (!l.foodId) le.food = 'Hãy chọn mặt hàng.';
      const q = normalizeDecimalInput(l.quantity, { ...QTY_RULE, positive: true, label: 'Số lượng' });
      if (!q.ok) le.quantity = q.error;
      if (Object.keys(le).length) next.lines[l.key] = le;
      else if (q.ok) payloadLines.push({ food_id: Number(l.foodId), quantity: q.value });
    }
    setErrors(next);
    if (next.date || Object.keys(next.lines).length) {
      focusFirstInvalid('create-issue');
      return;
    }
    setBusy(true);
    try {
      const created = await inventoryApi.createIssue({
        ...(code.trim() ? { code: code.trim() } : {}),
        date,
        note: note.trim(),
        lines: payloadLines,
      });
      onCreated(created);
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      kicker="Phiếu xuất mới · nháp"
      title="Xuất kho"
      subtitle="Nháp chưa trừ tồn. Giá vốn được tính khi chốt."
      width="560px"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="create-issue" write busy={busy}>
            Lưu nháp
          </Button>
        </>
      }
    >
      {loading ? (
        <Skeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} />
      ) : foods.length === 0 ? (
        <Callout tone="warn" title="Chưa có mặt hàng đang dùng">
          <Link to="/kho/danh-muc?tab=mat-hang&tao=1">Thêm mặt hàng</Link> rồi nhập hàng trước khi xuất.
        </Callout>
      ) : (
        <form id="create-issue" className={s.form} onSubmit={onSubmit} noValidate>
          {formError ? (
            <Callout tone="danger" role="alert">
              {formError}
            </Callout>
          ) : null}
          <div className={s.formGrid}>
            <TextField data-autofocus label="Mã phiếu" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Để trống: tự tạo" hint="Ví dụ PX-0929-01" maxLength={32} />
            <TextField label="Ngày xuất" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} required />
            <TextareaField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: xuất cho bữa trưa" rows={2} fieldClassName={s.span2} />
          </div>
          <h3 className={s.subhead}>Dòng hàng</h3>
          <LinesEditor lines={lines} onChange={setLines} foods={foods} withPrice={false} errors={errors.lines} warnOverStock />
        </form>
      )}
    </Drawer>
  );
}

function IssueDrawer({ issue, foodById, onClose, onPosted }: { issue: Issue; foodById: Map<number, Food>; onClose: () => void; onPosted: () => void }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const draft = issue.status === 'DRAFT';

  const doPost = async () => {
    setBusy(true);
    setError('');
    try {
      await inventoryApi.postIssue(issue.id);
      toast.show(`Đã chốt phiếu xuất ${issue.code}. Tồn kho đã được trừ.`);
      setConfirm(false);
      onPosted();
    } catch (err) {
      setError(messageOf(err));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        kicker={`Phiếu xuất · ${draft ? 'Nháp' : 'Đã chốt'}`}
        title={issue.code}
        subtitle={`Ngày xuất ${formatDate(issue.date)}`}
        onClose={onClose}
        footer={
          draft ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                Đóng
              </Button>
              <Button write icon={<IconCheck size={18} />} onClick={() => setConfirm(true)}>
                Chốt phiếu
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
          )
        }
      >
        {error ? (
          <Callout tone="danger" role="alert" title="Chưa chốt được phiếu">
            {error}
          </Callout>
        ) : null}
        {draft ? <Callout tone="info">Phiếu đang là nháp: tồn kho chưa bị trừ.</Callout> : null}
        <KeyValueList
          items={[
            { label: 'Trạng thái', value: <DocStatusBadge status={issue.status} /> },
            { label: 'Ngày xuất', value: formatDate(issue.date) },
            ...(issue.posted_at ? [{ label: 'Chốt lúc', value: formatDateTime(issue.posted_at) }] : []),
            ...(issue.note ? [{ label: 'Ghi chú', value: issue.note }] : []),
          ]}
        />
        <h3 className={s.subhead}>Dòng hàng ({issue.lines.length})</h3>
        <ul className={s.docLines}>
          {issue.lines.map((l) => {
            const food = foodById.get(l.food_id);
            return (
              <li key={l.id} className={s.docLine}>
                <div>
                  <p className={s.docLineName}>{l.food_name || food?.name}</p>
                  <p className={s.docLineMeta}>
                    {formatQty(l.quantity, food?.unit)}
                    {draft && food ? ` · đang tồn ${formatQty(food.quantity, food.unit)}` : ` × ${formatMoney(l.unit_cost)}`}
                  </p>
                </div>
                <span className={s.docLineValue}>{draft ? '—' : formatMoney(l.line_total ?? null)}</span>
              </li>
            );
          })}
        </ul>
        {!draft ? (
          <div className={s.totalBar}>
            <span>Giá trị xuất</span>
            <strong>{formatMoney(issue.total_value)}</strong>
          </div>
        ) : null}
      </Drawer>
      {confirm ? (
        <ConfirmDialog title={`Chốt phiếu xuất ${issue.code}?`} confirmLabel="Chốt phiếu" busy={busy} onConfirm={doPost} onCancel={() => setConfirm(false)}>
          Tồn kho sẽ bị trừ theo {issue.lines.length} dòng hàng, giá vốn tính theo bình quân hiện tại. Nếu một mặt hàng không đủ tồn, cả phiếu sẽ không được chốt.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
