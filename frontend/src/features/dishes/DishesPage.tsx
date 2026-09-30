/**
 * Món & công thức (thay RecipePage cũ). Định lượng mỗi suất lưu theo đơn vị kho (kg/lít/cái, 3 chữ số lẻ).
 * Chi phí ước tính/suất = Σ định lượng × giá vốn bình quân hiện tại (chỉ để tham khảo, không phải giá chốt).
 * ?tao=1 thêm món, ?sua=ID sửa. API không có xoá: ngừng dùng bằng is_active.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { IconBowl, IconPencil, IconPlus, IconTrash } from '../../components/icons';
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
  PageHeader,
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
import { mul, normalizeDecimalInput, parseDec, round, sum, toFixed, type Dec } from '../../lib/decimal';
import { formatMoney, formatNumber, unitLabel } from '../../lib/format';
import { messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { catalogApi, recipeUnitsFor, type Dish } from '../../services/catalog';
import { inventoryApi, type Food } from '../../services/inventory';
import { focusFirstInvalid, useQueryParam, useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import styles from './DishesPage.module.css';

/** 0.060 kg → "60 g"; 1.200 kg → "1,2 kg"; 0.005 lít → "5 ml". */
export function formatPortion(qty: string, unit: string): string {
  const d = parseDec(qty);
  const u = unit.toLowerCase();
  if (d && (u === 'kg' || u === 'lit') && d.v < 10n ** BigInt(d.s)) {
    return `${formatNumber(toFixed(mul(d, { v: 1000n, s: 0 }), 0), 0)} ${u === 'kg' ? 'g' : 'ml'}`;
  }
  return `${formatNumber(qty, 3)} ${unitLabel(unit)}`;
}

function portionCost(dish: Dish, foods: Map<number, Food>): { value: string; complete: boolean } {
  let complete = true;
  const parts: Dec[] = dish.components.map((c) => {
    const q = parseDec(c.quantity);
    const cost = parseDec(foods.get(c.food_id)?.avg_cost ?? '0');
    if (!q || !cost || cost.v === 0n) {
      complete = false;
      return { v: 0n, s: 0 };
    }
    return mul(q, cost);
  });
  return { value: toFixed(round(sum(parts), 0), 0), complete };
}

