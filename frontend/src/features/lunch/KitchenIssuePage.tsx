/**
 * Xuất bếp theo ngày (SF67/68) /bua-trua/xuat-bep?ngay=: phiếu xuất cho bếp gắn ngày ăn.
 * "Tạo phiếu xuất theo nhu cầu còn thiếu" (POST /api/lunch-days/<d>/issue/) = cần dùng + dự phòng − đã xuất,
 * theo đề xuất đã duyệt → phiếu NHÁP; "Chốt phiếu xuất" trừ tồn và đánh dấu phần đã giữ là đã dùng.
 * Phiếu xuất thường (màn Kho) không lấy được phần đã giữ cho ngày ăn. Ngày đã đóng → không tạo phiếu (409).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconArrowOut, IconCheck } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionTitle,
  Skeleton,
  Stack,
  tableText,
  useToast,
} from '../../components/ui';
import { formatDate, formatDateTime, formatMoney, formatQty } from '../../lib/format';
import { ApiError, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi } from '../../services/inventory';
import { lunchApi } from '../../services/lunch';
import { LunchTabs } from '../common/FeatureLayouts';
import { DocStatusBadge } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import { DayPicker, isZero, useLunchDate } from './shared';

export function KitchenIssuePage() {
  const [date, setDate] = useLunchDate();
  const cost = useApiQuery(() => lunchApi.cost(date), [date]);
  const issues = useApiQuery(() => inventoryApi.issues(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'danger' | 'warn'; text: string } | null>(null);
  const toast = useToast();

  const dayIssues = (issues.data ?? []).filter((i) => i.lunch_date === date);
  const draft = dayIssues.find((i) => i.status === 'DRAFT');
  const reload = () => {
    cost.reload();
    issues.reload();
  };

  const create = async () => {
    setBusy('create');
    setNotice(null);
    try {
      const issue = await lunchApi.createDayIssue(date);
      toast.show(`Đã tạo phiếu xuất nháp ${issue.code}.`);
    } catch (err) {
      setNotice({ tone: err instanceof ApiError && err.status === 409 ? 'warn' : 'danger', text: messageOf(err) });
    } finally {
      setBusy(null);
      reload();
    }
  };

  const post = async (id: number, code: string) => {
    setBusy(`post-${id}`);
    setNotice(null);
    try {
      await inventoryApi.postIssue(id);
      toast.show(`Đã chốt phiếu xuất ${code}.`);
    } catch (err) {
      setNotice({ tone: err instanceof ApiError && err.status === 409 ? 'warn' : 'danger', text: messageOf(err) });
    } finally {
      setBusy(null);
      reload();
    }
  };

  const closed = cost.data?.closed ?? false;
  const remaining = (cost.data?.foods ?? []).some((f) => !isZero(f.required) && f.variance.startsWith('-'));

  return (
    <>
      <PageHeader
        title="Xuất bếp"
        actions={
          <Button write icon={<IconArrowOut size={18} />} busy={busy === 'create'} disabled={busy !== null || closed || Boolean(draft)} onClick={create}>
            Tạo phiếu xuất theo nhu cầu còn thiếu
          </Button>
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
        {closed ? (
          <Callout tone="info" role="status">
            Ngày ăn đã đóng, không xuất thêm. Mở lại ngày ở tab Hôm nay nếu cần.
          </Callout>
        ) : null}

        {cost.loading || issues.loading ? (
          <Skeleton />
        ) : cost.error ? (
          <EmptyState title={cost.error} action={<Link to={`/lop-hoc/so-suat?ngay=${date}`}>Mở màn Số suất</Link>} />
        ) : issues.error ? (
          <ErrorState message={issues.error} onRetry={issues.reload} />
        ) : cost.data ? (
          <>
            {!cost.data.foods.length ? (
              <EmptyState title="Chưa có đề xuất đã duyệt cho ngày này" action={<Link to={`/bua-trua/nhu-cau?ngay=${date}`}>Mở Nhu cầu & đề xuất</Link>} />
            ) : (
              <DataTable
                caption={`Cần và đã xuất ngày ${formatDate(date)}`}
                rows={cost.data.foods}
                rowKey={(f) => f.food_id}
                columns={[
                  { key: 'food', header: 'Nguyên liệu', wrap: true, cell: (f) => <span className={tableText.strong}>{f.food_name}</span> },
                  { key: 'required', header: 'Cần dùng', align: 'right', cell: (f) => formatQty(f.required, f.unit) },
                  { key: 'issued', header: 'Đã xuất', align: 'right', cell: (f) => formatQty(f.issued, f.unit) },
                  {
                    key: 'variance',
                    header: 'Chênh lệch',
                    align: 'right',
                    cell: (f) =>
                      isZero(f.variance) ? (
                        <span className={tableText.muted}>0</span>
                      ) : f.variance.startsWith('-') ? (
                        <Badge tone="warn">Thiếu {formatQty(f.variance.slice(1), f.unit)}</Badge>
                      ) : (
                        <Badge tone="info">Dư {formatQty(f.variance, f.unit)}</Badge>
                      ),
                  },
                ]}
              />
            )}

            <SectionTitle>Phiếu xuất của ngày</SectionTitle>
            {!dayIssues.length ? (
              <EmptyState title="Chưa có phiếu xuất cho ngày này" />
            ) : (
              <ul className={s.lineList}>
                {dayIssues.map((iss) => (
                  <li key={iss.id} className={s.line}>
                    <div className={s.lineHead}>
                      <span className={s.subhead}>
                        {iss.code} · {formatDate(iss.date)}
                      </span>
                      <DocStatusBadge status={iss.status} />
                    </div>
                    <ul className={s.docLines}>
                      {iss.lines.map((l) => (
                        <li key={l.id} className={s.docLine}>
                          <span className={s.docLineName}>{l.food_name ?? `#${l.food_id}`}</span>
                          <span className={s.docLineValue}>
                            {formatQty(l.quantity)}
                            {iss.status === 'POSTED' ? ` · ${formatMoney(l.line_total)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {iss.status === 'DRAFT' ? (
                      <span className={s.inlineGroup}>
                        <Button write icon={<IconCheck size={18} />} busy={busy === `post-${iss.id}`} disabled={busy !== null} onClick={() => post(iss.id, iss.code)}>
                          Chốt phiếu xuất
                        </Button>
                        <span className={s.muted}>Nháp chưa trừ tồn.</span>
                      </span>
                    ) : (
                      <p className={s.lineTotal}>
                        Giá trị xuất {formatMoney(iss.total_value)} · chốt {formatDateTime(iss.posted_at)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </Stack>
    </>
  );
}
