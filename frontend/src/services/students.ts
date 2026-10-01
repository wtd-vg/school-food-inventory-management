import { api } from '../lib/http';
export type Contact = { id: number; email_hint: string; consent_at: string; unsubscribed_at: string | null };
export type Student = { id: number; full_name: string; class_id: number; class_code: string; is_active: boolean; contacts: Contact[] };
export type StudentInput = { full_name: string; class_id: number; contacts?: { email: string; consent: boolean }[] };
export type ImportResult = { rows: { line: number; full_name: string; class_code: string; emails: number; status: 'ok' | 'error'; errors: Record<string, string> }[]; summary: { rows: number; ok: number; errors: number; with_email: number }; saved: boolean; dry_run?: boolean };
export const studentsApi = {
  list: (classId: string) => api.get<{ results: Student[] }>(`/api/students/?class=${encodeURIComponent(classId)}`).then(r => r.results),
  create: (body: StudentInput) => api.post<Student>('/api/students/', body),
  update: (id: number, body: Partial<StudentInput>) => api.patch<Student>(`/api/students/${id}/`, body),
  delete: (id: number) => api.delete(`/api/students/${id}/`),
  reveal: (id: number) => api.post<{ email: string }>(`/api/parent-contacts/${id}/reveal/`),
  import: (file: File, dryRun: boolean) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportResult>(`/api/students/import/${dryRun ? '?dry_run=1' : ''}`, form);
  },
};
