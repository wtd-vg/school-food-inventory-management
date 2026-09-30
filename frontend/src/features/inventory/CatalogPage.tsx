/**
 * Danh mục & mặt hàng (thay CategoryPage/FoodPage cũ). ?tab=mat-hang|danh-muc, ?tao=1 thêm, ?sua=ID sửa.
 * Không xoá (API trả 405); ngừng dùng bằng is_active để giữ lịch sử chứng từ.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { IconPencil, IconPlus } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  IconButton,
  Lead,
  Pagination,
  SearchField,
  Segmented,
  SelectField,
  Skeleton,
  Stack,
  TextField,
  Toolbar,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { formatQty, unitLabel } from '../../lib/format';
import { messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi, type Category, type Food } from '../../services/inventory';
import { focusFirstInvalid, useQueryParam, useUpdateParams } from './shared';
import s from './shared.module.css';

const PAGE_SIZE = 12;
/** Đơn vị kho chuẩn; món ăn chỉ quy đổi được với ba đơn vị này (recipe_views.convert_quantity). */
const STANDARD_UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'lit', label: 'lít' },
  { value: 'piece', label: 'cái' },
];

type Tab = 'mat-hang' | 'danh-muc';

export function CatalogPage() {
  const [tabParam, setTabParam] = useQueryParam('tab');
  const tab: Tab = tabParam === 'danh-muc' ? 'danh-muc' : 'mat-hang';
  const query = useApiQuery(() => Promise.all([inventoryApi.foods(), inventoryApi.categories()]), []);
  const foods = query.data?.[0] ?? [];
  const categories = query.data?.[1] ?? [];

  return (
    <Stack gap="lg">
      <Segmented
        label="Chọn danh sách"
        value={tab}
        onChange={(v) => setTabParam(v)}
        options={[
          { value: 'mat-hang', label: 'Mặt hàng', count: query.data ? foods.length : undefined },
          { value: 'danh-muc', label: 'Danh mục', count: query.data ? categories.length : undefined },
        ]}
      />
      {query.loading ? (
        <Skeleton rows={6} />
      ) : query.error ? (
        <ErrorState message={query.error} onRetry={query.reload} />
      ) : tab === 'mat-hang' ? (
        <FoodsSection foods={foods} categories={categories} onChanged={query.reload} />
      ) : (
        <CategoriesSection categories={categories} foods={foods} onChanged={query.reload} />
      )}
    </Stack>
  );
}

/* ---------------- Mặt hàng ---------------- */
function FoodsSection({ foods, categories, onChanged }: { foods: Food[]; categories: Category[]; onChanged: () => void }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const [createParam] = useQueryParam('tao');
  const [editParam] = useQueryParam('sua');
  const updateParams = useUpdateParams();
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return foods
      .filter((f) => (status === 'all' ? true : status === 'active' ? f.is_active : !f.is_active))
      .filter((f) => !q || f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q) || (catById.get(f.category_id)?.name ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [foods, status, search, catById]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const editing = foods.find((f) => String(f.id) === editParam) ?? null;
  const inactiveCount = foods.filter((f) => !f.is_active).length;

  const columns: Column<Food>[] = [
    {
      key: 'name',
      header: 'Mặt hàng',
      width: '34%',
      cell: (f) => (
        <>
          <span className={tableText.primaryText}>{f.name}</span>
          <span className={tableText.secondaryText}>{catById.get(f.category_id)?.name ?? ''}</span>
        </>
      ),
    },
    { key: 'code', header: 'Mã', width: '14%', cell: (f) => <span className={tableText.muted}>{f.code}</span> },
    { key: 'unit', header: 'Đơn vị', width: '11%', cell: (f) => unitLabel(f.unit) },
    { key: 'qty', header: 'Tồn', width: '15%', align: 'right', cell: (f) => <span className={tableText.strong}>{formatQty(f.quantity, f.unit)}</span> },
    { key: 'status', header: 'Trạng thái', width: '16%', cell: (f) => (f.is_active ? <Badge tone="ok">Đang dùng</Badge> : <Badge>Ngừng dùng</Badge>) },
    {
      key: 'actions',
      header: <span className="sr-only">Thao tác</span>,
      width: '10%',
      align: 'right',
      cell: (f) => (
        <IconButton label={`Sửa ${f.name}`} ghost write onClick={() => updateParams({ sua: String(f.id), tao: null })}>
          <IconPencil size={18} />
        </IconButton>
      ),
    },
  ];

  return (
    <>
      <Toolbar>
        <Segmented
          label="Lọc theo trạng thái"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: 'active', label: 'Đang dùng' },
            { value: 'inactive', label: 'Ngừng dùng', count: inactiveCount },
            { value: 'all', label: 'Tất cả' },
          ]}
        />
        <div className={s.inlineGroup}>
          <SearchField
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Tìm mặt hàng…"
          />
          <Button write icon={<IconPlus size={18} strokeWidth={2.4} />} onClick={() => updateParams({ tao: '1', sua: null })} disabled={categories.every((c) => !c.is_active)}>
            Thêm mặt hàng
          </Button>
        </div>
      </Toolbar>
      {categories.every((c) => !c.is_active) ? (
        <Callout tone="warn">Cần tạo ít nhất một danh mục đang dùng trước khi thêm mặt hàng.</Callout>
      ) : null}
      {foods.length === 0 ? (
        <EmptyState title="Chưa có mặt hàng nào">Thêm mặt hàng để bắt đầu nhập kho.</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="Không có mặt hàng phù hợp">Thử đổi bộ lọc hoặc từ khoá.</EmptyState>
      ) : (
        <>
          <DataTable caption="Danh sách mặt hàng" rows={visible} rowKey={(f) => f.id} columns={columns} minWidth="720px" />
          <Pagination page={current} pageCount={pageCount} onPageChange={setPage} summary={`Đang hiện ${visible.length} trong ${filtered.length} mặt hàng`} />
        </>
      )}

      {createParam || editing ? (
        <FoodForm
          key={editing?.id ?? 'new'}
          food={editing}
          categories={categories}
          onClose={() => updateParams({ tao: null, sua: null })}
          onSaved={() => {
            onChanged();
            updateParams({ tao: null, sua: null });
          }}
        />
      ) : null}
    </>
  );
}

