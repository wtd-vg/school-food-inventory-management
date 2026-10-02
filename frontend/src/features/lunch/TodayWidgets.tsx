/**
 * SF78: khối số liệu màn Hôm nay (kiểu "số + biểu đồ + chia nhỏ", không dùng hàng thẻ KPI).
 * - MealsRing: vòng tròn suất ăn chia theo lớp + bảng dự kiến/thực tế từng lớp.
 * - IssueBars: chi phí ngày, chi phí/suất, và thanh "đã xuất / cần" của từng nguyên liệu.
 * Màu phẳng từ tokens (--series-*), không gradient. Tỉ lệ thanh/vòng chỉ để vẽ, không dùng để tính tiền.
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney, formatMoneyShort, formatNumber, formatQty } from '../../lib/format';
import type { DayCost } from '../../services/lunch';
import type { MealDay } from '../../services/meals';
import styles from './TodayWidgets.module.css';

const SERIES = 7;
const STAFF_LABEL = 'Nhân viên';

type Slice = { key: string; label: string; planned: number | null; actual: number | null };

/** Vòng tròn chia theo lớp: lấy thực tế nếu đã chốt, không thì dự kiến. */
export function MealsRing({ meal, date }: { meal: MealDay | undefined; date: string }) {
  if (!meal || meal.status === 'not_open') {
    return (
      <section className={styles.panel} aria-labelledby="w-meals">
        <h2 className={styles.panelTitle} id="w-meals">
          Suất ăn
        </h2>
        <div className={styles.empty}>
          <p>Ngày chưa mở</p>
          <Link className={styles.link} to={`/lop-hoc/so-suat?ngay=${date}`}>
            Mở ngày
          </Link>
        </div>
      </section>
    );
  }
  const useActual = Boolean(meal.actual_confirmed_at);
  const slices: Slice[] = [
    ...meal.lines.map((l) => ({ key: String(l.class_id), label: l.class_code, planned: l.planned, actual: l.actual })),
    { key: 'staff', label: STAFF_LABEL, planned: meal.staff_planned, actual: meal.staff_actual },
  ];
  const value = (sl: Slice) => (useActual ? sl.actual : sl.planned) ?? 0;
  const total = slices.reduce((sum, sl) => sum + value(sl), 0);
  const headline = useActual ? meal.actual_total : meal.planned_total;

  // Vòng: mỗi lát một cung, chừa khe 1,2% giữa các lát.
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = slices
    .map((sl, i) => {
      const share = total > 0 ? value(sl) / total : 0;
      const len = Math.max(0, share * C - (share > 0 ? C * 0.012 : 0));
      const arc = { key: sl.key, i, len, offset };
      offset += share * C;
      return arc;
    })
    .filter((a) => a.len > 0);

  return (
    <section className={styles.panel} aria-labelledby="w-meals">
      <h2 className={styles.panelTitle} id="w-meals">
        Suất ăn
      </h2>
      <div className={styles.ringRow}>
        <div className={styles.ring}>
          <svg viewBox="0 0 140 140" role="img" aria-label={`${formatNumber(headline ?? 0, 0)} suất, chia theo lớp`}>
            <circle cx="70" cy="70" r={R} className={styles.ringTrack} />
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx="70"
                cy="70"
                r={R}
                className={styles.ringArc}
                style={{ '--c': `var(--series-${(a.i % SERIES) + 1})`, strokeDasharray: `${a.len} ${C}`, strokeDashoffset: -a.offset } as CSSProperties}
              />
            ))}
          </svg>
          <div className={styles.ringCenter}>
            <span className={styles.ringValue}>{headline != null ? formatNumber(headline, 0) : '—'}</span>
            <span className={styles.ringLabel}>{useActual ? 'thực tế' : meal.planned_confirmed_at ? 'dự kiến' : 'chưa chốt'}</span>
          </div>
        </div>
        <table className={styles.legend}>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Lớp</span>
              </th>
              <th scope="col">Dự kiến</th>
              <th scope="col">Thực tế</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((sl, i) => (
              <tr key={sl.key}>
                <th scope="row">
                  <span className={styles.swatch} style={{ '--c': `var(--series-${(i % SERIES) + 1})` } as CSSProperties} aria-hidden="true" />
                  {sl.label}
                </th>
                <td>{sl.planned ?? '—'}</td>
                <td>{sl.actual ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Chi phí và độ đủ của phiếu xuất: mỗi nguyên liệu một thanh đã xuất / cần. */
export function IssueBars({ cost, date }: { cost: DayCost | null; date: string }) {
  const foods = cost?.foods ?? [];
  const ratio = (issued: string, required: string) => {
    const req = parseFloat(required);
    if (!(req > 0)) return parseFloat(issued) > 0 ? 1 : 0;
    return Math.min(1, parseFloat(issued) / req);
  };
  const rows = foods
    .map((f) => ({ ...f, r: ratio(f.issued, f.required) }))
    .sort((a, b) => a.r - b.r || parseFloat(b.required) - parseFloat(a.required));
  const full = rows.filter((f) => f.r >= 1).length;
  const shown = rows.slice(0, 7);

  return (
    <section className={styles.panel} aria-labelledby="w-issue">
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle} id="w-issue">
          Xuất bếp
        </h2>
        <Link className={styles.link} to={`/bua-trua/xuat-bep?ngay=${date}`}>
          Chi tiết
        </Link>
      </div>
      <dl className={styles.figures}>
        <div>
          <dd>{cost ? formatMoneyShort(cost.cost) : '—'}</dd>
          <dt>Chi phí ngày</dt>
        </div>
        <div>
          <dd>{cost?.cost_per_serving ? formatMoney(cost.cost_per_serving) : '—'}</dd>
          <dt>Chi phí / suất</dt>
        </div>
        <div>
          <dd>
            {full}/{rows.length}
          </dd>
          <dt>Đã xuất đủ</dt>
        </div>
      </dl>
      {shown.length ? (
        <ul className={styles.bars}>
          {shown.map((f) => (
            <li key={f.food_id} className={styles.barRow}>
              <span className={styles.barName}>{f.food_name}</span>
              <span className={styles.barTrack} aria-hidden="true">
                <span
                  className={`${styles.barFill} ${f.r >= 1 ? styles.barOk : f.r > 0 ? styles.barPart : ''}`}
                  style={{ '--w': `${Math.round(f.r * 100)}%` } as CSSProperties}
                />
              </span>
              <span className={styles.barValue}>
                {formatQty(f.issued, f.unit)} / {formatQty(f.required, f.unit)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <p>Chưa có nhu cầu đã duyệt</p>
        </div>
      )}
      {rows.length > shown.length ? <p className={styles.more}>và {rows.length - shown.length} nguyên liệu khác</p> : null}
    </section>
  );
}
