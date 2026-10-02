import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '../../components/icons';
import styles from './IntroVideo.module.css';

/** SF76: trang tĩnh trong public/gioi-thieu/ (GSAP + Tone.js tự host, nginx cho nhúng cùng origin). */
export const INTRO_VIDEO_URL = '/gioi-thieu/index.html';

/**
 * Video giới thiệu trong khung phủ trên trang đăng nhập. iframe chỉ tạo khi mở; đóng thì gỡ iframe
 * và dừng giọng đọc của nó (Web Speech có thể đọc tiếp sau khi khung bị gỡ).
 */
export function IntroVideo({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = frameRef.current;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      try {
        frame?.contentWindow?.speechSynthesis?.cancel();
      } catch {
        /* khung đã gỡ hoặc khác origin: không còn gì để dừng */
      }
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-video-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 className={styles.title} id="intro-video-title">
            Video giới thiệu SchoolFood
          </h2>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Đóng video">
            <IconClose size={20} />
          </button>
        </div>
        <div className={styles.frame}>
          <iframe ref={frameRef} src={INTRO_VIDEO_URL} title="Video giới thiệu SchoolFood" allow="fullscreen" />
        </div>
        <p className={styles.hint}>Teaser 1 phút, có nhạc và thuyết minh tiếng Anh. Phím Space: tạm dừng · R: xem lại.</p>
      </div>
    </div>,
    document.body,
  );
}
