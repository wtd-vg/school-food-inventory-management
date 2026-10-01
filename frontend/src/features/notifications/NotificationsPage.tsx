/**
 * FE-07 /lop-hoc/thu-thuc-don: nhật ký thư thực đơn gửi phụ huynh lúc 06:30 (notification_views.py, BE-08).
 * - ?ngay=YYYY-MM-DD (mặc định hôm nay). Email luôn ở dạng che; không có email đầy đủ trên màn này.
 * - "Gửi lại phần còn thiếu" → 202, scheduler gửi trong khoảng 1 phút (chỉ thư chưa gửi/lỗi).
 * - "Gửi thử tới email của tôi" → thư thử tới email của tài khoản đang đăng nhập, không ghi nhật ký.
 * - Máy chủ ở EMAIL_MODE=dry_run thì hiện nhãn "Chế độ thử": chỉ ghi nhật ký, không gửi thư thật.
 */
import { useState } from 'react';
import { IconRefresh, IconSend } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  KeyValueList,
  PageHeader,
  Skeleton,
  Stack,
  TextField,
  Toolbar,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { formatDate, formatDateTime, todayISO } from '../../lib/format';
import { messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { MAIL_STATUS, notificationsApi, type NotificationRow } from '../../services/notifications';
import { ClassTabs } from '../common/FeatureLayouts';
import { useQueryParam } from '../inventory/shared';
import s from '../inventory/shared.module.css';

export function NotificationsPage() {
  const today = todayISO();
  const [date, setDate] = useQueryParam('ngay', today);
  const q = useApiQuery(() => notificationsApi.day(date), [date]);
  const [confirmResend, setConfirmResend] = useState(false);
  const [busy, setBusy] = useState<'resend' | 'test' | null>(null);
  const [actionError, setActionError] = useState('');
  const toast = useToast();
  const isFuture = date > today;

  const resend = async () => {
    setBusy('resend');
    setActionError('');
    try {
      const res = await notificationsApi.resend(date);
      toast.show(res.message);
      setConfirmResend(false);
      q.reload();
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy('test');
    setActionError('');
    try {
      const res = await notificationsApi.test(date);
      toast.show(res.message);
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setBusy(null);
    }
  };

  const data = q.data;
  const counts = (data?.results ?? []).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const columns: Column<NotificationRow>[] = [
    { key: 'email', header: 'Email (đã che)', cell: (r) => <span className={tableText.strong}>{r.email_hint}</span> },
    { key: 'kids', header: 'Số bé', align: 'right', cell: (r) => r.student_count },
    { key: 'status', header: 'Trạng thái', cell: (r) => <Badge tone={MAIL_STATUS[r.status]?.tone ?? 'neutral'}>{MAIL_STATUS[r.status]?.label ?? r.status}</Badge> },
    { key: 'attempts', header: 'Lần gửi', align: 'right', cell: (r) => r.attempts },
    { key: 'error', header: 'Lỗi', wrap: true, cell: (r) => (r.error ? r.error : <span className={tableText.muted}>—</span>) },
    { key: 'time', header: 'Cập nhật', cell: (r) => <span className={tableText.muted}>{formatDateTime(r.updated_at)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Thư thực đơn"
        description="Mỗi ngày học lúc 06:30, mỗi email phụ huynh nhận một thư thực đơn hôm nay (gộp các bé)."
        actions={
          <>
            <Button write variant="secondary" icon={<IconSend size={18} />} busy={busy === 'test'} disabled={isFuture || busy !== null} onClick={sendTest}>
              Gửi thử tới email của tôi
            </Button>
            <Button
              write
              icon={<IconRefresh size={18} />}
              disabled={isFuture || busy !== null}
              onClick={() => {
                setActionError('');
                setConfirmResend(true);
              }}
            >
              Gửi lại phần còn thiếu
            </Button>
          </>
        }
      />
      <ClassTabs />
      <Stack gap="lg">
        <Toolbar>
          <TextField label="Ngày" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value || today)} />
        </Toolbar>

        {data?.mode === 'dry_run' ? (
          <Callout tone="info" title="Chế độ thử">
            Máy chủ đang ở chế độ thử (EMAIL_MODE=dry_run): hệ thống chỉ ghi nhật ký, không gửi thư thật cho phụ huynh.
          </Callout>
        ) : null}
        {actionError && !confirmResend ? (
          <Callout tone="danger" role="alert">
            {actionError}
          </Callout>
        ) : null}

        {q.loading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState message={q.error} onRetry={q.reload} />
        ) : data ? (
          <>
            <KeyValueList
              items={[
                { label: 'Ngày', value: formatDate(data.date) },
                {
                  label: 'Kết quả chung',
                  value: data.summary ? (
                    <Badge tone={MAIL_STATUS[data.summary.status]?.tone ?? 'neutral'}>{MAIL_STATUS[data.summary.status]?.label ?? data.summary.status}</Badge>
                  ) : (
                    'Chưa chạy'
                  ),
                },
                { label: 'Số email', value: data.summary ? data.summary.recipients : '—' },
                {
                  label: 'Chi tiết',
                  value: Object.keys(counts).length
                    ? Object.entries(counts)
                        .map(([st, n]) => `${MAIL_STATUS[st as keyof typeof MAIL_STATUS]?.label ?? st}: ${n}`)
                        .join(' · ')
                    : '—',
                },
                { label: 'Ghi chú', value: data.summary?.note || '—' },
                { label: 'Cập nhật lúc', value: data.summary ? formatDateTime(data.summary.updated_at) : '—' },
              ]}
            />
            {data.results.length ? (
              <DataTable caption={`Thư thực đơn ngày ${formatDate(data.date)}`} rows={data.results} rowKey={(r) => r.id} columns={columns} minWidth="720px" />
            ) : (
              <EmptyState title={data.summary ? 'Không có thư nào trong ngày này' : 'Chưa gửi thư cho ngày này'}>
                {data.summary?.status === 'skipped'
                  ? 'Ngày nghỉ hoặc chưa có thực đơn nên không gửi.'
                  : 'Thư tự gửi lúc 06:30 các ngày học cho phụ huynh đã đồng ý và chưa huỷ nhận.'}
              </EmptyState>
            )}
          </>
        ) : null}
        <p className={s.muted}>Phụ huynh huỷ nhận bằng liên kết trong thư; email đã huỷ không được gửi nữa.</p>
      </Stack>

      {confirmResend ? (
        <ConfirmDialog
          title={`Gửi lại thư ngày ${formatDate(date)}?`}
          confirmLabel="Xếp lịch gửi lại"
          busy={busy === 'resend'}
          onCancel={() => setConfirmResend(false)}
          onConfirm={resend}
        >
          <p>Hệ thống chỉ gửi thư còn thiếu hoặc bị lỗi; email đã nhận thư ngày này không nhận lần hai. Việc gửi diễn ra trong khoảng 1 phút.</p>
          {actionError ? (
            <Callout tone="danger" role="alert">
              {actionError}
            </Callout>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