function FoodForm({ food, categories, onClose, onSaved }: { food: Food | null; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState(food?.code ?? '');
  const [name, setName] = useState(food?.name ?? '');
  const [categoryId, setCategoryId] = useState(food ? String(food.category_id) : '');
  const [unit, setUnit] = useState(food?.unit ?? 'kg');
  const [active, setActive] = useState(food?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const units = STANDARD_UNITS.some((u) => u.value === unit) ? STANDARD_UNITS : [...STANDARD_UNITS, { value: unit, label: `${unit} (đơn vị cũ)` }];
  const selectable = categories.filter((c) => c.is_active || String(c.id) === categoryId);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!code.trim()) next.code = 'Hãy nhập mã mặt hàng.';
    if (!name.trim()) next.name = 'Hãy nhập tên mặt hàng.';
    if (!categoryId) next.category = 'Hãy chọn danh mục.';
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstInvalid('food-form');
      return;
    }
    setBusy(true);
    try {
      const body = { code: code.trim(), name: name.trim(), category_id: Number(categoryId), unit, is_active: active };
      if (food) await inventoryApi.updateFood(food.id, body);
      else await inventoryApi.createFood(body);
      toast.show(food ? `Đã lưu thay đổi cho ${body.name}.` : `Đã thêm mặt hàng ${body.name}.`);
      onSaved();
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      kicker={food ? `Mã ${food.code}` : 'Mặt hàng mới'}
      title={food ? food.name : 'Thêm mặt hàng'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="food-form" write busy={busy}>
            {food ? 'Lưu thay đổi' : 'Thêm mặt hàng'}
          </Button>
        </>
      }
    >
      <form id="food-form" className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        ) : null}
        <div className={s.formGrid}>
          <TextField data-autofocus label="Mã" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} error={errors.code} required maxLength={32} placeholder="GAO01" />
          <SelectField label="Đơn vị tính" value={unit} onChange={(e) => setUnit(e.target.value)} hint="Món ăn quy đổi được g → kg, ml → lít.">
            {units.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </SelectField>
          <TextField label="Tên mặt hàng" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required maxLength={120} fieldClassName={s.span2} placeholder="Gạo tẻ Bắc Hương" />
          <SelectField label="Danh mục" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={errors.category} required fieldClassName={s.span2}>
            <option value="">Chọn danh mục</option>
            {selectable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? '' : ' (ngừng dùng)'}
              </option>
            ))}
          </SelectField>
        </div>
        {food ? (
          <>
            <Checkbox label="Đang dùng (bỏ chọn để ngừng dùng, lịch sử vẫn giữ nguyên)" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <Callout tone="info">Tồn kho và giá vốn chỉ thay đổi qua phiếu nhập, phiếu xuất và kiểm kê.</Callout>
          </>
        ) : null}
      </form>
    </Drawer>
  );
}

