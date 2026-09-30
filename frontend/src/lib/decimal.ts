/**
 * Số thập phân chính xác cho UI, không dùng float (README.md §5.3).
 * Giá trị = v / 10^s. Chỉ dùng để xem trước tổng tiền, kiểm tra ô nhập;
 * con số chính thức luôn do backend tính và trả về dạng chuỗi.
 */
export type Dec = { v: bigint; s: number };

const DEC_RE = /^-?\d+(\.\d+)?$/;

/** Nhận "1234.5", "1234,5" hoặc "-0.25"; trả null nếu không phải số thập phân hợp lệ. */
export function parseDec(input: string): Dec | null {
  const t = input.trim().replace(',', '.');
  if (!DEC_RE.test(t)) return null;
  const neg = t.startsWith('-');
  const [intPart, frac = ''] = (neg ? t.slice(1) : t).split('.');
  const v = BigInt(intPart + frac);
  return { v: neg ? -v : v, s: frac.length };
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

function align(a: Dec, b: Dec): [bigint, bigint, number] {
  const s = Math.max(a.s, b.s);
  return [a.v * pow10(s - a.s), b.v * pow10(s - b.s), s];
}

export function add(a: Dec, b: Dec): Dec {
  const [x, y, s] = align(a, b);
  return { v: x + y, s };
}

export function sub(a: Dec, b: Dec): Dec {
  const [x, y, s] = align(a, b);
  return { v: x - y, s };
}

export function mul(a: Dec, b: Dec): Dec {
  return { v: a.v * b.v, s: a.s + b.s };
}

export function cmp(a: Dec, b: Dec): number {
  const [x, y] = align(a, b);
  return x === y ? 0 : x > y ? 1 : -1;
}

export const ZERO: Dec = { v: 0n, s: 0 };

/** Làm tròn ROUND_HALF_UP (0,5 làm tròn ra xa số 0), giống Decimal phía backend. */
export function round(d: Dec, dp: number): Dec {
  if (d.s <= dp) return { v: d.v * pow10(dp - d.s), s: dp };
  const factor = pow10(d.s - dp);
  const abs = d.v < 0n ? -d.v : d.v;
  let q = abs / factor;
  if ((abs % factor) * 2n >= factor) q += 1n;
  return { v: d.v < 0n ? -q : q, s: dp };
}

/** Chuỗi kiểu API: "1234.500" (dp chữ số lẻ). */
export function toFixed(d: Dec, dp: number): string {
  const r = round(d, dp);
  const neg = r.v < 0n;
  const digits = (neg ? -r.v : r.v).toString().padStart(dp + 1, '0');
  const intPart = digits.slice(0, digits.length - dp);
  const frac = dp > 0 ? `.${digits.slice(-dp)}` : '';
  return `${neg ? '-' : ''}${intPart}${frac}`;
}

export function sum(values: Dec[]): Dec {
  return values.reduce(add, ZERO);
}

/**
 * Kiểm tra ô nhập số trước khi gửi API. Trả chuỗi chuẩn hoá (dấu chấm) hoặc lỗi tiếng Việt.
 * maxDp: số chữ số lẻ tối đa của cột (lượng 3, tiền 2).
 */
export function normalizeDecimalInput(
  input: string,
  opts: { maxDp: number; maxIntDigits?: number; positive?: boolean; allowZero?: boolean; label?: string },
): { ok: true; value: string } | { ok: false; error: string } {
  const label = opts.label ?? 'Giá trị';
  if (!input.trim()) return { ok: false, error: `${label} là bắt buộc.` };
  const d = parseDec(input);
  if (!d) return { ok: false, error: `${label} phải là số, ví dụ 12,5.` };
  if (d.s > opts.maxDp) {
    return { ok: false, error: `${label} chỉ được tối đa ${opts.maxDp} chữ số sau dấu phẩy.` };
  }
  if (opts.maxIntDigits !== undefined) {
    const abs = d.v < 0n ? -d.v : d.v;
    const intDigits = (abs / 10n ** BigInt(d.s)).toString().length;
    if (intDigits > opts.maxIntDigits) return { ok: false, error: `${label} quá lớn.` };
  }
  if (d.v < 0n) return { ok: false, error: `${label} không được âm.` };
  if (opts.positive && d.v === 0n && !opts.allowZero) {
    return { ok: false, error: `${label} phải lớn hơn 0.` };
  }
  return { ok: true, value: toFixed(d, d.s) };
}
