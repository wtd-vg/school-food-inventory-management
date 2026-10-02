import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { IconSort, IconSortDown, IconSortUp } from '../icons';
import styles from './DataTable.module.css';

export type SortValue = string | number | null | undefined;
export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Độ rộng cột, ví dụ "22%" hoặc "120px" (table-layout: fixed). */
  width?: string;
  /** Cho phép xuống dòng thay vì cắt "…". */
  wrap?: boolean;
  className?: string;
  /** Giá trị để sắp xếp; có thì tiêu đề cột thành nút sắp xếp (tăng → giảm → bỏ). */
  sort?: (row: T) => SortValue;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  caption: string;
  /** Bề rộng tối thiểu trước khi bảng cuộn ngang (màn hẹp). */
  minWidth?: string;
  /** Chọn dòng: tập khoá đang chọn + hàm đổi; có thì thêm cột checkbox đầu bảng. */
  selected?: Set<string | number>;
  onSelectedChange?: (next: Set<string | number>) => void;
  /** Nhãn checkbox từng dòng cho trình đọc màn hình, ví dụ tên mặt hàng. */
  selectLabel?: (row: T) => string;
  /** Sắp xếp có kiểm soát (khi trang tự phân trang và cần sắp trước khi cắt trang). */
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
};

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

/** So sánh giá trị sắp xếp: số theo số, chữ theo thứ tự tiếng Việt, ô rỗng luôn xuống cuối. */
export function compareSort(a: SortValue, b: SortValue): number {
  const ea = a === null || a === undefined || a === '';
  const eb = b === null || b === undefined || b === '';
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/** Sắp xếp mảng theo cột (dùng được ở trang tự phân trang). */
export function sortRows<T>(rows: T[], columns: Column<T>[], sort: SortState): T[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.key === sort.key);
  if (!col?.sort) return rows;
  const get = col.sort;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((x, y) => {
    const a = get(x);
    const b = get(y);
    const empty = (v: SortValue) => v === null || v === undefined || v === '';
    if (empty(a) || empty(b)) return compareSort(a, b); // ô rỗng cuối dù tăng hay giảm
    return sign * compareSort(a, b);
  });
}

export function nextSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

/**
 * Bảng SF78: tiêu đề cột trong dải nền nhạt bo 10, chữ 12.5 màu phụ; hàng cao 46 kẻ dưới mảnh;
 * cột có `sort` thì bấm tiêu đề để sắp xếp (aria-sort); có `selected` thì thêm checkbox, dòng chọn nền mint.
 * Trên điện thoại mỗi dòng thành một thẻ. Caption ẩn cho trình đọc màn hình.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  minWidth,
  selected,
  onSelectedChange,
  selectLabel,
  sort: sortProp,
  onSortChange,
}: DataTableProps<T>) {
  const [innerSort, setInnerSort] = useState<SortState>(null);
  const controlled = onSortChange !== undefined;
  const sort = controlled ? sortProp ?? null : innerSort;
  const setSort = (next: SortState) => (controlled ? onSortChange(next) : setInnerSort(next));
  const shown = useMemo(() => (controlled ? rows : sortRows(rows, columns, sort)), [controlled, rows, columns, sort]);

  const selectable = Boolean(selected && onSelectedChange);
  const keys = shown.map(rowKey);
  const checkedCount = selectable ? keys.filter((k) => selected!.has(k)).length : 0;
  const allRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = checkedCount > 0 && checkedCount < keys.length;
  }, [checkedCount, keys.length]);

  const toggle = (k: string | number) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onSelectedChange?.(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    if (checkedCount === keys.length) keys.forEach((k) => next.delete(k));
    else keys.forEach((k) => next.add(k));
    onSelectedChange?.(next);
  };

  const style = minWidth ? ({ '--table-min': minWidth } as CSSProperties) : undefined;
  const alignCls = (a?: string) => (a === 'right' ? styles.right : a === 'center' ? styles.center : '');
  const ariaSort = (c: Column<T>) =>
    c.sort ? (sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined;

  return (
    <div className={styles.wrap} role="region" aria-label={caption} tabIndex={0}>
      <table className={styles.table} style={style} role="table">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {selectable ? <col className={styles.checkCol} /> : null}
          {columns.map((c) => (
            <col key={c.key} className={styles.col} style={c.width ? ({ '--w': c.width } as CSSProperties) : undefined} />
          ))}
        </colgroup>
        <thead role="rowgroup">
          <tr role="row">
            {selectable ? (
              <th scope="col" role="columnheader" className={styles.checkCell}>
                <input
                  ref={allRef}
                  type="checkbox"
                  className={styles.check}
                  aria-label="Chọn tất cả dòng đang hiện"
                  checked={keys.length > 0 && checkedCount === keys.length}
                  disabled={keys.length === 0}
                  onChange={toggleAll}
                />
              </th>
            ) : null}
            {columns.map((c) => (
              <th key={c.key} scope="col" role="columnheader" className={alignCls(c.align)} aria-sort={ariaSort(c)}>
                {c.sort ? (
                  <button type="button" className={styles.sortBtn} onClick={() => setSort(nextSort(sort, c.key))}>
                    {c.header}
                    {sort?.key === c.key ? (
                      sort.dir === 'asc' ? (
                        <IconSortUp size={13} className={styles.sortIconOn} />
                      ) : (
                        <IconSortDown size={13} className={styles.sortIconOn} />
                      )
                    ) : (
                      <IconSort size={13} className={styles.sortIcon} />
                    )}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {shown.map((row) => {
            const k = rowKey(row);
            const isSel = selectable && selected!.has(k);
            return (
              <tr key={k} role="row" className={isSel ? styles.selectedRow : undefined}>
                {selectable ? (
                  <td role="cell" className={styles.checkCell}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      aria-label={`Chọn ${selectLabel ? selectLabel(row) : `dòng ${k}`}`}
                      checked={isSel}
                      onChange={() => toggle(k)}
                    />
                  </td>
                ) : null}
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    role="cell"
                    // Trên điện thoại bảng thành thẻ: cột đầu là tiêu đề thẻ, các cột khác có nhãn đi kèm.
                    data-label={i > 0 && typeof c.header === 'string' ? c.header : undefined}
                    className={[alignCls(c.align), c.wrap ? styles.wrapText : '', i === 0 ? styles.firstCell : '', c.className ?? ''].join(' ')}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const tableText = styles;
