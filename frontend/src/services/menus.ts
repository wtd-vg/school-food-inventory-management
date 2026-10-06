/**
 * Thực đơn cố định T2–T6, Thứ Bảy tuỳ chọn (FE-04/05, SF79): khớp JSON của menu_views.py / menu_services.py (BE-07, BE-13).
 * Món trong thực đơn dùng dish_id/dish_name (khác danh sách món id/name). quantity là chuỗi 6 số lẻ.
 */
import { api } from '../lib/http';

export type DayStatus = 'menu' | 'weekend' | 'holiday';
/** snapshot = đã chụp cho ngày (không đổi nữa) · version = theo thực đơn cố định hiện hành · none = chưa lập. */
export type DaySource = 'snapshot' | 'version' | 'none' | null;

export type MenuComponent = { food_id: number; food_name: string; unit: string; quantity: string };
export type MenuDish = { dish_id: number; dish_name: string; components: MenuComponent[] };

export type MenuDay = {
  date: string;
  weekday: number;
  weekday_label: string;
  status: DayStatus;
  source: DaySource;
  menu_version_id: number | null;
  holiday_name: string | null;
  dishes: MenuDish[];
};

export type MenuWeek = { week_start: string; days: MenuDay[] };

export type MenuVersion = {
  id: number;
  effective_from: string;
  effective_to: string | null;
  note: string;
  created_by: string;
  created_at: string;
  is_current: boolean;
  is_editable: boolean;
  /** "0" (Thứ Hai) … "4" (Thứ Sáu) luôn có; "5" (Thứ Bảy) chỉ có khi phiên bản có bữa trưa Thứ Bảy (SF79). */
  days: Record<string, { dish_id: number; dish_name: string }[]>;
};

export type Holiday = { id: number; date: string; name: string; is_editable: boolean };

/** Các thứ bắt buộc có thực đơn. */
export const WEEKDAY_LABELS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu'];
/** SF79: Thứ Bảy là ngày ăn khi phiên bản thực đơn có món Thứ Bảy; Chủ nhật luôn nghỉ. */
export const SATURDAY = 5;
export const SATURDAY_LABEL = 'Thứ Bảy';

/** Ngày học trong tuần để hiện ở lưới thực đơn: T2–T6, cộng Thứ Bảy khi Thứ Bảy đó có bữa trưa (kể cả nghỉ lễ). */
export function isSchoolDay(d: Pick<MenuDay, 'weekday' | 'status'>): boolean {
  return d.weekday < SATURDAY || (d.weekday === SATURDAY && d.status !== 'weekend');
}

export function hasSaturday(v: Pick<MenuVersion, 'days'> | null | undefined): boolean {
  return Boolean(v?.days[String(SATURDAY)]?.length);
}

export const menusApi = {
  week: (date: string) => api.get<MenuWeek>(`/api/menu/week/?date=${encodeURIComponent(date)}`),
  today: () => api.get<MenuDay>('/api/menu/today/'),
  versions: () => api.get<{ results: MenuVersion[] }>('/api/menu/versions/').then((r) => r.results),
  createVersion: (body: { effective_from: string; note: string; days: Record<string, number[]> }) =>
    api.post<MenuVersion>('/api/menu/versions/', body),
  deleteVersion: (id: number) => api.delete<{ message: string }>(`/api/menu/versions/${id}/`),
  holidays: (year?: number) => api.get<{ results: Holiday[] }>(`/api/holidays/${year ? `?year=${year}` : ''}`).then((r) => r.results),
  addHoliday: (body: { date: string; name: string }) => api.post<Holiday>('/api/holidays/', body),
  deleteHoliday: (id: number) => api.delete<{ message: string }>(`/api/holidays/${id}/`),
};

/** Cộng/trừ ngày trên chuỗi YYYY-MM-DD (tính theo UTC, không lệch múi giờ). */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