export function DishesPage() {
  const query = useApiQuery(() => Promise.all([catalogApi.dishes(), inventoryApi.foods()]), []);
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [createParam] = useQueryParam('tao');
  const [editParam] = useQueryParam('sua');
  const updateParams = useUpdateParams();

  const dishes = query.data?.[0] ?? [];
  const foods = query.data?.[1] ?? [];
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dishes
      .filter((d) => (status === 'all' ? true : status === 'active' ? d.is_active : !d.is_active))
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q) || d.components.some((c) => (foodById.get(c.food_id)?.name ?? '').toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [dishes, status, search, foodById]);
  const editing = dishes.find((d) => String(d.id) === editParam) ?? null;

  const columns: Column<Dish>[] = [
    {
      key: 'name',
      header: 'Món',
      width: '26%',
      cell: (d) => (
        <>
          <button type="button" className={tableText.rowButton} onClick={() => updateParams({ sua: String(d.id), tao: null })}>
            {d.name}
          </button>
          <span className={tableText.secondaryText}>{d.code}</span>
        </>
      ),
    },
    {
      key: 'components',
      header: 'Định lượng mỗi suất',
      width: '40%',
      wrap: true,
      cell: (d) => (
        <span className={styles.components}>
          {d.components.map((c) => `${foodById.get(c.food_id)?.name ?? `#${c.food_id}`} ${formatPortion(c.quantity, c.food_unit)}`).join(' · ')}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Chi phí ước tính/suất',
      width: '16%',
      align: 'right',
      cell: (d) => {
        const c = portionCost(d, foodById);
        return (
          <span className={tableText.strong} title={c.complete ? undefined : 'Có nguyên liệu chưa có giá vốn'}>
            {formatMoney(c.value)}
            {c.complete ? '' : '*'}
          </span>
        );
      },
    },
    { key: 'status', header: 'Trạng thái', width: '12%', cell: (d) => (d.is_active ? <Badge tone="ok">Đang dùng</Badge> : <Badge>Ngừng dùng</Badge>) },
    {
      key: 'actions',
      header: <span className="sr-only">Thao tác</span>,
      width: '56px',
      className: tableText.actionCell,
      align: 'right',
      cell: (d) => (
        <IconButton label={`Sửa ${d.name}`} ghost write onClick={() => updateParams({ sua: String(d.id), tao: null })}>
          <IconPencil size={18} />
        </IconButton>
      ),
    },
  ];

  const activeCount = dishes.filter((d) => d.is_active).length;

  return (
    <>
      <PageHeader
        title="Món & công thức"
        actions={
          <Button write icon={<IconPlus size={18} strokeWidth={2.4} />} onClick={() => updateParams({ tao: '1', sua: null })}>
            Thêm món
          </Button>
        }
      />
      <Stack gap="lg">
        {query.data ? (
          <Lead>
            <strong>{activeCount}</strong> món đang dùng · định lượng tính cho <strong>1 suất</strong>, trước sơ chế. Chi phí ước tính theo giá vốn bình quân hiện tại.
          </Lead>
        ) : null}
        <Toolbar>
          <Segmented
            label="Lọc theo trạng thái"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: 'Đang dùng' },
              { value: 'inactive', label: 'Ngừng dùng', count: dishes.length - activeCount },
              { value: 'all', label: 'Tất cả' },
            ]}
          />
          <SearchField value={search} onValueChange={setSearch} placeholder="Tìm món…" />
        </Toolbar>
        {query.loading ? (
          <Skeleton rows={6} />
        ) : query.error ? (
          <ErrorState message={query.error} onRetry={query.reload} />
        ) : dishes.length === 0 ? (
          <EmptyState
            icon={<IconBowl size={32} />}
            title="Chưa có món nào"
            action={
              <Button write icon={<IconPlus size={18} />} onClick={() => updateParams({ tao: '1' })}>
                Thêm món
              </Button>
            }
          >
            Mỗi món gồm các nguyên liệu và định lượng cho một suất.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="Không có món phù hợp">Thử đổi bộ lọc hoặc từ khoá.</EmptyState>
        ) : (
          <DataTable caption="Danh sách món ăn" rows={filtered} rowKey={(d) => d.id} columns={columns} minWidth="820px" />
        )}
        {filtered.some((d) => !portionCost(d, foodById).complete) ? (
          <p className={styles.footnote}>* Có nguyên liệu chưa nhập kho lần nào nên chưa có giá vốn.</p>
        ) : null}
      </Stack>

      {createParam || editing ? (
        <DishForm
          key={editing?.id ?? 'new'}
          dish={editing}
          foods={foods}
          onClose={() => updateParams({ tao: null, sua: null })}
          onSaved={() => {
            query.reload();
            updateParams({ tao: null, sua: null });
          }}
        />
      ) : null}
    </>
  );
}

type Line = { key: number; foodId: string; quantity: string; unit: string };
let seq = 1;

function initialLines(dish: Dish | null, foods: Map<number, Food>): Line[] {
  if (!dish || dish.components.length === 0) return [{ key: seq++, foodId: '', quantity: '', unit: 'g' }];
  return dish.components.map((c) => {
    const food = foods.get(c.food_id);
    const u = (food?.unit ?? c.food_unit).toLowerCase();
    // Hiển thị lại theo g/ml khi dưới 1 kg/lít cho dễ đọc.
    const d = parseDec(c.quantity);
    if (d && (u === 'kg' || u === 'lit') && d.v < 10n ** BigInt(d.s)) {
      return { key: seq++, foodId: String(c.food_id), quantity: toFixed(mul(d, { v: 1000n, s: 0 }), 0), unit: u === 'kg' ? 'g' : 'ml' };
    }
    return { key: seq++, foodId: String(c.food_id), quantity: formatNumber(c.quantity, 3).replace(/\./g, ''), unit: u };
  });
}

