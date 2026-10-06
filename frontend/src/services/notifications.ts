/**
 * Thư thực đơn cho phụ huynh (FE-07): khớp JSON của notification_views.py / notifications.py (BE-08).
 * mode = EMAIL_MODE của máy chủ: dry_run chỉ ghi nhật ký (không gửi thư thật), smtp gửi thật.
 */
import type { BadgeTone } from '../components/ui';
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

export const MAIL_STATUS: Record<MailStatus, { label: string; tone: BadgeTone }> = {
  sent: { label: 'Đã gửi', tone: 'done' },
  dry_run: { label: 'Chế độ thử', tone: 'review' },
  failed: { label: 'Lỗi', tone: 'danger' },
  skipped: { label: 'Bỏ qua', tone: 'neutral' },
  pending: { label: 'Đang chờ gửi', tone: 'warn' },
};

/** SF74: thư mẫu để xem trước khi bấm gửi (ảnh nhúng dạng data:, tên bé là chỗ trống). */
export type MailPreview = {
  date: string;
  mode: 'dry_run' | 'smtp' | string;
  /** Lý do không gửi được (ngày nghỉ, chưa có thực đơn); null = gửi được. */
  problem: string | null;
  recipients: number;
  /** Email dữ liệu mẫu (.invalid), không bao giờ gửi. */
  sample_recipients: number;
  already_sent: number;
  photos: number;
  subject: string;
  html: string;
};

export const notificationsApi = {
  preview: (date: string) => api.get<MailPreview>(`/api/notifications/preview/?date=${encodeURIComponent(date)}`),
  day: (date: string) => api.get<NotificationDay>(`/api/notifications/?date=${encodeURIComponent(date)}`),
  /** Quản lý bấm gửi. 202: xếp lịch, scheduler gửi phần còn thiếu trong khoảng 1 phút; ngày nghỉ/chưa có thực đơn → 409. */
  resend: (date: string) => api.post<{ message: string }>('/api/notifications/send/', { date }),
  /** Gửi thư thử tới email của tài khoản đang đăng nhập. */
  test: (date: string) => api.post<{ message: string }>('/api/notifications/test/', { date }),
  /** Công khai (trang /huy-nhan/:token): không cần đăng nhập/CSRF. */
  unsubscribe: (token: string) => api.post<{ message: string }>(`/api/unsubscribe/${encodeURIComponent(token)}/`),
};
