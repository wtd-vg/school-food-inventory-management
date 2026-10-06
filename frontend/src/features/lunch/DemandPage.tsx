/**
 * SF57/59 /bua-trua/nhu-cau?ngay=: nhu cầu nguyên liệu và đề xuất mua của một ngày ăn (demand_views.py).
 * - "Tính nhu cầu": số suất dự kiến đã chốt × định lượng thực đơn ngày đó (+ dự phòng có lý do) → bản tính nháp.
 * - "Duyệt & giữ hàng": chia cần dùng thành lấy từ tồn / hàng đang chờ về / phải mua; giữ phần đó cho ngày ăn.
 *   Số suất đổi sau khi tính → 409, bản tính thành lỗi thời; màn tải lại và nhắc tính lại.
 * - is_outdated: bản đang dùng không còn khớp số suất/thực đơn. shortages: tồn ít hơn phần đã giữ (kiểm kê thiếu).
 * - SF78 "Đặt hàng" (OrderFromDemand): sau khi duyệt mà còn phần phải mua → chọn NCC + ngày giao, tạo đơn nháp rồi mở ở màn Đơn đặt.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { IconCheck, IconRefresh } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  KeyValueList,
  PageHeader,
  SectionTitle,
  Skeleton,
  Stack,
  TextField,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { normalizeDecimalInput } from '../../lib/decimal';
import { formatDate, formatDateTime, formatNumber, formatQty, unitLabel } from '../../lib/format';
import { ApiError, fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { QTY_RULE } from '../../services/inventory';
import { lunchApi, REVISION_STATUS, type DemandLine, type DemandRevision, type ReserveInput } from '../../services/lunch';
import { LunchTabs } from '../common/FeatureLayouts';
import { useQueryParam, useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import { OrderFromDemand } from './OrderFromDemand';
import { DayPicker, isZero, useLunchDate } from './shared';

export function DemandPage() {
  const [date, setDate] = useLunchDate();
  const [reserving] = useQueryParam('du-phong');
  const updateParams = useUpdateParams();
  const q = useApiQuery(() => lunchApi.demand(date), [date]);
  const [busy, setBusy] = useState<'calc' | 'approve' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'danger' | 'warn'; text: string } | null>(null);
  // Sau khi tính, chờ màn tải xong bản mới rồi mới cho duyệt (tránh duyệt nhầm bản cũ đang hiển thị → 409).
  const [awaitingId, setAwaitingId] = useState<number | null>(null);
  const toast = useToast();

  const data = q.data;
  const current = data?.current ?? null;
  const refreshing = awaitingId !== null && current?.id !== awaitingId && !q.error;
  useEffect(() => setAwaitingId(null), [date]);
  const approved = current?.status === 'approved' ? current : null;
  const needsBuying = approved ? approved.lines.some((l) => !isZero(l.to_buy_qty)) : false;

  const calculate = async (reserves: ReserveInput[]) => {
    setBusy('calc');
    setNotice(null);
    try {
      const r = await lunchApi.calculate(date, reserves);
      setAwaitingId(r.id);
      toast.show(`Đã tính nhu cầu (bản ${r.revision}, ${formatNumber(r.servings, 0)} suất).`);
      updateParams({ 'du-phong': null });
      q.reload();
      return true;
    } catch (err) {
      setNotice({ tone: 'danger', text: messageOf(err) });
      return err;
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!current) return;
    setBusy('approve');
    setNotice(null);
    try {
      await lunchApi.approve(current.id);
      toast.show('Đã duyệt đề xuất và giữ hàng cho ngày ăn.');
    } catch (err) {
      setNotice({
        tone: err instanceof ApiError && err.status === 409 ? 'warn' : 'danger',
        text: err instanceof ApiError && err.status === 409 ? `${err.message} Đã tải lại.` : messageOf(err),
      });
    } finally {
      setBusy(null);
      q.reload();
    }
  };

  const lineColumns: Column<DemandLine>[] = [
    { key: 'food', header: 'Nguyên liệu', width: '20%', cell: (l) => <span className={tableText.strong}>{l.food_name}</span> },
    { key: 'required', header: 'Cần dùng', align: 'right', cell: (l) => formatQty(l.required_qty, l.unit) },
    {
      key: 'reserve',
      header: 'Dự phòng',
      align: 'right',
      width: '22%',
      cell: (l) =>
        isZero(l.reserve_qty) ? (
          <span className={tableText.muted}>—</span>
        ) : (
          <span title={l.reserve_reason}>
            {formatQty(l.reserve_qty, l.unit)}
            <span className={tableText.secondaryText}>{l.reserve_reason}</span>
          </span>
        ),
    },
    ...(approved
      ? [
          { key: 'stock', header: 'Lấy từ tồn', align: 'right' as const, cell: (l: DemandLine) => formatQty(l.from_stock_qty, l.unit) },
          { key: 'pending', header: 'Hàng chờ về', align: 'right' as const, cell: (l: DemandLine) => formatQty(l.from_pending_qty, l.unit) },
          {
            key: 'buy',
            header: 'Phải mua',
            align: 'right' as const,
            cell: (l: DemandLine) =>
              isZero(l.to_buy_qty) ? (
                <span className={tableText.muted}>{formatQty(l.to_buy_qty, l.unit)}</span>
              ) : (
                <span className={tableText.strong}>{formatQty(l.to_buy_qty, l.unit)}</span>
              ),
          },
        ]
      : [
          { key: 'stockNow', header: 'Tồn giữ được', align: 'right' as const, cell: (l: DemandLine) => formatQty(l.allocatable_now, l.unit) },
          { key: 'pendingNow', header: 'Đang chờ về', align: 'right' as const, cell: (l: DemandLine) => formatQty(l.pending_now, l.unit) },
        ]),
  ];

  return (
    <>
      <PageHeader
        title="Nhu cầu & đề xuất"
        description="Tính nguyên liệu cần cho ngày ăn từ số suất dự kiến đã chốt và thực đơn; duyệt để giữ hàng và biết phải mua bao nhiêu."
        actions={
          <>
            <Button
              write
              variant="secondary"
              icon={<IconRefresh size={18} />}
              busy={busy === 'calc'}
              disabled={busy !== null || refreshing || data?.status !== 'planned_confirmed'}
              onClick={() => (current ? updateParams({ 'du-phong': '1' }) : void calculate([]))}
            >
              {current ? 'Tính lại' : 'Tính nhu cầu'}
            </Button>
            {current?.status === 'draft' ? (
              <Button write icon={<IconCheck size={18} />} busy={busy === 'approve' || refreshing} disabled={busy !== null || refreshing} onClick={approve}>
                Duyệt & giữ hàng
              </Button>
            ) : null}
          </>
        }
      />
      <LunchTabs date={date} />
      <Stack gap="lg">
        <DayPicker date={date} onChange={setDate} />
        {notice ? (
          <Callout tone={notice.tone} role="alert">
            {notice.text}
          </Callout>
        ) : null}

        {q.loading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState message={q.error} onRetry={q.reload} />
        ) : !data ? null : (
          <>
            {data.status !== 'planned_confirmed' ? (
              <Callout tone="warn" title={data.status === 'not_open' ? 'Ngày chưa mở' : 'Chưa chốt số suất dự kiến'}>
                Nhu cầu chỉ tính được khi đã chốt số suất dự kiến của ngày.{' '}
                <Link to={`/lop-hoc/so-suat?ngay=${date}`}>Mở màn Số suất</Link>
              </Callout>
            ) : null}
            {data.is_outdated ? (
              <Callout tone="warn" role="status" title="Bản tính đã lỗi thời">
                Số suất hoặc thực đơn của ngày đã đổi sau khi tính. Bấm "Tính lại" rồi duyệt bản mới; phần giữ hàng cũ vẫn giữ tới khi duyệt bản mới.
              </Callout>
            ) : null}
            {data.shortages.length ? (
              <Callout tone="danger" role="status" title="Tồn kho ít hơn phần đã giữ">
                {data.shortages
                  .map((x) => `${x.food_name}: còn ${formatQty(x.quantity, x.unit)}, đang giữ ${formatQty(x.reserved, x.unit)}`)
                  .join(' · ')}
                . Thường do kiểm kê thiếu; cần mua bù hoặc tính lại nhu cầu.
              </Callout>
            ) : null}

            {approved && needsBuying && !approved.has_purchase_order ? <OrderFromDemand revision={approved} date={date} /> : null}

            {current ? (
              <>
                <KeyValueList
                  items={[
                    {
                      label: 'Bản tính',
                      value: (
                        <span className={s.inlineGroup}>
                          Bản {current.revision}
                          <Badge tone={REVISION_STATUS[current.status].tone}>{REVISION_STATUS[current.status].label}</Badge>
                        </span>
                      ),
                    },
                    { label: 'Số suất dự kiến', value: formatNumber(current.servings, 0) },
                    { label: 'Thực đơn', value: current.menu_items.map((m) => m.dish_name).join(', ') || '—' },
                    {
                      label: 'Người tính',
                      value: `${current.created_by} · ${formatDateTime(current.created_at)}${current.approved_at ? ` · duyệt ${formatDateTime(current.approved_at)}` : ''}`,
                    },
                  ]}
                />
                {current.status === 'draft' ? (
                  <p className={s.muted}>
                    Bản tính chưa duyệt chưa giữ hàng. "Tồn giữ được" và "Đang chờ về" là số ước tính lúc này; khi duyệt, hệ thống chia lại và
                    giữ hàng.
                  </p>
                ) : null}
                <DataTable caption={`Nhu cầu ngày ${formatDate(date)}`} rows={current.lines} rowKey={(l) => l.id} columns={lineColumns} minWidth="720px" />
                {approved ? (
                  needsBuying ? (
                    approved.has_purchase_order ? (
                      <Callout tone="ok" role="status" action={<Link to="/bua-trua/don-dat">Xem đơn đặt</Link>}>
                        Đề xuất này đã có đơn đặt cho phần phải mua.
                      </Callout>
                    ) : (
                      <Callout tone="info" role="status" title="Cần mua thêm">
                        Chọn nhà cung cấp ở khung "Đặt hàng" phía trên để tạo đơn nháp gồm mọi dòng "Phải mua".
                      </Callout>
                    )
                  ) : (
                    <Callout tone="ok" role="status">
                      Tồn và hàng đang chờ về đã đủ, không cần mua thêm.
                    </Callout>
                  )
                ) : null}
              </>
            ) : data.status === 'planned_confirmed' ? (
              <EmptyState
                title="Chưa tính nhu cầu cho ngày này"
                action={
                  <Button write busy={busy === 'calc'} onClick={() => void calculate([])}>
                    Tính nhu cầu
                  </Button>
                }
              >
                Có thể thêm dự phòng (kèm lý do) khi tính lại.
              </EmptyState>
            ) : null}

            {data.revisions.length ? (
              <>
                <SectionTitle>Lịch sử bản tính</SectionTitle>
                <DataTable
                  caption="Lịch sử bản tính nhu cầu"
                  rows={data.revisions}
                  rowKey={(r) => r.id}
                  columns={[
                    { key: 'no', header: 'Bản', cell: (r) => <span className={tableText.strong}>Bản {r.revision}</span> },
                    { key: 'status', header: 'Trạng thái', cell: (r) => <Badge tone={REVISION_STATUS[r.status].tone}>{REVISION_STATUS[r.status].label}</Badge> },
                    { key: 'reason', header: 'Ghi chú', wrap: true, cell: (r) => r.stale_reason || '—' },
                    { key: 'at', header: 'Lúc tính', cell: (r) => <span className={tableText.muted}>{formatDateTime(r.created_at)}</span> },
                  ]}
                />
              </>
            ) : null}
          </>
        )}
      </Stack>

      {reserving && current ? (
        <ReserveDrawer
          revision={current}
          onClose={() => updateParams({ 'du-phong': null })}
          onSubmit={calculate}
          busy={busy === 'calc'}
        />
      ) : null}
    </>
  );
}

/** Tính lại kèm dự phòng: mỗi nguyên liệu một ô lượng (đơn vị kho) + lý do bắt buộc khi > 0. */
function ReserveDrawer({
  revision,
  onClose,
  onSubmit,
  busy,
}: {
  revision: DemandRevision;
  onClose: () => void;
  onSubmit: (reserves: ReserveInput[]) => Promise<true | unknown>;
  busy: boolean;
}) {
  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      revision.lines.map((l) => [l.food_id, { qty: isZero(l.reserve_qty) ? '' : l.reserve_qty, reason: l.reserve_reason }]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const reserves: ReserveInput[] = [];
    for (const l of revision.lines) {
      const row = rows[l.food_id];
      if (!row.qty.trim()) continue;
      const q = normalizeDecimalInput(row.qty, { ...QTY_RULE, positive: false, label: 'Dự phòng' });
      if (!q.ok) {
        next[`${l.food_id}.qty`] = q.error;
        continue;
      }
      if (!isZero(q.value) && !row.reason.trim()) next[`${l.food_id}.reason`] = 'Ghi lý do dự phòng.';
      reserves.push({ food_id: l.food_id, qty: q.value, reason: row.reason.trim() });
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    const result = await onSubmit(reserves);
    if (result !== true) {
      const fields = fieldsOf(result);
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        const m = /^reserves\[(\d+)\]\.(qty|reason|food_id)$/.exec(k);
        if (m && reserves[Number(m[1])]) mapped[`${reserves[Number(m[1])].food_id}.${m[2] === 'food_id' ? 'qty' : m[2]}`] = v;
      }
      setErrors(mapped);
    }
  };

  return (
    <Drawer
      title="Tính lại nhu cầu"
      subtitle={`Số suất dự kiến đã chốt hiện tại × thực đơn ngày. Dự phòng tính theo đơn vị kho, lý do bắt buộc.`}
      onClose={busy ? () => undefined : onClose}
      width="560px"
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button write type="submit" form="reserve-form" busy={busy}>
            Tính lại
          </Button>
        </>
      }
    >
      <form id="reserve-form" className={s.form} onSubmit={submit} noValidate>
        {revision.lines.map((l) => (
          <fieldset key={l.food_id} className={s.line}>
            <legend className={s.subhead}>
              {l.food_name} <span className={s.muted}>· cần {formatQty(l.required_qty, l.unit)}</span>
            </legend>
            <div className={s.lineGrid2}>
              <TextField
                label="Lý do dự phòng"
                value={rows[l.food_id].reason}
                maxLength={255}
                onChange={(e) => setRows((p) => ({ ...p, [l.food_id]: { ...p[l.food_id], reason: e.target.value } }))}
                error={errors[`${l.food_id}.reason`]}
                placeholder="Ví dụ: hao hụt khi sơ chế"
              />
              <TextField
                label="Lượng dự phòng"
                numeric
                suffix={unitLabel(l.unit)}
                value={rows[l.food_id].qty}
                onChange={(e) => setRows((p) => ({ ...p, [l.food_id]: { ...p[l.food_id], qty: e.target.value } }))}
                error={errors[`${l.food_id}.qty`]}
                placeholder="0"
              />
            </div>
          </fieldset>
        ))}
      </form>
    </Drawer>
  );
}