function DishForm({ dish, foods, onClose, onSaved }: { dish: Dish | null; foods: Food[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const [code, setCode] = useState(dish?.code ?? '');
  const [name, setName] = useState(dish?.name ?? '');
  const [active, setActive] = useState(dish?.is_active ?? true);
  const [lines, setLines] = useState<Line[]>(() => initialLines(dish, foodById));
  const [errors, setErrors] = useState<{ code?: string; name?: string; lines: Record<number, { food?: string; quantity?: string }> }>({ lines: {} });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const selectable = foods.filter((f) => f.is_active || lines.some((l) => l.foodId === String(f.id))).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const used = new Set(lines.map((l) => l.foodId).filter(Boolean));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = { lines: {} };
    if (!dish && !code.trim()) next.code = 'Hãy nhập mã món.';
    if (!name.trim()) next.name = 'Hãy nhập tên món.';
    const components: { food_id: number; quantity: string; unit: string }[] = [];
    for (const l of lines) {
      const le: { food?: string; quantity?: string } = {};
      if (!l.foodId) le.food = 'Hãy chọn nguyên liệu.';
      // g/ml lưu về kg/lít với 3 chữ số lẻ: chỉ nhận số nguyên để không mất định lượng.
      const small = l.unit === 'g' || l.unit === 'ml';
      const q = normalizeDecimalInput(l.quantity, { maxDp: small ? 0 : 3, maxIntDigits: small ? 11 : 8, positive: true, label: 'Định lượng' });
      if (!q.ok) le.quantity = small && q.error.includes('chữ số sau dấu phẩy') ? `Nhập số nguyên ${l.unit} (ví dụ 60).` : q.error;
      if (Object.keys(le).length) next.lines[l.key] = le;
      else if (q.ok) components.push({ food_id: Number(l.foodId), quantity: q.value, unit: l.unit });
    }
    setErrors(next);
    if (next.code || next.name || Object.keys(next.lines).length) {
      focusFirstInvalid('dish-form');
      return;
    }
    setBusy(true);
    try {
      if (dish) await catalogApi.updateDish(dish.id, { name: name.trim(), is_active: active, components });
      else await catalogApi.createDish({ code: code.trim(), name: name.trim(), components });
      toast.show(dish ? `Đã lưu công thức ${name.trim()}.` : `Đã thêm món ${name.trim()}.`);
      onSaved();
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      kicker={dish ? `Mã ${dish.code}` : 'Món mới'}
      title={dish ? dish.name : 'Thêm món'}
      subtitle="Định lượng cho 1 suất, trước sơ chế."
      width="560px"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="dish-form" write busy={busy}>
            {dish ? 'Lưu thay đổi' : 'Thêm món'}
          </Button>
        </>
      }
    >
      <form id="dish-form" className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        ) : null}
        <div className={s.formGrid}>
          <TextField
            data-autofocus
            label="Mã món"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={errors.code}
            required={!dish}
            readOnly={Boolean(dish)}
            hint={dish ? 'Mã không đổi được sau khi tạo.' : undefined}
            maxLength={32}
            placeholder="CANH01"
          />
          <TextField label="Tên món" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required maxLength={120} placeholder="Canh bí đỏ thịt bằm" />
        </div>
        <h3 className={s.subhead}>Nguyên liệu cho 1 suất</h3>
        <ol className={s.lineList}>
          {lines.map((l, i) => {
            const food = foodById.get(Number(l.foodId));
            const units = food ? recipeUnitsFor(food.unit) : [{ value: l.unit, label: l.unit }];
            const err = errors.lines[l.key] ?? {};
            return (
              <li key={l.key} className={s.line}>
                <div className={s.lineHead}>
                  <span className={s.lineNo}>Nguyên liệu {i + 1}</span>
                  {lines.length > 1 ? (
                    <IconButton label={`Xoá nguyên liệu ${i + 1}`} ghost onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      <IconTrash size={18} />
                    </IconButton>
                  ) : null}
                </div>
                <div className={styles.componentGrid}>
                  <SelectField
                    label="Nguyên liệu"
                    value={l.foodId}
                    error={err.food}
                    required
                    fieldClassName={styles.foodField}
                    onChange={(e) => {
                      const f = foodById.get(Number(e.target.value));
                      update(l.key, { foodId: e.target.value, unit: f ? recipeUnitsFor(f.unit)[0].value : l.unit });
                    }}
                  >
                    <option value="">Chọn nguyên liệu</option>
                    {selectable.map((f) => (
                      <option key={f.id} value={f.id} disabled={used.has(String(f.id)) && String(f.id) !== l.foodId}>
                        {f.name} (kho: {unitLabel(f.unit)})
                      </option>
                    ))}
                  </SelectField>
                  <TextField label="Định lượng" numeric value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} error={err.quantity} required placeholder="0" />
                  <SelectField label="Đơn vị" value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} disabled={units.length < 2}>
                    {units.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </li>
            );
          })}
        </ol>
        <div>
          <Button variant="secondary" size="sm" icon={<IconPlus size={16} />} onClick={() => setLines((ls) => [...ls, { key: seq++, foodId: '', quantity: '', unit: 'g' }])}>
            Thêm nguyên liệu
          </Button>
        </div>
        {dish ? <Checkbox label="Đang dùng (bỏ chọn để ngừng dùng món này)" checked={active} onChange={(e) => setActive(e.target.checked)} /> : null}
      </form>
    </Drawer>
  );
}
