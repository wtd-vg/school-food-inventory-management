/**
 * Chuỗi bữa trưa G2 (SF55–SF72): khớp JSON của demand_views.py, purchase_views.py, day_views.py và views.py
 * (phiếu nhập/xuất). Contract: outputs/team-6/contracts/G2_SF55_SF72_nhu_cau_dat_hang_xuat_ngay.md §4.
 * Mọi số lượng/tiền là chuỗi Decimal; thao tác đổi trạng thái đơn gửi kèm version (sai → 409).
 */
import { api } from '../lib/http';
import type { Issue, Receipt } from './inventory';

/* ---------- Nhu cầu & đề xuất (SF57/59) ---------- */
export type RevisionStatus = 'draft' | 'approved' | 'stale';

export type DemandLine = {
  id: number;
  food_id: number;
  food_name: string;
  unit: string;
  required_qty: string;
  reserve_qty: string;
  reserve_reason: string;
  /** Ghi khi duyệt; bản nháp là 0. */
  from_stock_qty: string;
  from_pending_qty: string;
  to_buy_qty: string;
  /** Ước tính ở thời điểm xem: tồn còn giữ được cho ngày này / hàng đang chờ về kịp ngày. */
  allocatable_now: string;
  pending_now: string;
};

export type DemandRevision = {
  id: number;
  revision: number;
  status: RevisionStatus;
  servings: number;
  menu_items: { dish_id: number; dish_name: string }[];
  stale_reason: string;
  created_by: string;
  created_at: string;
  approved_at: string | null;
  has_purchase_order: boolean;
  lines: DemandLine[];
};

export type Shortage = { food_id: number; food_name: string; unit: string; quantity: string; reserved: string };

export type DayDemand = {
  date: string;
  status: 'not_open' | 'open' | 'planned_confirmed';
  servings?: number | null;
  revisions: { id: number; revision: number; status: RevisionStatus; stale_reason: string; created_at: string }[];
  current: DemandRevision | null;
  /** Số suất hoặc thực đơn đã đổi sau khi tính: phải tính lại. */
  is_outdated: boolean;
  shortages: Shortage[];
};

export type ReserveInput = { food_id: number; qty: string; reason: string };

export const REVISION_STATUS: Record<RevisionStatus, { label: string; tone: 'ok' | 'info' | 'neutral' }> = {
  draft: { label: 'Bản tính (chưa duyệt)', tone: 'info' },
  approved: { label: 'Đã duyệt', tone: 'ok' },
  stale: { label: 'Lỗi thời', tone: 'neutral' },
};

/* ---------- Đơn đặt (SF63/65) ---------- */
export type PoStatus = 'draft' | 'approved' | 'sent' | 'closed' | 'cancelled';

export type PoLine = {
  id: number;
  food_id: number;
  food_name: string;
  unit: string;
  qty_ordered: string;
  qty_received: string;
  qty_open: string;
  unit_price_est: string | null;
};

export type PurchaseOrder = {
  id: number;
  code: string;
  supplier_id: number;
  supplier_name: string;
  status: PoStatus;
  expected_date: string;
  note: string;
  version: number;
  demand_revision_id: number | null;
  /** Ngày ăn của đề xuất tạo ra đơn (đơn tay: null). */
  lunch_date: string | null;
  close_reason: string;
  created_at: string;
  sent_at: string | null;
  closed_at: string | null;
  lines: PoLine[];
  receipts: { id: number; date: string; status: 'DRAFT' | 'POSTED' }[];
};

export const PO_STATUS: Record<PoStatus, { label: string; tone: 'ok' | 'info' | 'warn' | 'neutral' | 'danger' }> = {
  draft: { label: 'Nháp', tone: 'warn' },
  approved: { label: 'Đã duyệt', tone: 'info' },
  sent: { label: 'Đã gửi NCC', tone: 'info' },
  closed: { label: 'Đã đóng', tone: 'ok' },
  cancelled: { label: 'Đã huỷ', tone: 'neutral' },
};

export type PoAction = 'approve' | 'send' | 'cancel' | 'close';

