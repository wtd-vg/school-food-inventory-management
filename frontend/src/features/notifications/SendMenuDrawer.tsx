/**
 * SF74: Quản lý xem trước thư thực đơn (kèm ảnh suất ăn thực tế của ngày) rồi bấm gửi cho phụ huynh.
 * Thư không tự gửi lúc 06:30 nữa. Bấm gửi → 202, scheduler gửi trong khoảng 1 phút; mỗi email nhận một thư/ngày
 * (người đã nhận không nhận lần hai). Thư mẫu hiển thị trong iframe sandbox (không chạy script), ảnh dạng data:.
 */
import { useState } from 'react';
import { IconSend } from '../../components/icons';
import { Button, Callout, Drawer, Skeleton, Stack } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { notificationsApi } from '../../services/notifications';
import s from '../inventory/shared.module.css';
import styles from './SendMenuDrawer.module.css';

export function SendMenuDrawer({ date, onClose, onSent }: { date: string; onClose: () => void; onSent: (message: string) => void }) {
  const q = useApiQuery(() => notificationsApi.preview(date), [date]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [height, setHeight] = useState(640);
  const p = q.data;

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await notificationsApi.resend(date);
      onSent(res.message);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const remaining = p ? Math.max(p.recipients - p.already_sent, 0) : 0;
  return (
    <Drawer
      title="Gửi thư thực đơn cho phụ huynh"
      subtitle={`Bữa trưa ${formatDate(date)}`}
      width="700px"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Đóng
          </Button>
          <Button write icon={<IconSend size={18} />} busy={busy} disabled={!p || Boolean(p.problem) || remaining === 0} onClick={send}>
            {p && remaining ? `Gửi cho ${remaining} phụ huynh` : 'Gửi thư'}
          </Button>
        </>
      }
    >
      {q.loading ? (
        <Skeleton rows={6} label="Đang dựng thư xem trước" />
      ) : q.error ? (
        <Callout tone="danger" role="alert">
          {q.error}
        </Callout>
      ) : p ? (
        <Stack>
          {p.problem ? (
            <Callout tone="warn" title="Chưa gửi được">
              {p.problem}
            </Callout>
          ) : null}
          {p.mode === 'dry_run' ? (
            <Callout tone="info" title="Chế độ thử">
              Máy chủ đang ở EMAIL_MODE=dry_run: bấm gửi chỉ ghi nhật ký, phụ huynh không nhận thư thật.
            </Callout>
          ) : null}
          {error ? (
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          ) : null}
          {!p.problem ? (
            <ul className={styles.facts}>
              <li>
                <strong className="num">{p.recipients}</strong> email phụ huynh đã đồng ý nhận thư
                {p.already_sent ? ` (${p.already_sent} đã nhận thư ngày này, không gửi lại)` : ''}.
              </li>
              <li>
                {p.photos ? (
                  <>
                    Kèm <strong className="num">{p.photos}</strong> ảnh suất ăn thực tế.
                  </>
                ) : (
                  'Chưa có ảnh suất ăn: thư chỉ có thực đơn. Tải ảnh ở trang Hôm nay trước khi gửi nếu muốn kèm ảnh.'
                )}
              </li>
              {p.sample_recipients ? <li className={s.muted}>{p.sample_recipients} email dữ liệu mẫu (.invalid) được bỏ qua.</li> : null}
            </ul>
          ) : null}
          {p.html ? (
            <>
              <p className={s.muted}>
                Tiêu đề: <strong>{p.subject}</strong>
              </p>
              <iframe
                className={styles.preview}
                title="Thư xem trước"
                sandbox="allow-same-origin"
                srcDoc={p.html}
                style={{ height }}
                onLoad={(e) => {
                  const doc = e.currentTarget.contentDocument;
                  if (doc) setHeight(doc.documentElement.scrollHeight + 8);
                }}
              />
            </>
          ) : null}
        </Stack>
      ) : null}
    </Drawer>
  );
}
