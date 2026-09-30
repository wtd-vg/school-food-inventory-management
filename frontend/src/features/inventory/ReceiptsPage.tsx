/**
 * Phiếu nhập: danh sách, tạo nháp (?tao=1), xem & chốt (?phieu=ID).
 * API chỉ có tạo nháp, xem, chốt (không sửa/xoá nháp). Nháp không đổi tồn; chốt cập nhật tồn + giá vốn.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IconArrowIn, IconCheck } from '../../components/icons';
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
  SelectField,
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
import { inventoryApi, PRICE_RULE, QTY_RULE, type Food, type Receipt } from '../../services/inventory';
import { DocStatusBadge, draftTotal, LinesEditor, newLine, focusFirstInvalid, useQueryParam, useUpdateParams, type DraftLine } from './shared';
import s from './shared.module.css';

const PAGE_SIZE = 10;
type StatusFilter = 'all' | 'DRAFT' | 'POSTED';

export function ReceiptsPage() {
  const toast = useToast();
  const list = useApiQuery(() => inventoryApi.receipts(), []);
  const refs = useApiQuery(() => Promise.all([inventoryApi.foods(), inventoryApi.suppliers()]), []);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createParam, setCreateParam] = useQueryParam('tao');
  const [docParam, setDocParam] = useQueryParam('phieu');
  const updateParams = useUpdateParams();

  const receipts = list.data ?? [];
  const foods = refs.data?.[0] ?? [];
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const draftCount = receipts.filter((r) => r.status === 'DRAFT').length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!q) return true;
      return (
        `#${r.id}`.includes(q) ||
        (r.supplier_name ?? '').toLowerCase().includes(q) ||
        r.lines.some((l) => (l.food_name ?? '').toLowerCase().includes(q))
      );
    });
  }, [receipts, status, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selected = receipts.find((r) => String(r.id) === docParam) ?? null;

  const columns: Column<Receipt>[] = [
    {
      key: 'id',
      header: 'Phiếu',
      width: '12%',
      cell: (r) => (
        <button type="button" className={tableText.rowLink} onClick={() => setDocParam(String(r.id))}>
          #{r.id}
        </button>
      ),
    },
    { key: 'date', header: 'Ngày', width: '13%', cell: (r) => <span className="num">{formatDate(r.date)}</span> },
    { key: 'supplier', header: 'Nhà cung cấp', width: '25%', cell: (r) => <span className={tableText.strong}>{r.supplier_name || '—'}</span> },
    {
      key: 'items',
      header: 'Mặt hàng',
      width: '22%',
      cell: (r) => (
        <span className={tableText.muted}>
          {r.lines[0]?.food_name ?? '—'}
          {r.lines.length > 1 ? ` +${r.lines.length - 1}` : ''}
        </span>
      ),
    },
    { key: 'total', header: 'Tổng tiền', width: '15%', align: 'right', cell: (r) => <span className={tableText.strong}>{formatMoney(r.total_value)}</span> },
    { key: 'status', header: 'Trạng thái', width: '13%', cell: (r) => <DocStatusBadge status={r.status} /> },
  ];

  return (
    <Stack gap="lg">
      {list.data ? (
        <Lead>
          <strong>{receipts.length}</strong> phiếu nhập
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
          placeholder="Tìm NCC hoặc mặt hàng…"
        />
      </Toolbar>

      {list.loading ? (
        <Skeleton rows={6} />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : receipts.length === 0 ? (
        <EmptyState
          icon={<IconArrowIn size={32} />}
          title="Chưa có phiếu nhập nào"
          action={
            <Button write icon={<IconArrowIn size={18} />} onClick={() => setCreateParam('1')}>
              Tạo phiếu nhập
            </Button>
          }
        >
          Phiếu nhập ghi lại hàng về và cập nhật giá vốn khi chốt.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="Không có phiếu phù hợp">Thử đổi bộ lọc hoặc từ khoá.</EmptyState>
      ) : (
        <>
          <DataTable caption="Danh sách phiếu nhập" rows={visible} rowKey={(r) => r.id} columns={columns} minWidth="760px" />
          <Pagination page={current} pageCount={pageCount} onPageChange={setPage} summary={`Đang hiện ${visible.length} trong ${filtered.length} phiếu, mới nhất trước`} />
        </>
      )}

      {createParam ? (
        <CreateReceiptDrawer
          foods={foods.filter((f) => f.is_active)}
          refsLoading={refs.loading}
          refsError={refs.error}
          suppliers={(refs.data?.[1] ?? []).filter((x) => x.is_active)}
          onClose={() => setCreateParam(null)}
          onCreated={(r) => {
            list.reload();
            toast.show(`Đã lưu nháp phiếu nhập #${r.id}.`);
            updateParams({ tao: null, 'mat-hang': null, ncc: null, phieu: String(r.id) });
          }}
        />
      ) : null}

      {selected ? (
        <ReceiptDrawer
          receipt={selected}
          foodById={foodById}
          onClose={() => setDocParam(null)}
          onPosted={() => {
            list.reload();
            refs.reload();
          }}
        />
      ) : null}
    </Stack>
  );
}

function CreateReceiptDrawer({
  foods,
  suppliers,
  refsLoading,
  refsError,
  onClose,
  onCreated,
}: {
  foods: Food[];
  suppliers: { id: number; name: string }[];
  refsLoading: boolean;
  refsError: string | null;
  onClose: () => void;
  onCreated: (r: Receipt) => void;
}) {
  const [params, setParams] = useSearchParams();
  const preset = params.get('mat-hang') ?? '';
  const presetSupplier = params.get('ncc') ?? '';
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine(preset)]);
  const [errors, setErrors] = useState<{ supplier?: string; date?: string; lines: Record<number, { food?: string; quantity?: string; unitPrice?: string }> }>({ lines: {} });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // NCC gợi ý (từ trang Nhà cung cấp): áp dụng khi danh sách đã tải.
    if (presetSupplier && suppliers.length === 0) return;
    if (presetSupplier && suppliers.some((x) => String(x.id) === presetSupplier)) setSupplierId(presetSupplier);
    // Đã dùng mặt hàng / NCC gợi ý thì bỏ khỏi URL.
    if (preset || presetSupplier) {
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.delete('mat-hang');
        n.delete('ncc');
        return n;
      }, { replace: true });
    }
  }, [preset, presetSupplier, suppliers, setParams]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = { lines: {} };
    if (!supplierId) next.supplier = 'Hãy chọn nhà cung cấp.';
    if (!date) next.date = 'Hãy chọn ngày chứng từ.';
    const payloadLines: { food_id: number; quantity: string; unit_price: string }[] = [];
    for (const l of lines) {
      const le: { food?: string; quantity?: string; unitPrice?: string } = {};
      if (!l.foodId) le.food = 'Hãy chọn mặt hàng.';
      const q = normalizeDecimalInput(l.quantity, { ...QTY_RULE, positive: true, label: 'Số lượng' });
      if (!q.ok) le.quantity = q.error;
      const p = normalizeDecimalInput(l.unitPrice, { ...PRICE_RULE, positive: true, label: 'Đơn giá' });
      if (!p.ok) le.unitPrice = p.error;
      if (Object.keys(le).length) next.lines[l.key] = le;
      else if (q.ok && p.ok) payloadLines.push({ food_id: Number(l.foodId), quantity: q.value, unit_price: p.value });
    }
    setErrors(next);
    if (next.supplier || next.date || Object.keys(next.lines).length) {
      focusFirstInvalid('create-receipt');
      return;
    }
    setBusy(true);
    try {
      const created = await inventoryApi.createReceipt({ supplier_id: Number(supplierId), date, note: note.trim(), lines: payloadLines });
      onCreated(created);
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      kicker="Phiếu nhập mới · nháp"
      title="Nhập hàng"
      subtitle="Nháp chưa làm thay đổi tồn kho."
      width="560px"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="create-receipt" write busy={busy}>
            Lưu nháp
          </Button>
        </>
      }
    >
      {refsLoading ? (
        <Skeleton rows={4} />
      ) : refsError ? (
        <ErrorState message={refsError} />
      ) : suppliers.length === 0 || foods.length === 0 ? (
        <Callout tone="warn" title="Chưa đủ dữ liệu để nhập hàng">
          {suppliers.length === 0 ? (
            <>
              Cần có ít nhất một nhà cung cấp đang hợp tác. <Link to="/nha-cung-cap?tao=1">Thêm nhà cung cấp</Link>
            </>
          ) : (
            <>
              Cần có ít nhất một mặt hàng đang dùng. <Link to="/kho/danh-muc?tab=mat-hang&tao=1">Thêm mặt hàng</Link>
            </>
          )}
        </Callout>
      ) : (
        <form id="create-receipt" className={s.form} onSubmit={onSubmit} noValidate>
          {formError ? (
            <Callout tone="danger" role="alert">
              {formError}
            </Callout>
          ) : null}
          <div className={s.formGrid}>
            <SelectField data-autofocus label="Nhà cung cấp" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} error={errors.supplier} required fieldClassName={s.span2}>
              <option value="">Chọn nhà cung cấp</option>
              {suppliers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </SelectField>
            <TextField label="Ngày chứng từ" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} required />
            <TextareaField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: nhập buổi sáng" rows={2} fieldClassName={s.span2} />
          </div>
          <h3 className={s.subhead}>Dòng hàng</h3>
          <LinesEditor lines={lines} onChange={setLines} foods={foods} withPrice errors={errors.lines} />
          <div className={s.totalBar}>
            <span>Tổng tạm tính</span>
            <strong>{formatMoney(draftTotal(lines))}</strong>
          </div>
        </form>
      )}
    </Drawer>
  );
}

function ReceiptDrawer({
  receipt,
  foodById,
  onClose,
  onPosted,
}: {
  receipt: Receipt;
  foodById: Map<number, Food>;
  onClose: () => void;
  onPosted: () => void;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const draft = receipt.status === 'DRAFT';

  const doPost = async () => {
    setBusy(true);
    setError('');
    try {
      await inventoryApi.postReceipt(receipt.id);
      toast.show(`Đã chốt phiếu nhập #${receipt.id}. Tồn kho đã được cập nhật.`);
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
        kicker={`Phiếu nhập #${receipt.id} · ${draft ? 'Nháp' : 'Đã chốt'}`}
        title={receipt.supplier_name || 'Phiếu nhập'}
        subtitle={`Ngày chứng từ ${formatDate(receipt.date)}`}
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
        {draft ? <Callout tone="info">Phiếu đang là nháp: tồn kho chưa thay đổi. Kiểm tra kỹ rồi bấm Chốt phiếu.</Callout> : null}
        <KeyValueList
          items={[
            { label: 'Trạng thái', value: <DocStatusBadge status={receipt.status} /> },
            { label: 'Nhà cung cấp', value: receipt.supplier_name || '—' },
            { label: 'Ngày chứng từ', value: formatDate(receipt.date) },
            ...(receipt.posted_at ? [{ label: 'Chốt lúc', value: formatDateTime(receipt.posted_at) }] : []),
            ...(receipt.note ? [{ label: 'Ghi chú', value: receipt.note }] : []),
          ]}
        />
        <h3 className={s.subhead}>Dòng hàng ({receipt.lines.length})</h3>
        <ul className={s.docLines}>
          {receipt.lines.map((l) => {
            const food = foodById.get(l.food_id);
            return (
              <li key={l.id} className={s.docLine}>
                <div>
                  <p className={s.docLineName}>{l.food_name || food?.name}</p>
                  <p className={s.docLineMeta}>
                    {formatQty(l.quantity, food?.unit)} × {formatMoney(l.unit_price)}
                  </p>
                </div>
                <span className={s.docLineValue}>{formatMoney(l.line_total ?? null)}</span>
              </li>
            );
          })}
        </ul>
        <div className={s.totalBar}>
          <span>Tổng tiền</span>
          <strong>{formatMoney(receipt.total_value)}</strong>
        </div>
      </Drawer>
      {confirm ? (
        <ConfirmDialog
          title={`Chốt phiếu nhập #${receipt.id}?`}
          confirmLabel="Chốt phiếu"
          busy={busy}
          onConfirm={doPost}
          onCancel={() => setConfirm(false)}
        >
          Tồn kho và giá vốn bình quân sẽ được cập nhật với {receipt.lines.length} dòng hàng, tổng {formatMoney(receipt.total_value)}. Phiếu đã chốt không sửa được.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