/* ---------- Chi phí, đóng ngày, báo cáo (SF69/70) ---------- */
export type DayCost = {
  date: string;
  planned_total: number | null;
  actual_total: number | null;
  cost: string;
  cost_per_serving: string | null;
  cost_per_serving_reason: string;
  closed: boolean;
  close: { closed_at: string; note: string; closed_by: string } | null;
  foods: { food_id: number; food_name: string; unit: string; required: string; issued: string; variance: string }[];
};

export type DailyReport = {
  from: string;
  to: string;
  days: { date: string; planned_total: number | null; actual_total: number | null; cost: string; cost_per_serving: string | null; closed: boolean }[];
  total_cost: string;
  total_servings: number;
  avg_cost_per_serving: string | null;
};

/* ---------- Ảnh suất ăn thực tế (SF73) ---------- */
export type MealPhoto = {
  id: number;
  date: string;
  note: string;
  width: number;
  height: number;
  size: number;
  uploaded_by: string;
  created_at: string;
  /** Ảnh chỉ tải được khi đã đăng nhập (cookie phiên), không có link công khai. */
  url: string;
};

export type DayPhotos = { date: string; max: number; results: MealPhoto[] };

const day = (date: string) => `/api/lunch-days/${encodeURIComponent(date)}`;

export const lunchApi = {
  demand: (date: string) => api.get<DayDemand>(`${day(date)}/demand/`),
  calculate: (date: string, reserves: ReserveInput[]) => api.post<DemandRevision>(`${day(date)}/demand/calculate/`, { reserves }),
  approve: (revisionId: number) => api.post<DemandRevision>(`/api/demand-revisions/${revisionId}/approve/`),

  orders: (status?: PoStatus) =>
    api.get<{ results: PurchaseOrder[] }>(`/api/purchase-orders/${status ? `?status=${status}` : ''}`).then((r) => r.results),
  order: (id: number) => api.get<PurchaseOrder>(`/api/purchase-orders/${id}/`),
  createOrder: (body: {
    supplier_id: number;
    expected_date: string;
    note: string;
    lines: { food_id: number; qty_ordered: string; unit_price_est?: string }[];
  }) => api.post<PurchaseOrder>('/api/purchase-orders/', body),
  orderFromDemand: (body: { revision_id: number; supplier_id: number; expected_date: string }) =>
    api.post<PurchaseOrder>('/api/purchase-orders/from-demand/', body),
  orderAction: (id: number, action: PoAction, version: number, reason?: string) =>
    api.post<PurchaseOrder>(`/api/purchase-orders/${id}/${action}/`, reason === undefined ? { version } : { version, reason }),
  /** Phiếu nhập NHÁP theo đơn; chốt bằng inventoryApi.postReceipt. */
  receive: (id: number, body: { date: string; note: string; lines: { po_line_id: number; quantity: string; unit_price: string }[] }) =>
    api.post<Receipt>(`/api/purchase-orders/${id}/receipts/`, body),

  /** Phiếu xuất NHÁP theo phần còn thiếu của nhu cầu đã duyệt; chốt bằng inventoryApi.postIssue. */
  createDayIssue: (date: string) => api.post<Issue>(`${day(date)}/issue/`),
  cost: (date: string) => api.get<DayCost>(`${day(date)}/cost/`),
  close: (date: string, note: string) => api.post<DayCost>(`${day(date)}/close/`, { note }),
  reopenClose: (date: string, reason: string) => api.post<DayCost>(`${day(date)}/reopen-close/`, { reason }),
  dailyReport: (from: string, to: string) => api.get<DailyReport>(`/api/reports/daily/?from=${from}&to=${to}`),

  photos: (date: string) => api.get<DayPhotos>(`${day(date)}/photos/`),
  /** multipart: file (JPEG đã nén ở trình duyệt) + note. */
  uploadPhoto: (date: string, file: Blob, note: string) => {
    const form = new FormData();
    form.append('file', file, 'suat-an.jpg');
    form.append('note', note);
    return api.post<MealPhoto>(`${day(date)}/photos/`, form);
  },
  deletePhoto: (id: number) => api.delete<{ ok: true }>(`/api/meal-photos/${id}/`),
};
