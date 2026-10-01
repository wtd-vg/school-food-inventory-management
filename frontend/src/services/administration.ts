/** Tài khoản và nhật ký: user_views.py, audit_views.py. */
import type { Role } from '../auth/AuthContext';
import { api } from '../lib/http';

export type Account = { id: number; username: string; full_name: string; role: Role | null; is_active: boolean; is_superuser: boolean; last_login: string | null };
export type AccountInput = { username: string; full_name: string; role: Role; password: string };
export type AuditLog = { id: number; created_at: string; actor_id: number | null; actor_username: string; action: string; entity_type: string; entity_id: string; summary: string; changes: Record<string, unknown>; ip: string | null; user_agent: string };
export const administrationApi = {
  users: () => api.get<{ results: Account[] }>('/api/users/').then(r => r.results),
  create: (body: AccountInput) => api.post<Account>('/api/users/', body),
  update: (id: number, body: Partial<Pick<Account, 'full_name' | 'role' | 'is_active'>>) => api.patch<Account>(`/api/users/${id}/`, body),
  resetPassword: (id: number, password: string) => api.post<{ message: string }>(`/api/users/${id}/reset-password/`, { password }),
  audit: (params: URLSearchParams) => api.get<{ results: AuditLog[]; actions: string[]; page: number; total_pages: number; total: number }>(`/api/audit-logs/?${params}`),
};
