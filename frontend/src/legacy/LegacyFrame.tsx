/**
 * Bọc trang cũ trong khung mới cho tới khi trang đó được làm lại (PR 1 → PR 4).
 * Trang cũ nhận isViewer như trước; CSS cũ chỉ áp dụng bên trong .legacy.
 */
import type { ComponentType } from 'react';
import { useAuth } from '../auth/AuthContext';
import './legacy.css';

export function LegacyFrame({ page: Page }: { page: ComponentType<{ isViewer?: boolean }> }) {
  const { canWrite } = useAuth();
  return (
    <div className="legacy">
      <Page isViewer={!canWrite} />
    </div>
  );
}
