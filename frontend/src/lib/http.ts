/**
 * Lớp gọi API cho UI mới. Mọi request vẫn đi qua fetchApi (session cookie, CSRF,
 * sự kiện session-expired). Chuẩn hoá lỗi thành ApiError với câu tiếng Việt.
 */
import { fetchApi } from '../utils/api';

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;
  body: unknown;
  constructor(status: number, message: string, errors: Record<string, string> = {}, body?: unknown) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.body = body;
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
  401: 'Phiên làm việc đã hết. Vui lòng đăng nhập lại.',
  403: 'Tài khoản của bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu. Có thể mục này đã bị thay đổi.',
  405: 'Thao tác này không được hỗ trợ.',
  409: 'Dữ liệu vừa được thay đổi ở nơi khác. Hãy tải lại rồi thử lại.',
};

/** Một số câu lỗi tiếng Anh của backend hiện có, dịch để người dùng hiểu. */
const KNOWN_MESSAGES: Array<[RegExp, string]> = [
  [/code already exists/i, 'Mã này đã tồn tại. Hãy dùng mã khác.'],
  [/class code already exists/i, 'Mã lớp đã tồn tại.'],
  [/dish code already exists/i, 'Mã món đã tồn tại.'],
  [/code and name are required/i, 'Mã và tên là bắt buộc.'],
  [/name cannot be empty/i, 'Tên không được để trống.'],
  [/code cannot be empty/i, 'Mã không được để trống.'],
  [/unit cannot be empty/i, 'Đơn vị không được để trống.'],
  [/cannot deactivate category/i, 'Không thể ngừng dùng danh mục vì vẫn còn mặt hàng thuộc danh mục này.'],
  [/empty recipe/i, 'Công thức phải có ít nhất một nguyên liệu.'],
  [/duplicate food in components/i, 'Một nguyên liệu bị lặp trong công thức.'],
  [/cannot convert (\w+) to (\w+)/i, 'Đơn vị nhập không quy đổi được sang đơn vị kho của nguyên liệu.'],
  [/invalid number format/i, 'Số lượng không hợp lệ.'],
  [/permission denied/i, STATUS_MESSAGES[403]],
  [/food_ids list is required/i, 'Hãy chọn ít nhất một mặt hàng để kiểm kê.'],
  [/lines must be a non-empty list/i, 'Phiếu phải có ít nhất một dòng hàng.'],
  [/supplier_id must be a positive integer/i, 'Hãy chọn nhà cung cấp.'],
  [/date is required/i, 'Hãy chọn ngày chứng từ.'],
];

function flatten(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(' ');
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(flatten).filter(Boolean).join(' ');
  }
  return '';
}

function translate(message: string): string {
  for (const [re, vi] of KNOWN_MESSAGES) {
    if (re.test(message)) return vi;
  }
  return message;
}

/** Lấy câu lỗi từ body (message | error: string/list/dict) hoặc câu mặc định theo mã HTTP. */
export function errorMessageFrom(status: number, body: unknown): string {
  let raw = '';
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    raw = flatten(b.message) || flatten(b.error);
  }
  raw = raw.trim();
  if (raw) return translate(raw);
  if (status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau ít phút.';
  return STATUS_MESSAGES[status] ?? 'Có lỗi xảy ra. Vui lòng thử lại.';
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function apiRequest<T>(url: string, method: Method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetchApi(url, {
      method,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const raw = data && typeof data === 'object' ? (data as { errors?: unknown }).errors : null;
    const errors = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, flatten(value)])) : {};
    throw new ApiError(response.status, errorMessageFrom(response.status, data), errors, data);
  }
  return data as T;
}

export const api = {
  delete: <T>(url: string) => apiRequest<T>(url, 'DELETE'),
  get: <T>(url: string) => apiRequest<T>(url, 'GET'),
  post: <T>(url: string, body?: unknown) => apiRequest<T>(url, 'POST', body ?? {}),
  patch: <T>(url: string, body: unknown) => apiRequest<T>(url, 'PATCH', body),
  put: <T>(url: string, body: unknown) => apiRequest<T>(url, 'PUT', body),
};

export function fieldsOf(err: unknown): Record<string, string> {
  return err instanceof ApiError ? err.errors : {};
}

export function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Có lỗi xảy ra. Vui lòng thử lại.';
}
