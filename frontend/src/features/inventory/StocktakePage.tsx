/**
 * Kiểm kê: chọn mặt hàng → hệ thống chụp tồn sổ sách → nhập số đếm → chốt (bút toán ADJUST).
 * API không có danh sách phiếu kiểm kê, nên phiếu đang đếm được nhớ trên trình duyệt này để làm tiếp.
 * Nếu tồn thay đổi (nhập/xuất) trong lúc đếm, backend trả 409 và phiếu không chốt được.
 */
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { IconCheck, IconClipboardList } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Lead,
  SearchField,
  Skeleton,
  Stack,
  TextareaField,
  Toolbar,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { cmp, normalizeDecimalInput, parseDec } from '../../lib/decimal';
import { formatDateTime, formatNumber, formatQty, unitLabel } from '../../lib/format';
import { ApiError, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { inventoryApi, QTY_RULE, type Food, type Stocktake, type StocktakeItem } from '../../services/inventory';
import styles from './StocktakePage.module.css';

const STORAGE_KEY = 'schoolfood.stocktake.current';

function loadSaved(): Stocktake | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stocktake) : null;
  } catch {
    return null;
  }
}

function save(st: Stocktake | null) {
  try {
    if (st) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Trình duyệt chặn bộ nhớ: vẫn làm được trong phiên hiện tại.
  }
}

export function StocktakePage() {
  const [current, setCurrent] = useState<Stocktake | null>(() => loadSaved());

  const update = (st: Stocktake | null) => {
    setCurrent(st);
    save(st && st.status === 'draft' ? st : null);
  };

  if (current && current.status === 'posted') return <PostedSummary stocktake={current} onNew={() => update(null)} />;
  if (current) return <CountSheet stocktake={current} onChange={update} />;
  return <SelectFoods onCreated={update} />;
}

/* ---------- Bước 1: chọn mặt hàng ---------- */
function SelectFoods({ onCreated }: { onCreated: (st: Stocktake) => void }) {
  const { canWrite } = useAuth();
  const toast = useToast();
  const foods = useApiQuery(() => inventoryApi.foods(), []);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = useMemo(() => (foods.data ?? []).filter((f) => f.is_active).sort((a, b) => a.name.localeCompare(b.name, 'vi')), [foods.data]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? active.filter((f) => f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q)) : active;
  }, [active, search]);

  const toggle = (id: number) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const st = await inventoryApi.createStocktake({ food_ids: Array.from(picked), note: note.trim() });
      toast.show(`Đã tạo phiếu kiểm kê #${st.id}. Bắt đầu đếm nhé.`);
      onCreated(st);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Food>[] = [
    {
      // Cả tên mặt hàng là nhãn của ô chọn: vùng bấm ≥ 44px.
      key: 'name',
      header: 'Mặt hàng',
      width: '52%',
      cell: (f) => (
        <Checkbox
          label={<span className={tableText.primaryText}>{f.name}</span>}
          checked={picked.has(f.id)}
          onChange={() => toggle(f.id)}
          disabled={!canWrite}
        />
      ),
    },
    { key: 'code', header: 'Mã', width: '18%', cell: (f) => <span className={tableText.muted}>{f.code}</span> },
    { key: 'qty', header: 'Tồn sổ sách', align: 'right', cell: (f) => <span className={tableText.strong}>{formatQty(f.quantity, f.unit)}</span> },
  ];

  const allVisiblePicked = visible.length > 0 && visible.every((f) => picked.has(f.id));

  return (
    <Stack gap="lg">
      {error ? (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      ) : null}
      <Toolbar>
        <div className={styles.pickActions}>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canWrite || visible.length === 0}
            onClick={() =>
              setPicked((prev) => {
                const n = new Set(prev);
                visible.forEach((f) => (allVisiblePicked ? n.delete(f.id) : n.add(f.id)));
                return n;
              })
            }
          >
            {allVisiblePicked ? 'Bỏ chọn các mục đang hiện' : 'Chọn tất cả đang hiện'}
          </Button>
          <span className={styles.pickCount} aria-live="polite">
            Đã chọn <strong>{picked.size}</strong> mặt hàng
          </span>
        </div>
        <SearchField value={search} onValueChange={setSearch} placeholder="Tìm mặt hàng…" />
      </Toolbar>

      {foods.loading ? (
        <Skeleton rows={6} />
      ) : foods.error ? (
        <ErrorState message={foods.error} onRetry={foods.reload} />
      ) : active.length === 0 ? (
        <EmptyState icon={<IconClipboardList size={32} />} title="Chưa có mặt hàng đang dùng để kiểm kê" />
      ) : (
        <DataTable caption="Chọn mặt hàng để kiểm kê" rows={visible} rowKey={(f) => f.id} columns={columns} minWidth="560px" />
      )}

      <div className={styles.createBar}>
        <TextareaField label="Ghi chú đợt kiểm kê" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: kiểm kê cuối tháng 9" rows={2} fieldClassName={styles.note} />
        <Button write icon={<IconClipboardList size={18} />} busy={busy} disabled={picked.size === 0} onClick={create}>
          Tạo phiếu kiểm kê ({picked.size})
        </Button>
      </div>
    </Stack>
  );
}

