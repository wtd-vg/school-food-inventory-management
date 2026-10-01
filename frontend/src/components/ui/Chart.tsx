/**
 * Biểu đồ tự vẽ bằng CSS (UI_GUIDE.md, không thư viện): cột theo ngày và thanh cơ cấu chi phí.
 * Chiều cao/độ rộng truyền qua CSS custom property. Mỗi cột là một mục danh sách có nhãn đầy đủ,
 * focus được bằng bàn phím và hiện tooltip; trình đọc màn hình đọc được từng giá trị.
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './Chart.module.css';

/** highlight: ghi giá trị trên đỉnh cột (không đổi màu; màu đỏ dành cho "vượt mức"). */
export type BarDatum = { key: string; label: string; value: number; display: string; highlight?: boolean };

export function BarChart({ data, caption, axis }: { data: BarDatum[]; caption: string; axis: (v: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const top = niceCeil(max);
  const ticks = [top, top / 2, 0];
  return (
    <figure className={styles.chart}>
      <div className={styles.plot}>
        <div className={styles.axis} aria-hidden="true">
          {ticks.map((t, i) => (
            <span key={i}>{axis(t)}</span>
          ))}
        </div>
        <div className={styles.area}>
          <div className={styles.grid} aria-hidden="true">
            {ticks.map((_, i) => (
              <span key={i} />
            ))}
          </div>
          <ol className={styles.bars} aria-label={caption}>
            {data.map((d) => {
              const pct = top > 0 ? (d.value / top) * 100 : 0;
              return (
                <li key={d.key} className={styles.barCell} tabIndex={0} aria-label={`${d.label}: ${d.display}`}>
                  <span className={styles.bar} style={{ '--h': `${pct}%` } as CSSProperties}>
                    {d.highlight ? <span className={styles.barValue}>{d.display}</span> : null}
                  </span>
                  <span className={styles.tip} aria-hidden="true">
                    {d.label}: {d.display}
                  </span>
                  <span className={styles.barLabel} aria-hidden="true">
                    {d.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </figure>
  );
}

/** Làm tròn trục lên số "đẹp": 1, 2, 2.5, 5 × 10^n. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * base) return m * base;
  }
  return 10 * base;
}

export type Segment = { key: string; label: ReactNode; value: number; display: string; tone: 'protein' | 'veg' | 'dry' | 'dairy' | 'other' };

/** Thanh cơ cấu (bản vẽ 08 "Chi vào đâu"): cao 12, bo tròn, các đoạn màu + chú giải. */
export function CostBar({ segments, caption }: { segments: Segment[]; caption: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <figure className={styles.costWrap}>
      <div className={styles.costBar} role="img" aria-label={caption}>
        {segments.map((s) => (
          <span key={s.key} className={`${styles.segment} ${styles[`tone-${s.tone}`]}`} style={{ '--w': `${total ? (s.value / total) * 100 : 0}%` } as CSSProperties} />
        ))}
      </div>
      <ul className={styles.legend}>
        {segments.map((s) => (
          <li key={s.key} className={styles.legendRow}>
            <span className={styles.legendName}>
              <span className={`${styles.swatch} ${styles[`tone-${s.tone}`]}`} aria-hidden="true" />
              {s.label}
            </span>
            <span className={`${styles.legendValue} num`}>
              {s.display}
              <span className={styles.legendPct}> · {total ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
