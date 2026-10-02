import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/ui';
import { useAuth } from './AuthContext';

/**
 * Chặn màn chỉ dành cho Hiệu trưởng (FE-02 Tài khoản, FE-03 Nhật ký). Backend vẫn trả 403 nếu gọi thẳng API.
 * need="users": can_manage_users · need="audit": can_view_audit.
 */
export function RequirePermission({ need, children }: { need: 'users' | 'audit'; children: ReactNode }) {
  const { canManageUsers, canViewAudit } = useAuth();
  const allowed = need === 'audit' ? canViewAudit : canManageUsers;
  if (allowed) return <>{children}</>;
  return (
    <>
      <PageHeader title="Không có quyền truy cập" />
      <EmptyState title="Chỉ Hiệu trưởng được xem trang này" action={<Link to="/bua-trua">Về trang Hôm nay</Link>} />
    </>
  );
}
