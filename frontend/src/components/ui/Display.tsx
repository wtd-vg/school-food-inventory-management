import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { IconAlert, IconBox, IconChevronLeft, IconChevronRight, IconInfo, IconRefresh } from '../icons';
import { Button } from './Button';
import styles from './Display.module.css';

/* ---------- Segmented: lọc tại chỗ, <button aria-pressed> ---------- */
export type SegmentedOption<T extends string> = { value: T; label: ReactNode; count?: number };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className={styles.scrollX}>
      <div className={styles.segmented} role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={styles.segItem}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
            {o.count !== undefined ? <span className={styles.segCount}>· {o.count}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- RouteTabs: tab điều hướng giữa các route con, cùng dáng Segmented ---------- */
export function RouteTabs({ items, label }: { items: { to: string; label: string; end?: boolean }[]; label: string }) {
  return (
    <nav className={styles.scrollX} aria-label={label}>
      <div className={styles.tabs}>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={styles.tab}>
            {it.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/* ---------- Badge ---------- */
export function Badge({ tone = 'neutral', children }: { tone?: 'danger' | 'warn' | 'info' | 'ok' | 'neutral'; children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[`badge-${tone}`]}`}>{children}</span>;
}

/** Chữ trạng thái "Đạt" không nền (bản vẽ Kiểm thực). */
export function OkText({ children }: { children: ReactNode }) {
  return <span className={styles.okText}>{children}</span>;
}

/* ---------- Callout ---------- */
export function Callout({
  tone = 'warn',
  title,
  children,
  action,
  role,
}: {
  tone?: 'warn' | 'danger' | 'info' | 'ok';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: 'alert' | 'status';
}) {
  const Icon = tone === 'info' || tone === 'ok' ? IconInfo : IconAlert;
  return (
    <div className={`${styles.callout} ${styles[`callout-${tone}`]}`} role={role}>
      <Icon size={18} />
      <div className={styles.calloutBody}>
        {title ? <p className={styles.calloutTitle}>{title}</p> : null}
        {children}
      </div>
      {action ? <div className={styles.calloutAction}>{action}</div> : null}
    </div>
  );
}

/* ---------- PageHeader ---------- */
export function PageHeader({
  overline,
  title,
  description,
  actions,
}: {
  overline?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        {overline ? <p className={`${styles.overline} num`}>{overline}</p> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={`${styles.description} num`}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

/** Dòng tóm tắt dưới tiêu đề (bản vẽ 02: "86 mặt hàng · 2 cần dùng sớm…"); số in đậm bằng <strong>. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className={`${styles.lead} num`}>{children}</p>;
}

/** Hàng công cụ: bộ lọc bên trái, ô tìm/nút bên phải. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className={styles.toolbar}>{children}</div>;
}

export function Stack({ children, gap = 'md' }: { children: ReactNode; gap?: 'sm' | 'md' | 'lg' }) {
  return <div className={`${styles.stack} ${styles[`stack-${gap}`]}`}>{children}</div>;
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 className={styles.sectionTitle} id={id}>
      {children}
    </h2>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={[styles.panel, className ?? ''].join(' ')}>{children}</section>;
}

/* ---------- KeyValueList ---------- */
export function KeyValueList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className={styles.kv}>
      {items.map((it, i) => (
        <div className={styles.kvRow} key={i}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  summary,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  summary: ReactNode;
}) {
  return (
    <div className={styles.pagination}>
      <p className="num" aria-live="polite">
        {summary}
      </p>
      {pageCount > 1 ? (
        <div className={styles.pager}>
          <Button variant="secondary" size="xs" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <IconChevronLeft size={16} />
          </Button>
          <span>
            {page} / {pageCount}
          </span>
          <Button variant="secondary" size="xs" aria-label="Trang sau" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            <IconChevronRight size={16} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Trạng thái tải / rỗng / lỗi ---------- */
export function Skeleton({ rows = 5, label = 'Đang tải dữ liệu' }: { rows?: number; label?: string }) {
  return (
    <div className={styles.skeleton} role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.skeletonRow} aria-hidden="true" />
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action, icon }: { title: ReactNode; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>{icon ?? <IconBox size={32} />}</span>
      <p className={styles.emptyTitle}>{title}</p>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Callout
      tone="danger"
      role="alert"
      title="Chưa tải được dữ liệu"
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" icon={<IconRefresh size={16} />} onClick={onRetry}>
            Thử lại
          </Button>
        ) : undefined
      }
    >
      {message}
    </Callout>
  );
}

/** Nhãn "Dữ liệu mẫu" chỉ hiện trong bản dev (UI_GUIDE.md). */
export function DevSampleTag() {
  if (!import.meta.env.DEV) return null;
  return (
    <span className={styles.devTag}>
      <Badge tone="info">Dữ liệu mẫu</Badge>
    </span>
  );
}