/* ---------------- Danh mục ---------------- */
function CategoriesSection({ categories, foods, onChanged }: { categories: Category[]; foods: Food[]; onChanged: () => void }) {
  const [createParam] = useQueryParam('tao');
  const [editParam] = useQueryParam('sua');
  const updateParams = useUpdateParams();
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    foods.forEach((f) => m.set(f.category_id, (m.get(f.category_id) ?? 0) + 1));
    return m;
  }, [foods]);
  const sorted = [...categories].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, 'vi'));
  const editing = categories.find((c) => String(c.id) === editParam) ?? null;

  const columns: Column<Category>[] = [
    { key: 'name', header: 'Danh mục', width: '40%', cell: (c) => <span className={tableText.primaryText}>{c.name}</span> },
    { key: 'code', header: 'Mã', width: '18%', cell: (c) => <span className={tableText.muted}>{c.code}</span> },
    { key: 'count', header: 'Số mặt hàng', width: '14%', align: 'right', cell: (c) => counts.get(c.id) ?? 0 },
    { key: 'status', header: 'Trạng thái', width: '18%', cell: (c) => (c.is_active ? <Badge tone="ok">Đang dùng</Badge> : <Badge>Ngừng dùng</Badge>) },
    {
      key: 'actions',
      header: <span className="sr-only">Thao tác</span>,
      width: '10%',
      align: 'right',
      cell: (c) => (
        <IconButton label={`Sửa ${c.name}`} ghost write onClick={() => updateParams({ sua: String(c.id), tao: null })}>
          <IconPencil size={18} />
        </IconButton>
      ),
    },
  ];

  return (
    <>
      <Toolbar>
        <Lead>
          <strong>{categories.filter((c) => c.is_active).length}</strong> danh mục đang dùng
        </Lead>
        <Button write icon={<IconPlus size={18} strokeWidth={2.4} />} onClick={() => updateParams({ tao: '1', sua: null })}>
          Thêm danh mục
        </Button>
      </Toolbar>
      {categories.length === 0 ? (
        <EmptyState title="Chưa có danh mục nào">Danh mục giúp nhóm mặt hàng, ví dụ Rau củ quả, Thịt cá trứng, Đồ khô.</EmptyState>
      ) : (
        <DataTable caption="Danh sách danh mục" rows={sorted} rowKey={(c) => c.id} columns={columns} minWidth="560px" />
      )}
      {createParam || editing ? (
        <CategoryForm
          key={editing?.id ?? 'new'}
          category={editing}
          itemCount={editing ? counts.get(editing.id) ?? 0 : 0}
          onClose={() => updateParams({ tao: null, sua: null })}
          onSaved={() => {
            onChanged();
            updateParams({ tao: null, sua: null });
          }}
        />
      ) : null}
    </>
  );
}

function CategoryForm({ category, itemCount, onClose, onSaved }: { category: Category | null; itemCount: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState(category?.code ?? '');
  const [name, setName] = useState(category?.name ?? '');
  const [active, setActive] = useState(category?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!code.trim()) next.code = 'Hãy nhập mã danh mục.';
    if (!name.trim()) next.name = 'Hãy nhập tên danh mục.';
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstInvalid('category-form');
      return;
    }
    setBusy(true);
    try {
      const body = { code: code.trim(), name: name.trim(), is_active: active };
      if (category) await inventoryApi.updateCategory(category.id, body);
      else await inventoryApi.createCategory(body);
      toast.show(category ? `Đã lưu danh mục ${body.name}.` : `Đã thêm danh mục ${body.name}.`);
      onSaved();
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      kicker={category ? `Mã ${category.code}` : 'Danh mục mới'}
      title={category ? category.name : 'Thêm danh mục'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="category-form" write busy={busy}>
            {category ? 'Lưu thay đổi' : 'Thêm danh mục'}
          </Button>
        </>
      }
    >
      <form id="category-form" className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        ) : null}
        <TextField data-autofocus label="Mã" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} error={errors.code} required maxLength={32} placeholder="RAU" />
        <TextField label="Tên danh mục" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required maxLength={120} placeholder="Rau củ quả" />
        {category ? (
          <>
            <Checkbox label="Đang dùng" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {itemCount > 0 && !active ? (
              <Callout tone="warn">Danh mục còn {itemCount} mặt hàng nên hệ thống sẽ không cho ngừng dùng.</Callout>
            ) : null}
          </>
        ) : null}
      </form>
    </Drawer>
  );
}
