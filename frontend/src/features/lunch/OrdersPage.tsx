/**
 * SF63 /bua-trua/don-dat: đơn đặt hàng nhà cung cấp (purchase_views.py).
 * - Lọc trạng thái ?trang-thai=, chi tiết ?don=ID, tạo đơn tay ?tao=1.
 * - Vòng đời: Nháp → Duyệt → Đã gửi NCC → Đã đóng (nhận đủ hoặc đóng phần còn lại); nháp/đã duyệt huỷ được.
 *   Mọi thao tác gửi kèm version; người khác vừa sửa → 409, tải lại đơn. Huỷ/đóng phải ghi lý do.
 * - Nhận hàng cho đơn đã gửi ở màn Nhận hàng (?don=ID).
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { IconPlus } from '../../components/icons';
import {
  Button,
  Callout,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  KeyValueList,
  Modal,
  PageHeader,
  Segmented,
  SelectField,
  Skeleton,
  Stack,
  TextareaField,
  TextField,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { normalizeDecimalInput } from '../../lib/decimal';
import { formatDate, formatDateTime, formatMoney, formatQty, todayISO } from '../../lib/format';
import { ApiError, fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { catalogApi } from '../../services/catalog';
import { inventoryApi, PRICE_RULE, QTY_RULE } from '../../services/inventory';
import { lunchApi, PO_STATUS, type PoAction, type PoStatus, type PurchaseOrder } from '../../services/lunch';
import { shiftDate } from '../../services/menus';
import { LunchTabs } from '../common/FeatureLayouts';
import { DocStatusBadge, LinesEditor, newLine, useQueryParam, useUpdateParams, type DraftLine } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import { PoStatusBadge } from './shared';

type Filter = 'all' | PoStatus;
const FILTERS: Filter[] = ['all', 'draft', 'approved', 'sent', 'closed', 'cancelled'];

export function OrdersPage() {
  const [filterParam, setFilter] = useQueryParam('trang-thai');
  const [orderId] = useQueryParam('don');
  const [creating] = useQueryParam('tao');
  const updateParams = useUpdateParams();
  const filter: Filter = FILTERS.includes(filterParam as Filter) ? (filterParam as Filter) : 'all';
  const q = useApiQuery(() => lunchApi.orders(), []);
  const rows = (q.data ?? []).filter((o) => filter === 'all' || o.status === filter);

  const createButton = (
    <Button write icon={<IconPlus size={18} strokeWidth={2.4} />} onClick={() => updateParams({ tao: '1', don: null })}>
      Tạo đơn tay
    </Button>
  );

  const columns: Column<PurchaseOrder>[] = [
    { key: 'code', header: 'Mã đơn', width: '152px', sort: (o) => o.code, cell: (o) => <span className={tableText.strong}>{o.code}</span> },
    { key: 'supplier', header: 'Nhà cung cấp', sort: (o) => o.supplier_name, cell: (o) => o.supplier_name },
    { key: 'expected', header: 'Giao dự kiến', width: '132px', sort: (o) => o.expected_date, cell: (o) => formatDate(o.expected_date) },
    {
      key: 'for',
      header: 'Cho ngày ăn',
      width: '132px',
      sort: (o) => o.lunch_date ?? '',
      cell: (o) => (o.lunch_date ? formatDate(o.lunch_date) : <span className={tableText.muted}>Đơn tay</span>),
    },
    {
      key: 'lines',
      header: 'Hàng (đã nhận/đặt)',
      // Danh sách mặt hàng có thể dài: cho xuống dòng thay vì cắt.
      wrap: true,
      cell: (o) => o.lines.map((l) => `${l.food_name} ${formatQty(l.qty_received, l.unit)}/${formatQty(l.qty_ordered, l.unit)}`).join(' · '),
    },
    { key: 'status', header: 'Trạng thái', width: '148px', sort: (o) => o.status, cell: (o) => <PoStatusBadge status={o.status} /> },
    {
      key: 'open',
      header: <span className="sr-only">Thao tác</span>,
      width: '92px',
      align: 'right',
      cell: (o) => (
        <Button size="xs" variant="outline" onClick={() => updateParams({ don: String(o.id), tao: null })}>
          Xem
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Đơn đặt hàng"
        description="Đơn gửi nhà cung cấp: tạo từ đề xuất của ngày ăn hoặc tạo tay; duyệt, gửi, rồi nhận hàng theo đơn."
        actions={createButton}
      />
      <LunchTabs />
      <Stack gap="lg">
        <Segmented
          label="Lọc theo trạng thái"
          value={filter}
          onChange={(v) => setFilter(v === 'all' ? null : v)}
          options={FILTERS.map((f) => ({
            value: f,
            label: f === 'all' ? 'Tất cả' : PO_STATUS[f].label,
            count: (q.data ?? []).filter((o) => f === 'all' || o.status === f).length,
          }))}
        />
        {q.loading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState message={q.error} onRetry={q.reload} />
        ) : !rows.length ? (
          <EmptyState title={filter === 'all' ? 'Chưa có đơn đặt' : 'Không có đơn ở trạng thái này'} action={createButton}>
            Đơn từ đề xuất tạo ở màn Nhu cầu & đề xuất.
          </EmptyState>
        ) : (
          <DataTable caption="Danh sách đơn đặt" rows={rows} rowKey={(o) => o.id} columns={columns} minWidth="1100px" />
        )}
      </Stack>

      {orderId ? <OrderDrawer id={Number(orderId)} onClose={() => updateParams({ don: null })} onChanged={q.reload} /> : null}
      {creating ? (
        <CreateOrderDrawer
          onClose={() => updateParams({ tao: null })}
          onCreated={(po) => {
            updateParams({ tao: null, don: String(po.id) });
            q.reload();
          }}
        />
      ) : null}
    </>
  );
}

const ACTION_LABEL: Record<PoAction, string> = {
  approve: 'Duyệt đơn',
  send: 'Đánh dấu đã gửi NCC',
  cancel: 'Huỷ đơn',
  close: 'Đóng phần còn lại',
};

function OrderDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const q = useApiQuery(() => lunchApi.order(id), [id]);
  const [busy, setBusy] = useState<PoAction | null>(null);
  const [asking, setAsking] = useState<'cancel' | 'close' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'danger' | 'warn'; text: string } | null>(null);
  // Đơn API vừa trả về sau thao tác: dùng ngay (version mới) trong lúc tải lại, tránh bấm tiếp với version cũ → 409.
  const [fresh, setFresh] = useState<PurchaseOrder | null>(null);
  const toast = useToast();
  const po = fresh && (!q.data || fresh.version >= q.data.version) ? fresh : q.data;

  const run = async (action: PoAction, reason?: string) => {
    if (!po) return false;
    setBusy(action);
    setNotice(null);
    try {
      const next = await lunchApi.orderAction(po.id, action, po.version, reason);
      setFresh(next);
      toast.show(`${ACTION_LABEL[action]}: ${next.code} → ${PO_STATUS[next.status].label}.`);
      q.reload();
      onChanged();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFresh(null);
        setNotice({ tone: 'warn', text: `${err.message} Đã tải lại đơn.` });
        q.reload();
        onChanged();
      } else setNotice({ tone: 'danger', text: messageOf(err) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer
      title={po ? `Đơn ${po.code}` : 'Đơn đặt'}
      kicker={po ? PO_STATUS[po.status].label : undefined}
      onClose={busy ? () => undefined : onClose}
      width="680px"
      footer={
        po ? (
          <>
            {po.status === 'draft' ? (
              <Button write busy={busy === 'approve'} disabled={busy !== null} onClick={() => void run('approve')}>
                Duyệt đơn
              </Button>
            ) : null}
            {po.status === 'approved' ? (
              <Button write busy={busy === 'send'} disabled={busy !== null} onClick={() => void run('send')}>
                Đánh dấu đã gửi NCC
              </Button>
            ) : null}
            {po.status === 'sent' ? (
              <Link className={s.subhead} to={`/bua-trua/nhan-hang?don=${po.id}`}>
                Nhận hàng theo đơn này
              </Link>
            ) : null}
            {po.status === 'draft' || po.status === 'approved' ? (
              <Button write variant="danger" disabled={busy !== null} onClick={() => setAsking('cancel')}>
                Huỷ đơn
              </Button>
            ) : null}
            {po.status === 'sent' ? (
              <Button write variant="secondary" disabled={busy !== null} onClick={() => setAsking('close')}>
                Đóng phần còn lại
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      {q.loading ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : po ? (
        <Stack gap="lg">
          {notice ? (
            <Callout tone={notice.tone} role="alert">
              {notice.text}
            </Callout>
          ) : null}
          <KeyValueList
            items={[
              { label: 'Nhà cung cấp', value: po.supplier_name },
              { label: 'Trạng thái', value: <PoStatusBadge status={po.status} /> },
              { label: 'Giao dự kiến', value: formatDate(po.expected_date) },
              {
                label: 'Nguồn',
                value: po.lunch_date ? (
                  <Link to={`/bua-trua/nhu-cau?ngay=${po.lunch_date}`}>Đề xuất ngày ăn {formatDate(po.lunch_date)}</Link>
                ) : (
                  'Đơn tạo tay'
                ),
              },
              { label: 'Ghi chú', value: po.note || '—' },
              { label: 'Tạo lúc', value: formatDateTime(po.created_at) },
              ...(po.sent_at ? [{ label: 'Gửi NCC lúc', value: formatDateTime(po.sent_at) }] : []),
              ...(po.closed_at ? [{ label: 'Đóng lúc', value: `${formatDateTime(po.closed_at)} · ${po.close_reason || '—'}` }] : []),
            ]}
          />
          <DataTable
            caption="Dòng hàng của đơn"
            rows={po.lines}
            rowKey={(l) => l.id}
            columns={[
              { key: 'food', header: 'Mặt hàng', cell: (l) => <span className={tableText.strong}>{l.food_name}</span> },
              { key: 'ordered', header: 'Đặt', align: 'right', cell: (l) => formatQty(l.qty_ordered, l.unit) },
              { key: 'received', header: 'Đã nhận', align: 'right', cell: (l) => formatQty(l.qty_received, l.unit) },
              { key: 'open', header: 'Còn chờ', align: 'right', cell: (l) => formatQty(l.qty_open, l.unit) },
              { key: 'price', header: 'Giá dự kiến', align: 'right', cell: (l) => (l.unit_price_est ? formatMoney(l.unit_price_est) : '—') },
            ]}
          />
          {po.receipts.length ? (
            <>
              <p className={s.subhead}>Phiếu nhận theo đơn</p>
              <ul className={s.docLines}>
                {po.receipts.map((r) => (
                  <li key={r.id} className={s.docLine}>
                    <span>
                      Phiếu nhập #{r.id} · {formatDate(r.date)}
                    </span>
                    <DocStatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Stack>
      ) : null}

      {asking && po ? (
        <ReasonModal
          title={asking === 'cancel' ? `Huỷ đơn ${po.code}?` : `Đóng phần còn lại của ${po.code}?`}
          confirmLabel={asking === 'cancel' ? 'Huỷ đơn' : 'Đóng đơn'}
          description={
            asking === 'cancel'
              ? 'Phần hàng đơn này đang giữ cho ngày ăn sẽ được bỏ giữ.'
              : 'Phần chưa nhận được bỏ giữ; hàng đã nhận giữ nguyên.'
          }
          busy={busy !== null}
          onCancel={() => setAsking(null)}
          onConfirm={async (reason) => {
            if (await run(asking, reason)) setAsking(null);
          }}
        />
      ) : null}
    </Drawer>
  );
}

export function ReasonModal({
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal
      title={title}
      role="alertdialog"
      onClose={busy ? () => undefined : onCancel}
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Quay lại
          </Button>
          <Button
            write
            variant="danger"
            busy={busy}
            onClick={() => {
              if (!reason.trim()) setError('Hãy ghi lý do.');
              else onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Stack>
        <p>{description}</p>
        <TextareaField label="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} rows={2} error={error} required />
      </Stack>
    </Modal>
  );
}

function CreateOrderDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (po: PurchaseOrder) => void }) {
  const suppliers = useApiQuery(catalogApi.suppliers, []);
  const foods = useApiQuery(inventoryApi.foods, []);
  const [supplierId, setSupplierId] = useState('');
  const [expected, setExpected] = useState(shiftDate(todayISO(), 1));
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<number, { food?: string; quantity?: string; unitPrice?: string }>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!supplierId) next.supplier_id = 'Chọn nhà cung cấp.';
    if (!expected) next.expected_date = 'Chọn ngày giao dự kiến.';
    const le: typeof lineErrors = {};
    const body: { food_id: number; qty_ordered: string; unit_price_est?: string }[] = [];
    for (const l of lines) {
      const err: { food?: string; quantity?: string; unitPrice?: string } = {};
      if (!l.foodId) err.food = 'Chọn mặt hàng.';
      const qty = normalizeDecimalInput(l.quantity, { ...QTY_RULE, positive: true, label: 'Số lượng' });
      if (!qty.ok) err.quantity = qty.error;
      let price: string | undefined;
      if (l.unitPrice.trim()) {
        const p = normalizeDecimalInput(l.unitPrice, { ...PRICE_RULE, label: 'Đơn giá' });
        if (!p.ok) err.unitPrice = p.error;
        else price = p.value;
      }
      if (Object.keys(err).length) le[l.key] = err;
      else if (qty.ok) body.push({ food_id: Number(l.foodId), qty_ordered: qty.value, ...(price ? { unit_price_est: price } : {}) });
    }
    setErrors(next);
    setLineErrors(le);
    if (Object.keys(next).length || Object.keys(le).length) return;
    setBusy(true);
    try {
      const po = await lunchApi.createOrder({ supplier_id: Number(supplierId), expected_date: expected, note: note.trim(), lines: body });
      toast.show(`Đã tạo đơn ${po.code} (nháp).`);
      onCreated(po);
    } catch (err) {
      setFormError(messageOf(err));
      setErrors(fieldsOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title="Tạo đơn đặt tay"
      subtitle="Đơn tay không gắn ngày ăn; khi đã duyệt/gửi và về kịp, đề xuất các ngày sau sẽ tính là hàng đang chờ về."
      width="640px"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button write type="submit" form="po-form" busy={busy}>
            Tạo đơn nháp
          </Button>
        </>
      }
    >
      {suppliers.loading || foods.loading ? (
        <Skeleton />
      ) : suppliers.error || foods.error ? (
        <ErrorState
          message={suppliers.error ?? foods.error ?? ''}
          onRetry={() => {
            suppliers.reload();
            foods.reload();
          }}
        />
      ) : (
        <form id="po-form" className={s.form} onSubmit={submit} noValidate>
          {formError ? (
            <Callout tone="danger" role="alert">
              {formError}
            </Callout>
          ) : null}
          <div className={s.formGrid}>
            <SelectField label="Nhà cung cấp" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} error={errors.supplier_id} required>
              <option value="">Chọn nhà cung cấp</option>
              {(suppliers.data ?? [])
                .filter((x) => x.is_active)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </SelectField>
            <TextField
              label="Ngày giao dự kiến"
              type="date"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              error={errors.expected_date}
              required
            />
          </div>
          <LinesEditor
            lines={lines}
            onChange={setLines}
            foods={(foods.data ?? []).filter((f) => f.is_active)}
            withPrice
            errors={lineErrors}
          />
          <p className={s.muted}>Đơn giá là giá dự kiến, có thể để trống; giá thật nhập khi nhận hàng.</p>
          <TextareaField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} />
        </form>
      )}
    </Drawer>
  );
}
