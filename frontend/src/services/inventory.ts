/** Kiểu dữ liệu và lời gọi API kho, khớp đúng JSON backend (views.py). Decimal là chuỗi. */
import { api } from '../lib/http';

export type Category = { id: number; code: string; name: string; is_active: boolean };

export type Food = {
  id: number;
  code: string;
  name: string;
  category_id: number;
  unit: string;
  is_active: boolean;
  quantity: string;
  avg_cost: string;
  stock_version: number;
};

export type Supplier = { id: number; code: string; name: string; phone: string; is_active: boolean };

export type StockRow = {
  id: number;
  code: string;
  name: string;
  category_name: string;
  unit: string;
  quantity: string;
  avg_cost: string;
  stock_value: string;
  transaction_count: number;
};

export type TxType = 'IN' | 'OUT' | 'ADJUST';

export type Transaction = {
  id: number;
  food_id: number;
  transaction_type: TxType;
  quantity_change: string;
  cost: string;
  value_delta: string;
  date: string;
  source: 'receipt' | 'issue' | 'stocktake';
  reference: string;
  created_at: string;
};

export type DocStatus = 'DRAFT' | 'POSTED';

export type ReceiptLine = {
  id: number;
  food_id: number;
  food_name?: string;
  quantity: string;
  unit_price: string;
  line_total?: string;
};

export type Receipt = {
  id: number;
  supplier_id: number;
  supplier_name?: string;
  date: string;
  note: string;
  status: DocStatus;
  posted_at?: string | null;
  total_value: string;
  lines: ReceiptLine[];
};

export type IssueLine = {
  id: number;
  food_id: number;
  food_name?: string;
  quantity: string;
  unit_cost: string;
  line_total?: string;
};

export type Issue = {
  id: number;
  code: string;
  date: string;
  note: string;
  status: DocStatus;
  posted_at?: string | null;
  total_value: string;
  lines: IssueLine[];
};

export type StocktakeItem = {
  id: number;
  food_id: number;
  food_name: string;
  unit: string;
  snapshot_qty: string;
  snapshot_cost: string;
  snapshot_version: number;
  counted_qty: string | null;
  variance: string;
};

export type Stocktake = {
  id: number;
  date: string | null;
  status: 'draft' | 'posted';
  note: string;
  posted_at: string | null;
  items: StocktakeItem[];
};

type List<T> = { results: T[] };

export const inventoryApi = {
  categories: () => api.get<List<Category>>('/api/categories/').then((r) => r.results),
  createCategory: (body: { code: string; name: string; is_active?: boolean }) => api.post<Category>('/api/categories/', body),
  updateCategory: (id: number, body: Partial<Pick<Category, 'code' | 'name' | 'is_active'>>) =>
    api.patch<Category>(`/api/categories/${id}/`, body),

  foods: () => api.get<List<Food>>('/api/foods/').then((r) => r.results),
  createFood: (body: { code: string; name: string; category_id: number; unit: string; is_active?: boolean }) =>
    api.post<Food>('/api/foods/', body),
  updateFood: (id: number, body: Partial<Pick<Food, 'code' | 'name' | 'category_id' | 'unit' | 'is_active'>>) =>
    api.patch<Food>(`/api/foods/${id}/`, body),

  suppliers: () => api.get<List<Supplier>>('/api/suppliers/').then((r) => r.results),

  stock: () => api.get<List<StockRow>>('/api/reports/stock/').then((r) => r.results),
  transactions: (params: { food?: number; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.food) qs.set('food', String(params.food));
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const suffix = qs.toString() ? `?${qs}` : '';
    return api.get<List<Transaction>>(`/api/reports/transactions/${suffix}`).then((r) => r.results);
  },

  receipts: () => api.get<List<Receipt>>('/api/receipts/').then((r) => r.results),
  receipt: (id: number) => api.get<Receipt>(`/api/receipts/${id}/`),
  createReceipt: (body: {
    supplier_id: number;
    date: string;
    note: string;
    lines: { food_id: number; quantity: string; unit_price: string }[];
  }) => api.post<Receipt>('/api/receipts/', body),
  postReceipt: (id: number) => api.post<{ id: number; status: DocStatus; posted_at: string }>(`/api/receipts/${id}/post/`),

  issues: () => api.get<List<Issue>>('/api/issues/').then((r) => r.results),
  issue: (id: number) => api.get<Issue>(`/api/issues/${id}/`),
  createIssue: (body: { code?: string; date: string; note: string; lines: { food_id: number; quantity: string }[] }) =>
    api.post<Issue>('/api/issues/', body),
  postIssue: (id: number) => api.post<{ id: number; status: DocStatus; total_value: string }>(`/api/issues/${id}/post/`),

  createStocktake: (body: { food_ids: number[]; note: string }) => api.post<Stocktake>('/api/stocktakes/', body),
  countStocktakeItem: (itemId: number, countedQty: string) =>
    api.patch<{ id: number; counted_qty: string; variance: string }>(`/api/stocktake-items/${itemId}/`, {
      counted_qty: countedQty,
    }),
  postStocktake: (id: number) => api.post<Stocktake>(`/api/stocktakes/${id}/post/`),
};

export const TX_LABELS: Record<TxType, string> = { IN: 'Nhập', OUT: 'Xuất', ADJUST: 'Kiểm kê' };

/** Backend trả tham chiếu tiếng Anh ("Receipt #1", "Issue PX-01", "StockTake #3"); hiển thị tiếng Việt. */
export function txReference(tx: Pick<Transaction, 'reference' | 'source'>): string {
  const ref = tx.reference.trim();
  const m = /^(Receipt|Issue|StockTake)\s+(.*)$/.exec(ref);
  if (!m) return ref;
  const label = m[1] === 'Receipt' ? 'Phiếu nhập' : m[1] === 'Issue' ? 'Phiếu xuất' : 'Kiểm kê';
  return `${label} ${m[2]}`;
}

/** Giới hạn cột DB (models.py): lượng Decimal(14,3) < 1e11, đơn giá Decimal(14,2) < 1e12. */
export const QTY_RULE = { maxDp: 3, maxIntDigits: 11 } as const;
export const PRICE_RULE = { maxDp: 2, maxIntDigits: 12 } as const;
