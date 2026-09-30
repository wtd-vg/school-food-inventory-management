import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconPlus, IconTrash } from '../../components/icons';
import { Badge, Button, IconButton, SelectField, TextField } from '../../components/ui';
import { cmp, mul, parseDec, round, sum, toFixed, type Dec } from '../../lib/decimal';
import { formatMoney, formatQty, unitLabel } from '../../lib/format';
import type { DocStatus, Food } from '../../services/inventory';
import styles from './shared.module.css';

/** Ngăn kéo điều khiển bằng query string (?phieu=12, ?tao=1) để có thể chia sẻ link và bấm Back. */
export function useQueryParam(name: string): [string | null, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(name);
  const set = useCallback(
    (next: string | null) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === null) p.delete(name);
          else p.set(name, next);
          return p;
        },
        { replace: false },
      );
    },
    [name, setParams],
  );
  return [value, set];
}

/** Đổi nhiều query param trong MỘT lần điều hướng (gọi setSearchParams liên tiếp sẽ ghi đè nhau). */
export function useUpdateParams(): (patch: Record<string, string | null>) => void {
  const [, setParams] = useSearchParams();
  return useCallback(
    (patch) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) p.delete(k);
          else p.set(k, v);
        }
        return p;
      });
    },
    [setParams],
  );
}

/** Sau khi kiểm tra form thất bại: đưa focus tới ô lỗi đầu tiên (sau khi React render lỗi). */
export function focusFirstInvalid(formId: string) {
  window.requestAnimationFrame(() => {
    document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}

export function DocStatusBadge({ status }: { status: DocStatus | 'draft' | 'posted' }) {
  const posted = status.toUpperCase() === 'POSTED';
  return posted ? <Badge tone="ok">Đã chốt</Badge> : <Badge tone="warn">Nháp</Badge>;
}

export type DraftLine = { key: number; foodId: string; quantity: string; unitPrice: string };

let lineSeq = 1;
export function newLine(foodId = ''): DraftLine {
  return { key: lineSeq++, foodId, quantity: '', unitPrice: '' };
}

/** Tổng tạm tính (Decimal, không float). Dòng chưa hợp lệ tính như 0. */
export function draftTotal(lines: DraftLine[]): string {
  const parts: Dec[] = lines.map((l) => {
    const q = parseDec(l.quantity);
    const p = parseDec(l.unitPrice);
    return q && p ? round(mul(q, p), 2) : { v: 0n, s: 0 };
  });
  return toFixed(sum(parts), 2);
}

type LinesEditorProps = {
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  foods: Food[];
  withPrice: boolean;
  errors: Record<number, { food?: string; quantity?: string; unitPrice?: string }>;
  /** Phiếu xuất: nhắc khi số lượng lớn hơn tồn hiện tại. */
  warnOverStock?: boolean;
};

/** Bảng soạn dòng hàng của phiếu nhập/xuất. Mỗi mặt hàng chỉ một dòng (unique trên DB). */
export function LinesEditor({ lines, onChange, foods, withPrice, errors, warnOverStock }: LinesEditorProps) {
  const foodById = useMemo(() => new Map(foods.map((f) => [String(f.id), f])), [foods]);
  const used = new Set(lines.map((l) => l.foodId).filter(Boolean));

  const update = (key: number, patch: Partial<DraftLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: number) => onChange(lines.filter((l) => l.key !== key));

  return (
    <div className={styles.lines}>
      <ol className={styles.lineList}>
        {lines.map((line, index) => {
          const food = foodById.get(line.foodId);
          const err = errors[line.key] ?? {};
          const unit = food ? unitLabel(food.unit) : '';
          const q = parseDec(line.quantity);
          const stock = food ? parseDec(food.quantity) : null;
          const over = Boolean(warnOverStock && q && stock && cmp(q, stock) > 0);
          const lineTotal =
            withPrice && q && parseDec(line.unitPrice) ? toFixed(round(mul(q, parseDec(line.unitPrice)!), 2), 2) : null;
          return (
            <li key={line.key} className={styles.line}>
              <div className={styles.lineHead}>
                <span className={styles.lineNo}>Dòng {index + 1}</span>
                {lines.length > 1 ? (
                  <IconButton label={`Xoá dòng ${index + 1}`} ghost onClick={() => remove(line.key)}>
                    <IconTrash size={18} />
                  </IconButton>
                ) : null}
              </div>
              <div className={withPrice ? styles.lineGrid3 : styles.lineGrid2}>
                <SelectField
                  label="Mặt hàng"
                  value={line.foodId}
                  onChange={(e) => update(line.key, { foodId: e.target.value })}
                  error={err.food}
                  required
                  fieldClassName={styles.foodField}
                >
                  <option value="">Chọn mặt hàng</option>
                  {foods.map((f) => (
                    <option key={f.id} value={String(f.id)} disabled={used.has(String(f.id)) && String(f.id) !== line.foodId}>
                      {f.name} ({unitLabel(f.unit)}){warnOverStock ? ` · tồn ${formatQty(f.quantity, f.unit)}` : ''}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="Số lượng"
                  numeric
                  suffix={unit}
                  value={line.quantity}
                  onChange={(e) => update(line.key, { quantity: e.target.value })}
                  error={err.quantity}
                  placeholder="0"
                  required
                />
                {withPrice ? (
                  <TextField
                    label="Đơn giá"
                    numeric
                    suffix={unit ? `đ/${unit}` : 'đ'}
                    value={line.unitPrice}
                    onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                    error={err.unitPrice}
                    placeholder="0"
                    required
                  />
                ) : null}
              </div>
              {over && !err.quantity ? (
                <p className={styles.lineWarn}>
                  Nhiều hơn tồn hiện tại ({formatQty(food!.quantity, food!.unit)}). Phiếu nháp vẫn lưu được nhưng sẽ không chốt được.
                </p>
              ) : null}
              {lineTotal ? <p className={`${styles.lineTotal} num`}>Thành tiền {formatMoney(lineTotal)}</p> : null}
            </li>
          );
        })}
      </ol>
      <Button
        variant="secondary"
        size="sm"
        icon={<IconPlus size={16} />}
        onClick={() => onChange([...lines, newLine()])}
        disabled={lines.length >= foods.length}
      >
        Thêm dòng
      </Button>
    </div>
  );
}
