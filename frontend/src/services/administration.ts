/** Tài khoản và nhật ký (FE-02/03): khớp JSON của user_views.py và audit_views.py. Chỉ Hiệu trưởng gọi được. */
import type { Role } from '../auth/AuthContext';
import { api } from '../lib/http';

export type Account = {
  id: number;
  username: string;
  full_name: string;
  role: Role | null;
  is_active: boolean;
  is_superuser: boolean;
  last_login: string | null;
  date_joined: string;
};

export type AccountInput = { username: string; full_name: string; role: Role; password: string };

/** changes: {trường: [trước, sau]}; khoá nhạy cảm đã được backend thay bằng "***". */
export type AuditLog = {
  id: number;
  created_at: string;
  actor_id: number | null;
  actor_username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  changes: Record<string, unknown>;
  ip: string | null;
  user_agent: string;
};

export type AuditPage = { results: AuditLog[]; page: number; total_pages: number; total: number; actions: string[] };

/** Bộ lọc nhật ký: actor (tên đăng nhập), action, entity_type, from/to (YYYY-MM-DD, giờ VN), page. */
export type AuditFilters = Partial<Record<'actor' | 'action' | 'entity_type' | 'from' | 'to' | 'page', string>>;

export const administrationApi = {
  users: () => api.get<{ results: Account[] }>('/api/users/').then((r) => r.results),
  create: (body: AccountInput) => api.post<Account>('/api/users/', body),
  update: (id: number, body: Partial<Pick<Account, 'full_name' | 'role' | 'is_active'>>) =>
    api.patch<Account>(`/api/users/${id}/`, body),
  resetPassword: (id: number, password: string) =>
    api.post<{ message: string }>(`/api/users/${id}/reset-password/`, { password }),

  audit: (filters: AuditFilters) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    return api.get<AuditPage>(`/api/audit-logs/${qs.toString() ? `?${qs}` : ''}`);
  },
};
