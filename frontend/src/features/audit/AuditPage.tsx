import { useSearchParams } from 'react-router-dom';
import { Button, DataTable, Drawer, EmptyState, ErrorState, KeyValueList, PageHeader, Pagination, SelectField, Skeleton, Stack, TextField, Toolbar } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useApiQuery } from '../../lib/useApiQuery';
import { administrationApi } from '../../services/administration';
import { useQueryParam, useUpdateParams } from '../inventory/shared';

const special: Record<string, string> = {
  login: 'Đăng nhập', login_failed: 'Đăng nhập thất bại', login_locked: 'Khóa đăng nhập', login_denied: 'Từ chối đăng nhập', logout: 'Đăng xuất',
  user_reset_password: 'Đặt lại mật khẩu', contact_reveal: 'Xem email phụ huynh', lunch_counts_update: 'Sửa số suất',
  email_resend: 'Gửi lại thư', email_test: 'Gửi thư thử', email_unsubscribe: 'Hủy nhận thư', email_send: 'Gửi thư thực đơn',
};
const entities: Record<string, string> = { user: 'tài khoản', category: 'danh mục', food: 'mặt hàng', supplier: 'nhà cung cấp', receipt: 'phiếu nhập', issue: 'phiếu xuất', stocktake: 'kiểm kê', class: 'lớp học', lunch: 'số suất', dish: 'món ăn', menu_version: 'thực đơn cố định', holiday: 'ngày nghỉ', student: 'học sinh', email: 'thư thực đơn' };
const verbs: Record<string, string> = { create: 'Tạo', update: 'Sửa', delete: 'Xóa', lock: 'Chốt', unlock: 'Mở khóa', post: 'Chốt', count: 'Nhập số kiểm kê', open: 'Mở', reopen: 'Mở lại', import: 'Nhập CSV', send: 'Gửi', failed: 'Gửi lỗi', skipped: 'Bỏ qua' };
export function actionLabel(code: string): string {
  if (special[code]) return special[code];
  if (code === 'user_lock') return 'Khóa tài khoản';
  const index = code.lastIndexOf('_');
  const entity = entities[code.slice(0, index)];
  const verb = verbs[code.slice(index + 1)];
  return entity && verb ? `${verb} ${entity}` : `Thao tác khác (${code})`;
}
const display = (value: unknown) => value == null ? '—' : typeof value === 'string' ? value : JSON.stringify(value);

export function AuditPage() {
  const [params] = useSearchParams();
  const update = useUpdateParams();
  const [detail] = useQueryParam('chi-tiet');
  const filters = new URLSearchParams();
  for (const key of ['actor', 'action', 'entity_type', 'from', 'to', 'page']) if (params.get(key)) filters.set(key, params.get(key)!);
  const queryString = filters.toString();
  const q = useApiQuery(() => administrationApi.audit(new URLSearchParams(queryString)), [queryString]);
  const selected = q.data?.results.find(row => String(row.id) === detail);
  const filter = (key: string, value: string) => update({ [key]: value || null, page: null, 'chi-tiet': null });
  return <>
    <PageHeader title="Nhật ký" description="Theo dõi thao tác và thay đổi trong hệ thống." />
    <Stack gap="lg">
      <Toolbar>
        <TextField label="Người thực hiện (tên đăng nhập)" value={params.get('actor') ?? ''} onChange={e => filter('actor', e.target.value)} />
        <SelectField label="Hành động" value={params.get('action') ?? ''} onChange={e => filter('action', e.target.value)}><option value="">Tất cả</option>{q.data?.actions.map(a => <option key={a} value={a}>{actionLabel(a)}</option>)}</SelectField>
        <TextField label="Loại đối tượng" value={params.get('entity_type') ?? ''} onChange={e => filter('entity_type', e.target.value)} placeholder="Ví dụ: student" />
        <TextField label="Từ ngày" type="date" value={params.get('from') ?? ''} onChange={e => filter('from', e.target.value)} />
        <TextField label="Đến ngày" type="date" value={params.get('to') ?? ''} onChange={e => filter('to', e.target.value)} />
      </Toolbar>
      {q.loading ? <Skeleton /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !q.data?.results.length ? <EmptyState title="Không có nhật ký phù hợp" action={<Button variant="secondary" onClick={() => update({ actor: null, action: null, entity_type: null, from: null, to: null, page: null })}>Xóa bộ lọc</Button>} /> : <DataTable caption="Nhật ký thao tác" rows={q.data.results} rowKey={r => r.id} columns={[
        { key: 'time', header: 'Thời gian', cell: r => formatDateTime(r.created_at) },
        { key: 'actor', header: 'Người', cell: r => r.actor_username || 'Hệ thống / khách' },
        { key: 'action', header: 'Hành động', cell: r => actionLabel(r.action) },
        { key: 'summary', header: 'Tóm tắt', wrap: true, cell: r => r.summary },
        { key: 'detail', header: 'Chi tiết', cell: r => <Button size="xs" variant="secondary" onClick={() => update({ 'chi-tiet': String(r.id) })}>Xem</Button> },
      ]} />}
      {q.data ? <Pagination page={q.data.page} pageCount={q.data.total_pages} summary={`${q.data.total} bản ghi`} onPageChange={page => update({ page: String(page), 'chi-tiet': null })} /> : null}
    </Stack>
    {selected ? <Drawer title={actionLabel(selected.action)} onClose={() => update({ 'chi-tiet': null })} width="680px"><Stack gap="lg">
      <KeyValueList items={[{ label: 'Thời gian', value: formatDateTime(selected.created_at) }, { label: 'Người', value: selected.actor_username || 'Hệ thống / khách' }, { label: 'Đối tượng', value: `${selected.entity_type} ${selected.entity_id}` }, { label: 'Tóm tắt', value: selected.summary }, { label: 'IP', value: selected.ip || '—' }, { label: 'Trình duyệt', value: selected.user_agent || '—' }]} />
      {Object.keys(selected.changes).length ? <DataTable caption="Thay đổi" rowKey={r => r.field} rows={Object.entries(selected.changes).map(([field, value]) => ({ field, before: Array.isArray(value) && value.length === 2 ? value[0] : null, after: Array.isArray(value) && value.length === 2 ? value[1] : value }))} columns={[
        { key: 'field', header: 'Trường', cell: r => r.field }, { key: 'before', header: 'Trước', wrap: true, cell: r => display(r.before) }, { key: 'after', header: 'Sau', wrap: true, cell: r => display(r.after) },
      ]} /> : <EmptyState title="Không có thay đổi chi tiết" />}
    </Stack></Drawer> : null}
  </>;
}
