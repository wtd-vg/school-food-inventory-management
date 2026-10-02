import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconCheck, IconChevronRight, IconImage } from '../icons';
import { SCENES, Scene, type SceneName } from './Illustration';
import type { Crumb } from './Display';
import styles from './Cover.module.css';

/**
 * Đầu trang chi tiết (SF78): ảnh bìa SVG cao 200, breadcrumb + nút "Đổi ảnh bìa" ở trên,
 * card trắng nổi góc dưới trái (tên, chip, 3 thông tin chính ngăn bằng vạch dọc mảnh).
 * "Đổi ảnh bìa" chọn một trong 4 tranh minh hoạ; lựa chọn nhớ trên trình duyệt (`storageKey`).
 */
export function CoverHeader({
  breadcrumb,
  title,
  badges,
  facts,
  storageKey,
  defaultScene = 'song',
}: {
  breadcrumb: Crumb[];
  title: ReactNode;
  badges?: ReactNode;
  facts: { value: ReactNode; label: ReactNode }[];
  storageKey: string;
  defaultScene?: SceneName;
}) {
  const [scene, setScene] = useState<SceneName>(() => readScene(storageKey) ?? defaultScene);
  const [open, setOpen] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setScene(readScene(storageKey) ?? defaultScene), [storageKey, defaultScene]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (areaRef.current && !areaRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (name: SceneName) => {
    setScene(name);
    setOpen(false);
    try {
      localStorage.setItem(`sf.cover.${storageKey}`, name);
    } catch {
      /* trình duyệt chặn lưu trữ: chỉ đổi trong phiên này */
    }
  };

  return (
    <header className={styles.cover}>
      <Scene name={scene} className={styles.scene} />
      <div className={styles.top}>
        <nav aria-label="Đường dẫn">
          <ol className={styles.crumbs}>
            {breadcrumb.map((c, i) => (
              <li key={i}>
                {c.to && i < breadcrumb.length - 1 ? (
                  <Link to={c.to}>{c.label}</Link>
                ) : (
                  <span aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}>{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className={styles.pickArea} ref={areaRef}>
          <button
            ref={buttonRef}
            type="button"
            className={styles.pickBtn}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <IconImage size={16} />
            Đổi ảnh bìa
          </button>
          {open ? (
            <div className={styles.menu} role="menu" aria-label="Chọn ảnh bìa">
              {SCENES.map((s) => (
                <button key={s.value} type="button" role="menuitemradio" aria-checked={s.value === scene} className={styles.menuItem} onClick={() => choose(s.value)}>
                  <span className={styles.swatch}>
                    <Scene name={s.value} />
                  </span>
                  {s.label}
                  {s.value === scene ? <IconCheck size={16} className={styles.menuCheck} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {badges ? <div className={styles.badges}>{badges}</div> : null}
        <dl className={styles.facts}>
          {facts.map((f, i) => (
            <div key={i} className={styles.fact}>
              <dt className={styles.factLabel}>{f.label}</dt>
              <dd className={`${styles.factValue} num`}>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

function readScene(key: string): SceneName | null {
  try {
    const v = localStorage.getItem(`sf.cover.${key}`);
    return SCENES.some((s) => s.value === v) ? (v as SceneName) : null;
  } catch {
    return null;
  }
}

/** Thư mục: 3 tờ giấy (hoặc 3 tranh) xếp xoè −8°/6°/0° viền trắng, dưới là tên, số tệp và mũi tên. */
export function FolderCard({
  title,
  meta,
  to,
  kind = 'papers',
  scene = 'suong',
}: {
  title: ReactNode;
  meta: ReactNode;
  to: string;
  kind?: 'papers' | 'photos';
  scene?: SceneName;
}) {
  return (
    <Link to={to} className={styles.folder}>
      <span className={styles.stackArt} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`${styles.sheet} ${styles[`sheet${i}`]}`}>
            {kind === 'photos' ? (
              <Scene name={scene} />
            ) : (
              <span className={styles.lines}>
                <i />
                <i />
                <i />
                <i />
              </span>
            )}
          </span>
        ))}
      </span>
      <span className={styles.folderFoot}>
        <span className={styles.folderText}>
          <span className={styles.folderTitle}>{title}</span>
          <span className={`${styles.folderMeta} num`}>{meta}</span>
        </span>
        <IconChevronRight size={18} />
      </span>
    </Link>
  );
}
