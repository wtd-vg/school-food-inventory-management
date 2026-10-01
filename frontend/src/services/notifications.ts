/**
 * Thư thực đơn cho phụ huynh (FE-07): khớp JSON của notification_views.py / notifications.py (BE-08).
 * mode = EMAIL_MODE của máy chủ: dry_run chỉ ghi nhật ký (không gửi thư thật), smtp gửi thật.
 */
import { api } from '../lib/http';

export type MailStatus = 'sent' | 'dry_run' | 'failed' | 'skipped' | 'pending';

export type NotificationRow = {
  id: number;
  email_hint: string;
  student_count: number;
  status: MailStatus;
  error: string;
  attempts: number;
  updated_at: string;
};

export type NotificationDay = {
  date: string;
  mode: 'dry_run' | 'smtp' | string;
  /** Dòng tổng của ngày; null = chưa chạy. recipients = số email được gửi. */
  summary: { status: MailStatus; recipients: number; note: string; updated_at: string } | null;
  results: NotificationRow[];
};

export const MAIL_STATUS: Record<MailStatus, { label: string; tone: 'ok' | 'info' | 'danger' | 'warn' | 'neutral' }> = {
  sent: { label: 'Đã gửi', tone: 'ok' },
  dry_run: { label: 'Chế độ thử', tone: 'info' },
  failed: { label: 'Lỗi', tone: 'danger' },
  skipped: { label: 'Bỏ qua', tone: 'neutral' },
  pending: { label: 'Đang chờ gửi', tone: 'warn' },
};

export const notificationsApi = {
  day: (date: string) => api.get<NotificationDay>(`/api/notifications/?date=${encodeURIComponent(date)}`),
  /** 202: xếp lịch, scheduler gửi phần còn thiếu trong khoảng 1 phút. */
  resend: (date: string) => api.post<{ message: string }>('/api/notifications/send/', { date }),
  /** Gửi thư thử tới email của tài khoản đang đăng nhập. */
  test: (date: string) => api.post<{ message: string }>('/api/notifications/test/', { date }),
  /** Công khai (trang /huy-nhan/:token): không cần đăng nhập/CSRF. */
  unsubscribe: (token: string) => api.post<{ message: string }>(`/api/unsubscribe/${encodeURIComponent(token)}/`),
};
