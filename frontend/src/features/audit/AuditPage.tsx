/**
 * FE-03 /nhat-ky: Hiệu trưởng xem nhật ký thao tác (audit_views.py, BE-15). 50 dòng/trang, mới nhất trước.
 * Bộ lọc nằm trên URL (?actor=&action=&entity_type=&from=&to=&page=) để bấm Back/chia sẻ link được;
 * ?chi-tiet=ID mở ngăn kéo "trước → sau". Backend đã che khoá nhạy cảm (mật khẩu, email, token) bằng "***".
 */
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  KeyValueList,
  PageHeader,
  Pagination,
  SelectField,
  Skeleton,
  Stack,
  TextField,
  Toolbar,
  tableText,
  type Column,
} from '../../components/ui';
import { formatDateTime, formatNumber } from '../../lib/format';
import { useApiQuery } from '../../lib/useApiQuery';
import { administrationApi, type AuditFilters, type AuditLog } from '../../services/administration';
import { useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';

const FILTER_KEYS = ['actor', 'action', 'entity_type', 'from', 'to', 'page'] as const;

const SPECIAL_ACTIONS: Record<string, string> = {
  login: 'Đăng nhập',
  login_failed: 'Đăng nhập sai',
  login_locked: 'Khoá đăng nhập tạm thời',
  login_denied: 'Từ chối đăng nhập (chưa phân quyền)',
  logout: 'Đăng xuất',
  user_lock: 'Khoá tài khoản',
  user_unlock: 'Mở khoá tài khoản',
  user_reset_password: 'Đặt lại mật khẩu',
  contact_reveal: 'Xem email phụ huynh',
  student_import: 'Nhập học sinh từ CSV',
  lunch_open: 'Mở ngày ăn',
  lunch_counts_update: 'Sửa số suất',
  lunch_lock: 'Chốt số suất',
  lunch_reopen: 'Mở lại số suất',
  email_resend: 'Xếp lịch gửi lại thư thực đơn',
  email_test: 'Gửi thư thử',
  email_unsubscribe: 'Phụ huynh huỷ nhận thư',
  stocktake_count: 'Nhập số kiểm kê',
};

export const ENTITY_LABELS: Record<string, string> = {
  user: 'Tài khoản',
  category: 'Danh mục',
  food: 'Mặt hàng',
  supplier: 'Nhà cung cấp',
  receipt: 'Phiếu nhập',
  issue: 'Phiếu xuất',
  stocktake: 'Kiểm kê',
  class: 'Lớp học',
  lunch_day: 'Ngày ăn',
  dish: 'Món ăn',
  menu_version: 'Thực đơn cố định',
  holiday: 'Ngày nghỉ',
  student: 'Học sinh',
  parent_contact: 'Email phụ huynh',
  notification: 'Thư thực đơn',
};

const VERBS: Record<string, string> = { create: 'Tạo', update: 'Sửa', delete: 'Xoá', post: 'Chốt' };

/** Mã hành động → câu tiếng Việt; mã lạ vẫn hiện nguyên mã để không mất thông tin. */
export function actionLabel(code: string): string {
  if (SPECIAL_ACTIONS[code]) return SPECIAL_ACTIONS[code];
  const i = code.lastIndexOf('_');
  const entity = ENTITY_LABELS[code.slice(0, i)];
  const verb = VERBS[code.slice(i + 1)];
  return entity && verb ? `${verb} ${entity.toLowerCase()}` : code;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** changes {k: [trước, sau]} → dòng bảng; giá trị không phải cặp thì coi là "sau". */
function changeRows(changes: Record<string, unknown>) {
  return Object.entries(changes).map(([field, value]) => {
    const pair = Array.isArray(value) && value.length === 2;
    return { field, before: pair ? value[0] : undefined, after: pair ? value[1] : value };
  });
}

export function AuditPage() {
  const [params] = useSearchParams();
  const updateParams = useUpdateParams();
  const filters: AuditFilters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as AuditFilters;
  const key = JSON.stringify(filters);
  const q = useApiQuery(() => administrationApi.audit(filters), [key]);
  const detailId = params.get('chi-tiet');
  const selected = q.data?.results.find((row) => String(row.id) === detailId) ?? null;

  // Ô chữ chỉ áp dụng khi bấm Lọc (không gọi API theo từng phím gõ).
  const [actor, setActor] = useState(filters.actor ?? '');
  const applyText = (e: FormEvent) => {
    e.preventDefault();
    updateParams({ actor: actor.trim() || null, page: null, 'chi-tiet': null });
  };
  const setFilter = (k: keyof AuditFilters, value: string) => updateParams({ [k]: value || null, page: null, 'chi-tiet': null });
  const hasFilter = FILTER_KEYS.some((k) => k !== 'page' && filters[k]);
  const clearFilters = () => {
    setActor('');
    updateParams(Object.fromEntries([...FILTER_KEYS, 'chi-tiet'].map((k) => [k, null])));
  };

  const columns: Column<AuditLog>[] = [
    { key: 'time', header: 'Thời gian', cell: (r) => <span className={tableText.muted}>{formatDateTime(r.created_at)}</span> },
    { key: 'actor', header: 'Người thực hiện', cell: (r) => r.actor_username || 'Hệ thống / phụ huynh' },
    { key: 'action', header: 'Hành động', cell: (r) => <span className={tableText.strong}>{actionLabel(r.action)}</span> },
    { key: 'summary', header: 'Tóm tắt', wrap: true, cell: (r) => r.summary || '—' },
    {
      key: 'detail',
      header: <span className="sr-only">Chi tiết</span>,
      align: 'right',
      cell: (r) => (
        <Button size="xs" variant="secondary" onClick={() => updateParams({ 'chi-tiet': String(r.id) })}>
          Xem
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Nhật ký" />
      <Stack gap="lg">
        <form onSubmit={applyText}>
          <Toolbar>
            <TextField
              label="Người thực hiện"
              placeholder="Tên đăng nhập"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              autoCapitalize="none"
            />
            <SelectField label="Hành động" value={filters.action ?? ''} onChange={(e) => setFilter('action', e.target.value)}>
              <option value="">Tất cả</option>
              {/* Backend có thể trả mã lặp (distinct + ordering), nên khử trùng trước khi hiện. */}
              {[...new Set(q.data?.actions ?? [])].map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </SelectField>
            <SelectField label="Đối tượng" value={filters.entity_type ?? ''} onChange={(e) => setFilter('entity_type', e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(ENTITY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </SelectField>
            <TextField label="Từ ngày" type="date" value={filters.from ?? ''} onChange={(e) => setFilter('from', e.target.value)} />
            <TextField label="Đến ngày" type="date" value={filters.to ?? ''} onChange={(e) => setFilter('to', e.target.value)} />
            <span className={s.inlineGroup}>
              <Button type="submit" variant="secondary">
                Lọc
              </Button>
              {hasFilter ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Xoá bộ lọc
                </Button>
              ) : null}
            </span>
          </Toolbar>
        </form>

        {q.loading ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState message={q.error} onRetry={q.reload} />
        ) : !q.data?.results.length ? (
          <EmptyState
            title={hasFilter ? 'Không có nhật ký khớp bộ lọc' : 'Chưa có nhật ký'}
            action={
              hasFilter ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Xoá bộ lọc
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable caption="Nhật ký thao tác" rows={q.data.results} rowKey={(r) => r.id} columns={columns} minWidth="720px" />
            <Pagination
              page={q.data.page}
              pageCount={q.data.total_pages}
              summary={`${formatNumber(q.data.total, 0)} bản ghi`}
              onPageChange={(page) => updateParams({ page: String(page), 'chi-tiet': null })}
            />
          </>
        )}
      </Stack>

      {selected ? <AuditDetail log={selected} onClose={() => updateParams({ 'chi-tiet': null })} /> : null}
    </>
  );
}

function AuditDetail({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  const rows = changeRows(log.changes ?? {});
  return (
    <Drawer title={actionLabel(log.action)} kicker={formatDateTime(log.created_at)} onClose={onClose} width="680px">
      <Stack gap="lg">
        <KeyValueList
          items={[
            { label: 'Người thực hiện', value: log.actor_username || 'Hệ thống / phụ huynh' },
            {
              label: 'Đối tượng',
              value: `${ENTITY_LABELS[log.entity_type] ?? (log.entity_type || '—')}${log.entity_id ? ` #${log.entity_id}` : ''}`,
            },
            { label: 'Tóm tắt', value: log.summary || '—' },
            { label: 'Địa chỉ IP', value: log.ip || '—' },
            { label: 'Trình duyệt', value: log.user_agent || '—' },
            { label: 'Mã hành động', value: <code>{log.action}</code> },
          ]}
        />
        {rows.length ? (
          <DataTable
            caption="Thay đổi trước và sau"
            rows={rows}
            rowKey={(r) => r.field}
            columns={[
              { key: 'field', header: 'Trường', cell: (r) => <span className={tableText.strong}>{r.field}</span> },
              { key: 'before', header: 'Trước', wrap: true, cell: (r) => displayValue(r.before) },
              { key: 'after', header: 'Sau', wrap: true, cell: (r) => displayValue(r.after) },
            ]}
          />
        ) : (
          <p className={s.muted}>Thao tác này không ghi chi tiết thay đổi.</p>
        )}
      </Stack>
    </Drawer>
  );
}
