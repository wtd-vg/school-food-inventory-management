import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { EmptyState } from '../components/ui';

export function RequirePermission({ children, audit = false }: { children: ReactNode; audit?: boolean }) {
  const { canManageUsers, canViewAudit } = useAuth();
  if (!(audit ? canViewAudit : canManageUsers)) return <EmptyState title="Không có quyền">Chỉ Hiệu trưởng hoặc quản trị hệ thống được truy cập trang này.</EmptyState>;
  return children;
}
