/**
 * Số suất theo ngày (FE-08): khớp JSON của meal_views.py / lunch.py (SF46, BE-12).
 * null = chưa nhập (khác 0). Mỗi lớp 0 ≤ suất ≤ sĩ số chụp lúc mở ngày. Ghi kèm version; sai version → 409.
 */
import { api } from '../lib/http';

export type CountKind = 'planned' | 'actual';

export type CountLine = {
  class_id: number;
  class_code: string;
  class_name: string;
  enrolled_snapshot: number;
  planned: number | null;
  actual: number | null;
};

export type OpenMealDay = {
  id: number;
  date: string;
  status: 'open' | 'planned_confirmed' | 'actual_confirmed';
  version: number;
  staff_planned: number | null;
  staff_actual: number | null;
  planned_total: number | null;
  actual_total: number | null;
  planned_confirmed_at: string | null;
  actual_confirmed_at: string | null;
  lines: CountLine[];
};

export type MealDay = OpenMealDay | { date: string; status: 'not_open'; version: null; lines: [] };

export type CountsInput = {
  version: number;
  lines: { class_id: number; planned?: number | null; actual?: number | null }[];
  staff_planned?: number | null;
  staff_actual?: number | null;
};

/** Suất nhân viên tối đa (MAX_STAFF_MEALS ở backend). */
export const STAFF_MAX = 1000;

const base = (date: string) => `/api/lunch-days/${encodeURIComponent(date)}`;

export const mealsApi = {
  get: (date: string) => api.get<MealDay>(`${base(date)}/counts/`),
  open: (date: string) => api.post<OpenMealDay>(`${base(date)}/open/`),
  save: (date: string, body: CountsInput) => api.put<OpenMealDay>(`${base(date)}/counts/`, body),
  lock: (date: string, kind: CountKind, version: number) => api.post<OpenMealDay>(`${base(date)}/lock/`, { kind, version }),
  reopen: (date: string, kind: CountKind, version: number, reason: string) =>
    api.post<OpenMealDay>(`${base(date)}/reopen/`, { kind, version, reason }),
};
