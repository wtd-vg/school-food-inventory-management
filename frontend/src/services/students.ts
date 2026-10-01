/**
 * Học sinh + email phụ huynh (FE-06): khớp JSON của student_views.py / student_services.py (BE-14).
 * Danh sách chỉ có email đã che (email_hint); email đầy đủ chỉ lấy qua reveal (Quản lý, có ghi nhật ký).
 */
import { api } from '../lib/http';

export type Contact = { id: number; email_hint: string; consent_at: string; unsubscribed_at: string | null };

export type Student = {
  id: number;
  full_name: string;
  class_id: number;
  class_code: string;
  is_active: boolean;
  contacts: Contact[];
};

/** contacts: gửi đủ danh sách muốn giữ (tối đa 2); consent phải là true thì backend mới lưu. */
export type StudentInput = { full_name: string; class_id: number; contacts?: { email: string; consent: boolean }[] };

export type ImportRow = {
  line: number;
  full_name: string;
  class_code: string;
  emails: number;
  status: 'ok' | 'error';
  errors: Record<string, string>;
};

export type ImportResult = {
  rows: ImportRow[];
  summary: { rows: number; ok: number; errors: number; with_email: number };
  saved: boolean;
  dry_run?: boolean;
  message?: string;
};

export const CSV_COLUMNS = ['ho_ten', 'ma_lop', 'email_1', 'email_2', 'da_dong_y'] as const;
export const CSV_MAX_BYTES = 1024 * 1024;

export const studentsApi = {
  list: (classId: string) =>
    api.get<{ results: Student[] }>(`/api/students/${classId ? `?class=${encodeURIComponent(classId)}` : ''}`).then((r) => r.results),
  create: (body: StudentInput) => api.post<Student>('/api/students/', body),
  update: (id: number, body: Partial<StudentInput>) => api.patch<Student>(`/api/students/${id}/`, body),
  remove: (id: number) => api.delete<{ message: string }>(`/api/students/${id}/`),
  reveal: (contactId: number) => api.post<{ id: number; email: string }>(`/api/parent-contacts/${contactId}/reveal/`),
  /** multipart file=CSV; dryRun=true chỉ kiểm tra. Có dòng lỗi khi lưu thật → 400 kèm rows/summary. */
  importCsv: (file: File, dryRun: boolean) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportResult>(`/api/students/import/${dryRun ? '?dry_run=1' : ''}`, form);
  },
};