/* ---------- Bước 2: nhập số đếm ---------- */
function CountSheet({ stocktake, onChange }: { stocktake: Stocktake; onChange: (st: Stocktake | null) => void }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [abandon, setAbandon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  const counted = stocktake.items.filter((i) => i.counted_qty !== null).length;
  const total = stocktake.items.length;
  const withVariance = stocktake.items.filter((i) => i.counted_qty !== null && !/^-?0(\.0+)?$/.test(i.variance)).length;

  const setItem = (id: number, patch: Partial<StocktakeItem>) =>
    onChange({ ...stocktake, items: stocktake.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  const doPost = async () => {
    setBusy(true);
    setError(null);
    try {
      const posted = await inventoryApi.postStocktake(stocktake.id);
      toast.show(`Đã chốt kiểm kê #${stocktake.id}. Tồn kho đã khớp số đếm.`);
      setConfirm(false);
      onChange(posted);
    } catch (err) {
      setConfirm(false);
      setError({ message: messageOf(err), conflict: err instanceof ApiError && err.status === 409 });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<StocktakeItem>[] = [
    { key: 'name', header: 'Mặt hàng', width: '34%', cell: (i) => <span className={tableText.primaryText}>{i.food_name}</span> },
    { key: 'book', header: 'Tồn sổ sách', width: '18%', align: 'right', cell: (i) => formatQty(i.snapshot_qty, i.unit) },
    { key: 'count', header: 'Số đếm thực tế', width: '26%', cell: (i) => <CountInput item={i} onSaved={(v) => setItem(i.id, v)} /> },
    { key: 'var', header: 'Chênh lệch', width: '22%', align: 'right', cell: (i) => <VarianceCell item={i} /> },
  ];

  return (
    <Stack gap="lg">
      <Lead>
        Phiếu kiểm kê <strong>#{stocktake.id}</strong>
        {stocktake.note ? ` · ${stocktake.note}` : ''} · đã đếm <strong>{counted}</strong>/{total} mặt hàng
        {withVariance ? (
          <>
            {' '}
            · <strong>{withVariance}</strong> mặt hàng lệch
          </>
        ) : null}
      </Lead>
      <Callout tone="info">
        Nhập số đếm rồi bấm Enter hoặc chuyển ô để lưu. Không nhập, xuất kho các mặt hàng này cho tới khi chốt, nếu không phiếu sẽ phải làm lại. Phiếu đang đếm được nhớ trên trình duyệt này.
      </Callout>
      {error ? (
        <Callout
          tone="danger"
          role="alert"
          title={error.conflict ? 'Tồn kho đã thay đổi trong lúc đếm' : 'Chưa chốt được kiểm kê'}
          action={
            error.conflict ? (
              <Button variant="secondary" size="sm" onClick={() => onChange(null)}>
                Làm phiếu mới
              </Button>
            ) : undefined
          }
        >
          {error.message}
        </Callout>
      ) : null}

      <DataTable caption={`Bảng đếm phiếu kiểm kê #${stocktake.id}`} rows={stocktake.items} rowKey={(i) => i.id} columns={columns} minWidth="680px" />

      <div className={styles.footer}>
        <Button variant="secondary" onClick={() => setAbandon(true)}>
          Bỏ phiếu này
        </Button>
        <Button write icon={<IconCheck size={18} />} disabled={counted < total} onClick={() => setConfirm(true)}>
          Chốt kiểm kê
        </Button>
      </div>
      {counted < total ? <p className={styles.hint}>Cần nhập đủ số đếm cho {total - counted} mặt hàng còn lại trước khi chốt.</p> : null}

      {confirm ? (
        <ConfirmDialog title={`Chốt kiểm kê #${stocktake.id}?`} confirmLabel="Chốt kiểm kê" busy={busy} onConfirm={doPost} onCancel={() => setConfirm(false)}>
          Tồn kho của {total} mặt hàng sẽ được đặt bằng số đếm; {withVariance} mặt hàng có chênh lệch sẽ ghi bút toán điều chỉnh. Không hoàn tác được.
        </ConfirmDialog>
      ) : null}
      {abandon ? (
        <ConfirmDialog
          title="Bỏ phiếu kiểm kê này?"
          confirmLabel="Bỏ phiếu"
          tone="danger"
          onConfirm={() => {
            setAbandon(false);
            onChange(null);
          }}
          onCancel={() => setAbandon(false)}
        >
          Số đếm đã nhập sẽ không được dùng và tồn kho không thay đổi. Phiếu nháp #{stocktake.id} vẫn còn trên máy chủ nhưng không chốt được từ màn này nữa.
        </ConfirmDialog>
      ) : null}
    </Stack>
  );
}

function CountInput({ item, onSaved }: { item: StocktakeItem; onSaved: (patch: Partial<StocktakeItem>) => void }) {
  const { canWrite } = useAuth();
  // Ô nhập dùng dấu phẩy thập phân kiểu Việt Nam, không có dấu chấm nghìn.
  const [value, setValue] = useState(item.counted_qty === null ? '' : formatNumber(item.counted_qty, 3).replace(/\./g, ''));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(item.counted_qty === null ? 'idle' : 'saved');
  const [error, setError] = useState('');
  const label = `Số đếm ${item.food_name} (${unitLabel(item.unit)})`;

  const commit = async () => {
    if (!value.trim()) return;
    const n = normalizeDecimalInput(value, { ...QTY_RULE, label: 'Số đếm' });
    if (!n.ok) {
      setState('error');
      setError(n.error);
      return;
    }
    const saved = item.counted_qty === null ? null : parseDec(item.counted_qty);
    const next = parseDec(n.value);
    if (saved && next && cmp(saved, next) === 0) {
      setState('saved');
      return;
    }
    setState('saving');
    setError('');
    try {
      const res = await inventoryApi.countStocktakeItem(item.id, n.value);
      onSaved({ counted_qty: res.counted_qty, variance: res.variance });
      setState('saved');
    } catch (err) {
      setState('error');
      setError(messageOf(err));
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    }
  };

  return (
    <div className={styles.countCell}>
      <input
        className={`${styles.countInput} ${state === 'error' ? styles.countInvalid : ''}`}
        inputMode="decimal"
        aria-label={label}
        aria-invalid={state === 'error' || undefined}
        value={value}
        placeholder="—"
        disabled={!canWrite}
        onChange={(e) => {
          setValue(e.target.value);
          if (state !== 'saving') setState('idle');
        }}
        onBlur={() => void commit()}
        onKeyDown={onKey}
      />
      <span className={styles.countUnit}>{unitLabel(item.unit)}</span>
      <span className={styles.countState} aria-live="polite">
        {state === 'saving' ? 'Đang lưu…' : state === 'saved' ? <IconCheck size={16} title="Đã lưu" /> : null}
      </span>
      {state === 'error' ? (
        <span className={styles.countError} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function VarianceCell({ item }: { item: StocktakeItem }) {
  if (item.counted_qty === null) return <span className={tableText.muted}>Chưa đếm</span>;
  const negative = item.variance.trim().startsWith('-');
  const zero = /^-?0(\.0+)?$/.test(item.variance.trim());
  if (zero) return <Badge tone="ok">Khớp</Badge>;
  return (
    <span className={negative ? styles.varMinus : styles.varPlus}>
      {negative ? '' : '+'}
      {formatQty(item.variance, item.unit)} {negative ? '(thiếu)' : '(thừa)'}
    </span>
  );
}

/* ---------- Bước 3: đã chốt ---------- */
function PostedSummary({ stocktake, onNew }: { stocktake: Stocktake; onNew: () => void }) {
  const changed = stocktake.items.filter((i) => !/^-?0(\.0+)?$/.test(i.variance));
  const columns: Column<StocktakeItem>[] = [
    { key: 'name', header: 'Mặt hàng', width: '40%', cell: (i) => <span className={tableText.primaryText}>{i.food_name}</span> },
    { key: 'book', header: 'Tồn sổ sách', align: 'right', cell: (i) => formatQty(i.snapshot_qty, i.unit) },
    { key: 'count', header: 'Số đếm', align: 'right', cell: (i) => formatQty(i.counted_qty, i.unit) },
    { key: 'var', header: 'Chênh lệch', align: 'right', cell: (i) => <VarianceCell item={i} /> },
  ];
  return (
    <Stack gap="lg">
      <Callout tone="ok" title={`Đã chốt kiểm kê #${stocktake.id}`}>
        {stocktake.posted_at ? `Chốt lúc ${formatDateTime(stocktake.posted_at)}. ` : ''}
        {changed.length ? `${changed.length} mặt hàng có chênh lệch đã được ghi vào sổ kho.` : 'Tất cả mặt hàng khớp sổ sách.'}
      </Callout>
      <DataTable caption={`Kết quả kiểm kê #${stocktake.id}`} rows={stocktake.items} rowKey={(i) => i.id} columns={columns} minWidth="600px" />
      <div className={styles.footer}>
        <Button icon={<IconClipboardList size={18} />} write onClick={onNew}>
          Kiểm kê đợt mới
        </Button>
      </div>
    </Stack>
  );
}
