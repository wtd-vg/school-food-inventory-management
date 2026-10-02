/**
 * Biểu đồ tự vẽ bằng CSS (UI_GUIDE.md, không thư viện): cột theo ngày và thanh cơ cấu chi phí.
 * Chiều cao/độ rộng truyền qua CSS custom property. Mỗi cột là một mục danh sách có nhãn đầy đủ,
 * focus được bằng bàn phím và hiện tooltip; trình đọc màn hình đọc được từng giá trị.
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './Chart.module.css';

/**
 * highlight: ghi giá trị trên đỉnh cột. tone: 'current' (xanh đậm, ví dụ hôm nay), 'over' (san hô = trạng thái vượt mức);
 * mặc định cột xanh nhạt.
 */
export type BarDatum = { key: string; label: string; value: number; display: string; highlight?: boolean; tone?: 'current' | 'over' };

export function BarChart({
  data,
  caption,
  axis,
  compact,
}: {
  data: BarDatum[];
  caption: string;
  axis: (v: number) => string;
  /** Card hẹp: thấp hơn, chỉ ghi nhãn ngày ở cột đầu, cột cuối và cột `highlight`. */
  compact?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const top = niceCeil(max);
  const ticks = [top, top / 2, 0];
  return (
    <figure className={`${styles.chart} ${compact ? styles.compact : ''}`}>
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
            {data.map((d, i) => {
              const pct = top > 0 ? (d.value / top) * 100 : 0;
              const showLabel = !compact || d.highlight || i === 0 || i === data.length - 1;
              return (
                <li key={d.key} className={styles.barCell} tabIndex={0} aria-label={`${d.label}: ${d.display}`}>
                  <span className={`${styles.bar} ${d.tone ? styles[`bar-${d.tone}`] : ''}`} style={{ '--h': `${pct}%` } as CSSProperties}>
                    {/* Card hẹp: số đã có ở ô thống kê phía trên, chỉ hiện khi rê/focus để không tràn mép. */}
                    {d.highlight && !compact ? <span className={styles.barValue}>{d.display}</span> : null}
                  </span>
                  <span className={styles.tip} aria-hidden="true">
                    {d.label}: {d.display}
                  </span>
                  {showLabel ? (
                    <span className={styles.barLabel} aria-hidden="true">
                      {d.label}
                    </span>
                  ) : null}
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

/** tone 1–5 = màu hạng mục theo thứ tự cố định (--chart-1…5, đã kiểm CVD); 'other' = xám cho phần gộp. */
export type Segment = { key: string; label: ReactNode; value: number; display: string; tone: 1 | 2 | 3 | 4 | 5 | 'other' };

/** Thanh cơ cấu: cao 14, khe 2px giữa các đoạn, chú giải kèm số và % (nhãn trực tiếp, không chỉ dựa màu). */
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

/* ---------- Biểu đồ vòng (một phép chia của tổng): khe 2px giữa các đoạn, chú giải kèm số ---------- */
export type DonutSegment = { key: string; label: ReactNode; value: number; display: string; tone: 1 | 2 | 3 | 4 | 5 | 'other' };

export function DonutChart({
  segments,
  caption,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  caption: string;
  centerValue: ReactNode;
  centerLabel: ReactNode;
}) {
  const total = segments.reduce((n, sg) => n + sg.value, 0);
  const r = 46;
  const circ = 2 * Math.PI * r;
  const gap = segments.filter((sg) => sg.value > 0).length > 1 ? 2.5 : 0;
  let offset = 0;
  return (
    <figure className={styles.donutWrap}>
      <div className={styles.donut}>
        <svg viewBox="0 0 120 120" role="img" aria-label={caption}>
          <circle cx="60" cy="60" r={r} className={styles.donutTrack} />
          {total > 0
            ? segments.map((sg) => {
                const len = (sg.value / total) * circ;
                const dash = Math.max(len - gap, 0);
                const el = (
                  <circle
                    key={sg.key}
                    cx="60"
                    cy="60"
                    r={r}
                    className={`${styles.donutSeg} ${styles[`stroke-${sg.tone}`]}`}
                    strokeDasharray={`${dash} ${circ - dash}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 60 60)"
                  />
                );
                offset += len;
                return el;
              })
            : null}
        </svg>
        <span className={styles.donutCenter} aria-hidden="true">
          <span className={`${styles.donutValue} num`}>{centerValue}</span>
          <span className={styles.donutLabel}>{centerLabel}</span>
        </span>
      </div>
      <ul className={styles.donutLegend}>
        {segments.map((sg) => (
          <li key={sg.key} className={styles.donutRow}>
            <span className={styles.legendName}>
              <span className={`${styles.swatch} ${styles[`tone-${sg.tone}`]}`} aria-hidden="true" />
              {sg.label}
            </span>
            <span className={`${styles.legendValue} num`}>{sg.display}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ---------- Thanh ngang (một chuỗi số, một màu): nhãn trái, thanh giữa, số phải ---------- */
export type HBar = { key: string; label: ReactNode; value: number; display: string };

export function HBars({ rows, caption }: { rows: HBar[]; caption: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <ul className={styles.hbars} aria-label={caption}>
      {rows.map((r) => (
        <li key={r.key} className={styles.hbarRow}>
          <span className={styles.hbarLabel}>{r.label}</span>
          <span className={styles.hbarTrack} aria-hidden="true">
            <span className={styles.hbarFill} style={{ '--w': `${max ? (r.value / max) * 100 : 0}%` } as CSSProperties} />
          </span>
          <span className={`${styles.hbarValue} num`}>{r.display}</span>
        </li>
      ))}
    </ul>
  );
}
