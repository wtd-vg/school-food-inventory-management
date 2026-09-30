import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Skeleton } from '../components/ui';
import { useAuth } from './AuthContext';
import styles from './RequireAuth.module.css';

/** Chặn route khi chưa đăng nhập; giữ đường dẫn cũ để quay lại sau khi đăng nhập. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div className={styles.loading}>
        <Skeleton rows={4} label="Đang kiểm tra đăng nhập" />
      </div>
    );
  }
  if (status === 'anon') {
    return <Navigate to="/dang-nhap" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
