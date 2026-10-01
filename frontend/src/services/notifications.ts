import { api } from '../lib/http';
export type MailStatus = 'sent' | 'dry_run' | 'failed' | 'skipped' | 'pending';
export type NotificationDay = { date: string; mode: string; summary: { status: MailStatus; recipients: number; note: string; updated_at: string } | null; results: { id: number; email_hint: string; student_count: number; status: MailStatus; error: string; attempts: number; updated_at: string }[] };
export const notificationsApi = {
  list: (date: string) => api.get<NotificationDay>(`/api/notifications/?date=${encodeURIComponent(date)}`),
  send: (date: string) => api.post<{ message: string }>('/api/notifications/send/', { date }),
  test: (date: string) => api.post<{ message: string }>('/api/notifications/test/', { date }),
  unsubscribe: (token: string) => api.post<{ message: string }>(`/api/unsubscribe/${encodeURIComponent(token)}/`),
};
