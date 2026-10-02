import type { CSSProperties, ReactNode } from 'react';
import styles from './DataTable.module.css';

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
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  caption: string;
  /** Bề rộng tối thiểu trước khi bảng cuộn ngang (màn hẹp). */
  minWidth?: string;
};

/** Bảng theo bản vẽ Kho hàng: header 13/500 muted, hàng cao 52, số căn phải. Caption ẩn cho screen reader. */
export function DataTable<T>({ columns, rows, rowKey, caption, minWidth }: DataTableProps<T>) {
  const style = minWidth ? ({ '--table-min': minWidth } as CSSProperties) : undefined;
  const alignCls = (a?: string) => (a === 'right' ? styles.right : a === 'center' ? styles.center : '');
  return (
    <div className={styles.wrap} role="region" aria-label={caption} tabIndex={0} data-table-card="">
      <table className={styles.table} style={style} role="table">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} className={styles.col} style={c.width ? ({ '--w': c.width } as CSSProperties) : undefined} />
          ))}
        </colgroup>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((c) => (
              <th key={c.key} scope="col" role="columnheader" className={alignCls(c.align)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr key={rowKey(row)} role="row">
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const tableText = styles;
