import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { IconClose, IconLock } from '../icons';
import { VIEWER_TITLE } from './Button';
import styles from './BulkBar.module.css';

export type BulkAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Lý do khoá (tooltip), ví dụ "Chọn đúng 1 mặt hàng". */
  hint?: string;
  /** Thao tác ghi: Hiệu trưởng thấy khoá + ổ khoá. */
  write?: boolean;
};

/**
 * Thanh thao tác hàng loạt nổi giữa đáy (nền tối bo 14): "n mục đã chọn | thao tác…".
 * Chỉ hiện khi có mục được chọn; nút "Bỏ chọn" luôn ở cuối.
 */
export function BulkBar({ count, noun, actions, onClear }: { count: number; noun: string; actions: BulkAction[]; onClear: () => void }) {
  const { canWrite } = useAuth();
  if (count <= 0) return null;
  return (
    <div className={styles.bar} role="region" aria-label="Thao tác với mục đã chọn">
      <p className={`${styles.count} num`} aria-live="polite">
        {count} {noun} đã chọn
      </p>
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.actions}>
        {actions.map((a) => {
          const locked = Boolean(a.write && !canWrite);
          return (
            <button
              key={a.key}
              type="button"
              className={styles.action}
              disabled={a.disabled || locked}
              title={locked ? VIEWER_TITLE : a.hint}
              onClick={a.onClick}
            >
              {locked ? <IconLock size={16} /> : a.icon}
              {a.label}
            </button>
          );
        })}
      </div>
      <button type="button" className={styles.clear} aria-label="Bỏ chọn tất cả" title="Bỏ chọn" onClick={onClear}>
        <IconClose size={16} />
      </button>
    </div>
  );
}
