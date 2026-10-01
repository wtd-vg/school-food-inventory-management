/** Món & công thức, lớp học, nhà cung cấp: khớp JSON của recipe_views.py, class_views.py, views.py. */
import { api } from '../lib/http';
import type { Supplier } from './inventory';

export type DishComponent = { food_id: number; food_name: string; quantity: string; food_unit: string };
export type Dish = { id: number; code: string; name: string; is_active: boolean; has_recipe: boolean; components: DishComponent[] };
export type ComponentInput = { food_id: number; quantity: string; unit: string };

export type SchoolClass = { id: number; code: string; name: string; grade: number | null; enrolled: number; is_active: boolean };

type List<T> = { results: T[] };

export const catalogApi = {
  dishes: () => api.get<List<Dish>>('/api/dishes/').then((r) => r.results),
  createDish: (body: { code: string; name: string; components: ComponentInput[] }) =>
    api.post<{ id: number; code: string; name: string }>('/api/dishes/', body),
  updateDish: (id: number, body: { name?: string; is_active?: boolean; components?: ComponentInput[] }) =>
    api.patch<{ id: number }>(`/api/dishes/${id}/`, body),

  classes: () => api.get<List<SchoolClass>>('/api/classes/').then((r) => r.results),
  createClass: (body: { code: string; name: string; grade: number | null; enrolled: number }) => api.post<SchoolClass>('/api/classes/', body),
  updateClass: (id: number, body: { name?: string; grade?: number | null; enrolled?: number; is_active?: boolean }) =>
    api.patch<SchoolClass>(`/api/classes/${id}/`, body),

  suppliers: () => api.get<List<Supplier>>('/api/suppliers/').then((r) => r.results),
  createSupplier: (body: { code: string; name: string; phone: string; is_active?: boolean }) =>
    api.post<Supplier>('/api/suppliers/', body),
  updateSupplier: (id: number, body: Partial<Pick<Supplier, 'code' | 'name' | 'phone' | 'is_active'>>) =>
    api.patch<Supplier>(`/api/suppliers/${id}/`, body),
};

/**
 * Đơn vị nhập được cho định lượng, theo đơn vị kho của nguyên liệu (recipe_views.convert_quantity):
 * kg ← g/kg · lit ← ml/lit · piece ← piece · đơn vị khác phải trùng khớp.
 */
export function recipeUnitsFor(foodUnit: string): { value: string; label: string }[] {
  const u = foodUnit.toLowerCase();
  if (u === 'kg' || u === 'g') return [
    { value: 'g', label: 'g' },
    { value: 'kg', label: 'kg' },
  ];
  if (u === 'lit' || u === 'l' || u === 'ml') return [
    { value: 'ml', label: 'ml' },
    { value: 'lit', label: 'lít' },
  ];
  if (u === 'piece') return [{ value: 'piece', label: 'cái' }];
  return [{ value: u, label: u }];
}

/** Lớp: sĩ số 0–200 theo contract SF43. */
export const ENROLLED_MAX = 200;
