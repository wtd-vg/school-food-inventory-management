import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  IconAlert,
  IconBox,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDot,
  IconInfo,
  IconPause,
  IconPencil,
  IconRefresh,
  type IconProps,
} from '../icons';
import { Button } from './Button';
import { Scene, type SceneName } from './Illustration';
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
      <div className={`${styles.tabs} ${styles.spread}`}>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={styles.tab}>
            {it.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/* ---------- Tabs: tab trong một màn (role=tablist), trải đều hết chiều ngang ---------- */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  idPrefix,
}: {
  items: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Tiền tố id để panel gắn aria-labelledby (`${idPrefix}-tab-${value}`). */
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = items.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={styles.scrollX}>
      <div className={`${styles.tabs} ${styles.spread}`} role="tablist" aria-label={label}>
        {items.map((it, i) => {
          const selected = it.value === value;
          return (
            <button
              key={it.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${it.value}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => onChange(it.value)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {it.label}
              {it.count !== undefined ? <span className={styles.segCount}>{it.count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Badge = chip trạng thái: cao 26, bo tròn, icon 13, nền pastel + viền cùng tông ---------- */
export type BadgeTone = 'ok' | 'done' | 'info' | 'review' | 'warn' | 'danger' | 'draft' | 'paused' | 'neutral';
const BADGE_ICON: Record<BadgeTone, ((p: IconProps) => ReactNode) | null> = {
  ok: IconCheck,
  done: IconCheck,
  info: IconDot,
  review: IconClock,
  warn: IconClock,
  danger: IconAlert,
  draft: IconPencil,
  paused: IconPause,
  neutral: null,
};

/**
 * Bảng màu chip (SF78): Mới/đang chuẩn bị = info (xanh dương) · Đạt/đang hợp tác = ok (xanh lá) ·
 * Hoàn tất/đã chốt = done (teal) · Sắp hết/cần đặt/chưa chốt = warn (cam) · Hết/quá hạn/lỗi = danger (đỏ) ·
 * Nháp = draft (vàng) · Đang duyệt = review (xanh trời) · Tạm dừng = paused (tím) · Huỷ/ngừng = neutral (xám).
 */
export function Badge({ tone = 'neutral', icon, children }: { tone?: BadgeTone; icon?: ReactNode | false; children: ReactNode }) {
  const Default = BADGE_ICON[tone];
  const glyph = icon === false ? null : icon ?? (Default ? <Default size={13} strokeWidth={2.4} /> : null);
  return (
    <span className={`${styles.badge} ${styles[`badge-${tone}`]}`}>
      {glyph}
      {children}
    </span>
  );
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

/* ---------- PageHeader: 3 kiểu đầu trang (SF78) ---------- */
export type Crumb = { label: string; to?: string };

function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Đường dẫn" className={className}>
      <ol className={styles.crumbs}>
        {items.map((c, i) => (
          <li key={i}>
            {c.to && i < items.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * plain (mặc định): tiêu đề 28/500, bên phải là `meta` (ngày giờ, chữ phụ) và nút.
 * banner (trang danh sách): băng tranh 128px bo 16, breadcrumb góc trên trái, tiêu đề + số lượng góc dưới trái,
 * nút phụ góc dưới phải; `description` hiện ngay dưới băng.
 */
export function PageHeader({
  variant = 'plain',
  overline,
  title,
  count,
  description,
  actions,
  meta,
  breadcrumb,
  scene = 'suong',
}: {
  variant?: 'plain' | 'banner';
  overline?: ReactNode;
  title: ReactNode;
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  breadcrumb?: Crumb[];
  scene?: SceneName;
}) {
  if (variant === 'banner') {
    return (
      <header className={styles.bannerWrap}>
        <div className={styles.banner}>
          <Scene name={scene} className={styles.bannerScene} />
          <span className={styles.bannerFade} aria-hidden="true" />
          {breadcrumb?.length ? <Breadcrumb items={breadcrumb} className={styles.bannerCrumbs} /> : null}
          <div className={styles.bannerBottom}>
            <h1 className={styles.title}>
              {title}
              {count !== undefined ? <span className={`${styles.count} num`}> {count}</span> : null}
            </h1>
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </div>
        </div>
        {description ? <p className={`${styles.description} num`}>{description}</p> : null}
      </header>
    );
  }
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        {breadcrumb?.length ? <Breadcrumb items={breadcrumb} /> : null}
        {overline ? <p className={`${styles.overline} num`}>{overline}</p> : null}
        <h1 className={styles.title}>
          {title}
          {count !== undefined ? <span className={`${styles.count} num`}> {count}</span> : null}
        </h1>
        {description ? <p className={`${styles.description} num`}>{description}</p> : null}
      </div>
      {meta || actions ? (
        <div className={styles.headerSide}>
          {meta ? <p className={`${styles.meta} num`}>{meta}</p> : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      ) : null}
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

/** Tiêu đề khối 16/600. */
export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 className={styles.sectionTitle} id={id}>
      {children}
    </h2>
  );
}

/** Card trắng bo 16, không viền, bóng rất nhẹ. Có `title` thì kèm đầu card (16/600) và `action` bên phải. */
export function Panel({
  children,
  className,
  title,
  action,
  titleId,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
  titleId?: string;
}) {
  return (
    <section className={[styles.panel, className ?? ''].join(' ')} aria-labelledby={title && titleId ? titleId : undefined}>
      {title ? (
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle} id={titleId}>
            {title}
          </h2>
          {action ? <div className={styles.panelAction}>{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Ô key-value nền nhạt bo 12: giá trị 15/600, nhãn 12. `to` biến ô thành liên kết có mũi tên. */
export function InfoTiles({ items }: { items: { label: ReactNode; value: ReactNode; to?: string }[] }) {
  return (
    <dl className={styles.tiles}>
      {items.map((it, i) => (
        // dt trước dd cho đúng HTML; CSS đảo thứ tự để giá trị nằm trên nhãn.
        <div className={styles.tile} key={i}>
          <dt className={styles.tileLabel}>{it.label}</dt>
          <dd className={`${styles.tileValue} num`}>
            {it.to ? (
              <Link to={it.to} className={styles.tileLink}>
                {it.value}
                <IconChevronRight size={14} />
              </Link>
            ) : (
              it.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Số lớn 22–30/500 kèm nhãn (KPI). */
export function Stat({ value, label, size = 'md' }: { value: ReactNode; label: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statValue} ${size === 'lg' ? styles.statLg : ''} num`}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

/**
 * Việc có giờ: nền kem, dải trái vàng, ô giờ kiểu tờ lịch ("SÁNG" / "10:45").
 * `fade` 0–2: mục xa hơn mờ dần. `done` gạch nhẹ chữ khi đã làm xong.
 */
export function TimedTask({
  title,
  detail,
  period,
  time,
  fade = 0,
  done,
  to,
  tone = 'default',
}: {
  title: ReactNode;
  detail?: ReactNode;
  period: string;
  time: string;
  fade?: 0 | 1 | 2;
  done?: boolean;
  to?: string;
  /** 'close': thẻ Đóng ngày màu cam đậm (SF80). */
  tone?: 'default' | 'close';
}) {
  const body = (
    <>
      <span className={styles.taskText}>
        <span className={styles.taskTitle}>{title}</span>
        {detail ? <span className={styles.taskDetail}>{detail}</span> : null}
      </span>
      <span className={`${styles.taskTime} num`} aria-label={`${period.toLowerCase()} ${time}`}>
        <span className={styles.taskPeriod}>{period}</span>
        {time}
      </span>
    </>
  );
  const cls = [styles.task, fade ? styles[`fade${fade}`] : '', tone === 'close' ? styles.taskClose : '', done ? styles.taskDone : ''].join(' ');
  return (
    <li className={cls}>
      {to ? (
        <Link to={to} className={styles.taskLink}>
          {body}
        </Link>
      ) : (
        <div className={styles.taskLink}>{body}</div>
      )}
    </li>
  );
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
          <Button variant="outline" size="xs" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <IconChevronLeft size={16} />
          </Button>
          <span>
            {page} / {pageCount}
          </span>
          <Button variant="outline" size="xs" aria-label="Trang sau" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
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
          <Button variant="outline" size="sm" icon={<IconRefresh size={16} />} onClick={onRetry}>
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
