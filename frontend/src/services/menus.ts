/** Thực đơn trả dish_id/dish_name, khác danh sách món id/name. */
import { api } from '../lib/http';
export type MenuDay = { date: string; weekday: number; weekday_label: string; status: 'menu' | 'weekend' | 'holiday'; source: 'snapshot' | 'version' | 'none' | null; holiday_name: string | null; dishes: { dish_id: number; dish_name: string; components: { food_id: number; food_name: string; unit: string; quantity: string }[] }[] };
export type MenuVersion = { id: number; effective_from: string; effective_to: string | null; note: string; created_by: string; created_at: string; is_current: boolean; is_editable: boolean; days: Record<string, { dish_id: number; dish_name: string }[]> };
export type Holiday = { id: number; date: string; name: string; is_editable: boolean };
export const menusApi = {
  week: (date: string) => api.get<{ week_start: string; days: MenuDay[] }>(`/api/menu/week/?date=${encodeURIComponent(date)}`),
  versions: () => api.get<{ results: MenuVersion[] }>('/api/menu/versions/').then(r => r.results),
  create: (body: { effective_from: string; note: string; days: Record<string, number[]> }) => api.post<MenuVersion>('/api/menu/versions/', body),
  deleteVersion: (id: number) => api.delete(`/api/menu/versions/${id}/`),
  holidays: () => api.get<{ results: Holiday[] }>('/api/holidays/').then(r => r.results),
  addHoliday: (body: { date: string; name: string }) => api.post<Holiday>('/api/holidays/', body),
  deleteHoliday: (id: number) => api.delete(`/api/holidays/${id}/`),
};
