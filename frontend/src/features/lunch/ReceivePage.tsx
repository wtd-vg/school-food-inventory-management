/**
 * SF65 /bua-trua/nhan-hang?don=ID: nhận hàng theo đơn đã gửi NCC.
 * Nhập lượng nhận (≤ phần còn chờ) + đơn giá thật → phiếu nhập NHÁP (POST /api/purchase-orders/<id>/receipts/),
 * rồi "Chốt phiếu nhập" (POST /api/receipts/<id>/post/) mới cộng tồn. Hàng về chuyển phần giữ "đơn chờ" sang "tồn".
 * Nhận vượt số đặt → 409 (kể cả hai phiếu nháp cộng lại vượt). Nhận đủ mọi dòng → đơn tự đóng.
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { IconCheck } from '../../components/icons';
import {
  Button,
  Callout,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionTitle,
  SelectField,
  Skeleton,
  Stack,
  TextareaField,
  TextField,
  tableText,
  useToast,
} from '../../components/ui';
import { add, cmp, normalizeDecimalInput, parseDec, toFixed, ZERO } from '../../lib/decimal';
import { formatDate, formatMoney, formatQty, todayISO, unitLabel } from '../../lib/format';
import { ApiError, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi, PRICE_RULE, QTY_RULE, type Receipt } from '../../services/inventory';
import { lunchApi, type PurchaseOrder } from '../../services/lunch';
import { LunchTabs } from '../common/FeatureLayouts';
import { DocStatusBadge, useQueryParam } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import { isZero, PoStatusBadge } from './shared';

export function ReceivePage() {
  const [orderParam, setOrder] = useQueryParam('don');
  const sent = useApiQuery(() => lunchApi.orders('sent'), []);
  const orderId = orderParam ? Number(orderParam) : null;
  const order = useApiQuery(() => (orderId ? lunchApi.order(orderId) : Promise.resolve(null)), [orderId]);
  const reloadAll = () => {
    sent.reload();
    order.reload();
  };

  return (
    <>
      <PageHeader
        title="Nhận hàng theo đơn"
        description="Chọn đơn đã gửi nhà cung cấp, nhập lượng thực nhận và đơn giá → phiếu nhập nháp → chốt để cộng vào tồn."
      />
      <LunchTabs />
      <Stack gap="lg">
        {sent.loading ? (
          <Skeleton rows={1} />
        ) : sent.error ? (
          <ErrorState message={sent.error} onRetry={sent.reload} />
        ) : (
          <SelectField label="Đơn đã gửi NCC" value={orderParam ?? ''} onChange={(e) => setOrder(e.target.value || null)}>
            <option value="">{sent.data?.length ? 'Chọn đơn' : 'Không có đơn đang chờ hàng'}</option>
            {(sent.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} · {o.supplier_name} · giao {formatDate(o.expected_date)}
              </option>
            ))}
            {order.data && order.data.status !== 'sent' ? (
              <option value={order.data.id}>
                {order.data.code} (đã đóng)
              </option>
            ) : null}
          </SelectField>
        )}

        {!orderId ? (
          <EmptyState title="Chọn một đơn để nhận hàng">
            Đơn phải ở trạng thái Đã gửi NCC. <Link to="/bua-trua/don-dat?trang-thai=approved">Xem đơn đã duyệt chưa gửi</Link>
          </EmptyState>
        ) : order.loading || (order.data && order.data.id !== orderId && !order.error) ? (
          <Skeleton />
        ) : order.error ? (
          <ErrorState message={order.error} onRetry={order.reload} />
        ) : order.data ? (
          <OrderReceive key={`${order.data.id}-${order.data.version}-${order.data.lines.map((l) => l.qty_received).join()}`} po={order.data} onChanged={reloadAll} />
        ) : null}
      </Stack>
    </>
  );
}

function OrderReceive({ po, onChanged }: { po: PurchaseOrder; onChanged: () => void }) {
  const drafts = po.receipts.filter((r) => r.status === 'DRAFT');
  const [rows, setRows] = useState(() =>
    Object.fromEntries(po.lines.map((l) => [l.id, { qty: '', price: l.unit_price_est ?? '' }])),
  );
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'danger' | 'warn' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const toast = useToast();

  const createDraft = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const next: Record<string, string> = {};
    const lines: { po_line_id: number; quantity: string; unit_price: string }[] = [];
    for (const l of po.lines) {
      const row = rows[l.id];
      if (!row.qty.trim()) continue;
      const qty = normalizeDecimalInput(row.qty, { ...QTY_RULE, positive: true, label: 'Lượng nhận' });
      if (!qty.ok) next[`${l.id}.qty`] = qty.error;
      else {
        if (cmp(parseDec(qty.value) ?? ZERO, parseDec(l.qty_open) ?? ZERO) > 0) next[`${l.id}.qty`] = `Tối đa ${formatQty(l.qty_open, l.unit)} (phần còn chờ).`;
      }
      const price = normalizeDecimalInput(row.price, { ...PRICE_RULE, label: 'Đơn giá' });
      if (!price.ok) next[`${l.id}.price`] = price.error;
      if (qty.ok && price.ok && !next[`${l.id}.qty`]) lines.push({ po_line_id: l.id, quantity: qty.value, unit_price: price.value });
    }
    if (!lines.length && !Object.keys(next).length) next.form = 'Nhập lượng nhận cho ít nhất một dòng.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy('draft');
    try {
      const r = await lunchApi.receive(po.id, { date, note: note.trim(), lines });
      setReceipt(r);
      toast.show(`Đã tạo phiếu nhập nháp #${r.id}. Tồn chưa đổi cho tới khi chốt.`);
      onChanged();
    } catch (err) {
      setNotice({ tone: 'danger', text: messageOf(err) });
      if (err instanceof ApiError && err.status === 409) onChanged();
    } finally {
      setBusy(null);
    }
  };

  const post = async (id: number) => {
    setBusy(`post-${id}`);
    setNotice(null);
    try {
      await inventoryApi.postReceipt(id);
      toast.show(`Đã chốt phiếu nhập #${id}, tồn kho đã cộng.`);
      setReceipt(null);
      onChanged();
    } catch (err) {
      setNotice({ tone: err instanceof ApiError && err.status === 409 ? 'warn' : 'danger', text: messageOf(err) });
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const total = receipt ? receipt.lines.reduce((acc, l) => add(acc, parseDec(l.line_total ?? '0') ?? ZERO), ZERO) : ZERO;

  return (
    <Stack gap="lg">
      <div className={s.inlineGroup}>
        <span className={s.subhead}>
          Đơn {po.code} · {po.supplier_name}
        </span>
        <PoStatusBadge status={po.status} />
        {po.lunch_date ? <span className={s.muted}>cho ngày ăn {formatDate(po.lunch_date)}</span> : null}
      </div>
      {notice ? (
        <Callout tone={notice.tone} role="alert">
          {notice.text}
        </Callout>
      ) : null}

      {receipt ? (
        <Callout
          tone="info"
          title={`Phiếu nhập nháp #${receipt.id}`}
          action={
            <Button write icon={<IconCheck size={18} />} busy={busy === `post-${receipt.id}`} onClick={() => post(receipt.id)}>
              Chốt phiếu nhập
            </Button>
          }
        >
          {receipt.lines.map((l) => `${l.food_name ?? `#${l.food_id}`} ${formatQty(l.quantity)} × ${formatMoney(l.unit_price)}`).join(' · ')} — tổng{' '}
          {formatMoney(toFixed(total, 2))}. Phiếu nháp chưa cộng tồn.
        </Callout>
      ) : null}

      {drafts.length && !receipt ? (
        <>
          <SectionTitle>Phiếu nháp chưa chốt của đơn</SectionTitle>
          <ul className={s.docLines}>
            {drafts.map((r) => (
              <li key={r.id} className={s.docLine}>
                <span>
                  Phiếu nhập #{r.id} · {formatDate(r.date)} <DocStatusBadge status={r.status} />
                </span>
                <Button write size="xs" busy={busy === `post-${r.id}`} disabled={busy !== null} onClick={() => post(r.id)}>
                  Chốt
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {po.status !== 'sent' ? (
        <Callout tone="ok" role="status">
          Đơn đã {po.close_reason ? `đóng (${po.close_reason})` : 'đóng'}; không nhận thêm.
        </Callout>
      ) : (
        <form id="receive-form" className={s.form} onSubmit={createDraft} noValidate>
          <DataTable
            caption={`Nhận hàng đơn ${po.code}`}
            rows={po.lines}
            rowKey={(l) => l.id}
            minWidth="720px"
            columns={[
              { key: 'food', header: 'Mặt hàng', cell: (l) => <span className={tableText.strong}>{l.food_name}</span> },
              { key: 'ordered', header: 'Đặt', align: 'right', cell: (l) => formatQty(l.qty_ordered, l.unit) },
              { key: 'received', header: 'Đã nhận', align: 'right', cell: (l) => formatQty(l.qty_received, l.unit) },
              { key: 'open', header: 'Còn chờ', align: 'right', cell: (l) => <span className={tableText.strong}>{formatQty(l.qty_open, l.unit)}</span> },
              {
                key: 'qty',
                header: 'Nhận lần này',
                cell: (l) => (
                  <TextField
                    label={`Lượng nhận ${l.food_name}`}
                    numeric
                    suffix={unitLabel(l.unit)}
                    value={rows[l.id].qty}
                    disabled={isZero(l.qty_open)}
                    onChange={(e) => setRows((p) => ({ ...p, [l.id]: { ...p[l.id], qty: e.target.value } }))}
                    error={errors[`${l.id}.qty`]}
                    placeholder="0"
                  />
                ),
              },
              {
                key: 'price',
                header: 'Đơn giá (đ)',
                cell: (l) => (
                  <TextField
                    label={`Đơn giá ${l.food_name}`}
                    numeric
                    value={rows[l.id].price}
                    disabled={isZero(l.qty_open)}
                    onChange={(e) => setRows((p) => ({ ...p, [l.id]: { ...p[l.id], price: e.target.value } }))}
                    error={errors[`${l.id}.price`]}
                  />
                ),
              },
            ]}
          />
          {errors.form ? (
            <Callout tone="danger" role="alert">
              {errors.form}
            </Callout>
          ) : null}
          <div className={s.formGrid}>
            <TextField label="Ngày nhận" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <TextareaField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={1} />
          </div>
          <span className={s.inlineGroup}>
            <Button write type="submit" busy={busy === 'draft'} disabled={busy !== null || Boolean(receipt)}>
              Tạo phiếu nhập nháp
            </Button>
          </span>
        </form>
      )}
    </Stack>
  );
}
