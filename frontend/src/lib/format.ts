/**
 * Định dạng hiển thị vi-VN (UI_GUIDE.md). Nhận chuỗi Decimal từ API, không đổi sang float.
 *   Khối lượng: 338,8 kg · Tiền: 29.500 đ · Ngày: 01/10/2026 hoặc 1/10 · Số âm dùng dấu trừ thật (−).
 */
import { parseDec, round, type Dec } from './decimal';

const MINUS = '−';
const TZ = 'Asia/Ho_Chi_Minh';

function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function decToVi(d: Dec, opts: { maxDp: number; minDp?: number }): string {
  const r = round(d, opts.maxDp);
  const neg = r.v < 0n;
  const digits = (neg ? -r.v : r.v).toString().padStart(r.s + 1, '0');
  const intPart = digits.slice(0, digits.length - r.s);
  let frac = r.s > 0 ? digits.slice(-r.s) : '';
  const minDp = opts.minDp ?? 0;
  while (frac.length > minDp && frac.endsWith('0')) frac = frac.slice(0, -1);
  const body = groupThousands(intPart) + (frac ? `,${frac}` : '');
  return `${neg ? MINUS : ''}${body}`;
}

/** Số thường: "1234.500" → "1.234,5". value có thể là số nguyên JS. */
export function formatNumber(value: string | number | null | undefined, maxDp = 3): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = parseDec(String(value));
  if (!d) return String(value);
  return decToVi(d, { maxDp });
}

const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  lit: 'lít',
  l: 'lít',
  ml: 'ml',
  piece: 'cái',
};

export function unitLabel(unit: string | null | undefined): string {
  if (!unit) return '';
  return UNIT_LABELS[unit.toLowerCase()] ?? unit;
}

/** Khối lượng: "338.800", "kg" → "338,8 kg". */
export function formatQty(value: string | null | undefined, unit?: string | null): string {
  const n = formatNumber(value, 3);
  if (n === '—') return n;
  const u = unitLabel(unit);
  return u ? `${n} ${u}` : n;
}

/** Tiền: "29500.00" → "29.500 đ"; giữ phần lẻ nếu khác 0. */
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = parseDec(String(value));
  if (!d) return String(value);
  return `${decToVi(d, { maxDp: 2 })} đ`;
}

/** Tiền rút gọn cho biểu đồ/tóm tắt: 403600000 → "403,6 triệu đ". */
export function formatMoneyShort(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = parseDec(String(value));
  if (!d) return String(value);
  const abs = d.v < 0n ? -d.v : d.v;
  const whole = abs / 10n ** BigInt(d.s);
  if (whole >= 1_000_000_000n) return `${decToVi({ v: d.v, s: d.s + 9 }, { maxDp: 1 })} tỷ đ`;
  if (whole >= 1_000_000n) return `${decToVi({ v: d.v, s: d.s + 6 }, { maxDp: 1 })} triệu đ`;
  return formatMoney(value);
}

/** Ngày chứng từ "2026-10-01" → "01/10/2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Ngày ngắn "2026-10-01" → "1/10". */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])}/${Number(m[2])}`;
}

/** Thời điểm ISO → "9:40, 29/9/2026" theo giờ Việt Nam. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${Number(get('hour'))}:${get('minute')}, ${get('day')}/${get('month')}/${get('year')}`;
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD cho API. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/** "Thứ Tư, 1 tháng 10" cho dòng phụ trên tiêu đề trang. */
export function formatLongToday(): string {
  const s = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Số đếm có đơn vị: (86, "mặt hàng") → "86 mặt hàng". */
export function countLabel(n: number, noun: string): string {
  return `${formatNumber(n, 0)} ${noun}`;
}
