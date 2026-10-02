import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './Button';
import styles from './MenuButton.module.css';

export type MenuItem = { key: string; label: string; hint?: string; icon?: ReactNode; onSelect: () => void };

/**
 * Nút tạo mới có ▾ khi có nhiều loại (SF78): mở menu chọn loại. Phím ↑/↓ đi giữa các mục, Esc đóng.
 * `write`: Hiệu trưởng thấy nút khoá như Button write (không ẩn).
 */
export function MenuButton({
  label,
  icon,
  items,
  variant = 'primary',
  write,
}: {
  label: string;
  icon?: ReactNode;
  items: MenuItem[];
  variant?: 'primary' | 'secondary' | 'outline';
  write?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (areaRef.current && !areaRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Escape') {
      setOpen(false);
      areaRef.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.area} ref={areaRef}>
      <Button
        variant={variant}
        icon={icon}
        caret
        write={write}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </Button>
      {open ? (
        <div className={styles.menu} role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {items.map((it, i) => (
            <button
              key={it.key}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.icon ? <span className={styles.icon}>{it.icon}</span> : null}
              <span className={styles.text}>
                <span className={styles.label}>{it.label}</span>
                {it.hint ? <span className={styles.hint}>{it.hint}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
