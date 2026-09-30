import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { IconLock } from '../icons';
import styles from './Button.module.css';

export const VIEWER_TITLE = 'Tài khoản chỉ xem';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm' | 'xs';
  icon?: ReactNode;
  block?: boolean;
  busy?: boolean;
  /** Thao tác ghi: viewer thấy nút bị khoá + icon ổ khoá, không bị ẩn. */
  write?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  busy,
  write,
  disabled,
  className,
  title,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const { canWrite } = useAuth();
  const locked = Boolean(write && !canWrite);
  const cls = [
    styles.button,
    styles[variant],
    size !== 'md' ? styles[size] : '',
    block ? styles.block : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const leading = busy ? <span className={styles.spinner} aria-hidden="true" /> : locked ? <IconLock size={16} /> : icon;
  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || locked || busy}
      aria-busy={busy || undefined}
      title={locked ? VIEWER_TITLE : title}
      {...rest}
    >
      {leading}
      {children}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  ghost?: boolean;
  write?: boolean;
};

export function IconButton({ label, ghost, write, disabled, className, children, type = 'button', ...rest }: IconButtonProps) {
  const { canWrite } = useAuth();
  const locked = Boolean(write && !canWrite);
  const cls = [styles.iconButton, ghost ? styles.iconGhost : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={cls}
      aria-label={label}
      title={locked ? VIEWER_TITLE : label}
      disabled={disabled || locked}
      {...rest}
    >
      {locked ? <IconLock size={18} /> : children}
    </button>
  );
}
