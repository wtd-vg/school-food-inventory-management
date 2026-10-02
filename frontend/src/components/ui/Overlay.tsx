import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { IconAlert, IconCheck, IconClose } from '../icons';
import { Button, IconButton } from './Button';
import styles from './Overlay.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Các lớp phủ đang mở; chỉ lớp trên cùng xử lý Esc/Tab (hộp xác nhận mở chồng lên ngăn kéo). */
const overlayStack: symbol[] = [];

/** Giữ focus trong hộp thoại, Esc để đóng, trả focus về nút đã mở khi đóng. */
function useFocusTrap(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const me = Symbol('overlay');
    overlayStack.push(me);
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (overlayStack[overlayStack.length - 1] !== me) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = overlayStack.indexOf(me);
      if (i >= 0) overlayStack.splice(i, 1);
      if (overlayStack.length === 0) document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [ref]);
}

type DrawerProps = {
  title: ReactNode;
  kicker?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  width?: string;
};

/** Ngăn kéo phải (bản vẽ 03). Chỉ render khi mở; cha điều khiển bằng state hoặc URL. */
export function Drawer({ title, kicker, subtitle, onClose, footer, children, width }: DrawerProps) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);
  const style = width ? ({ '--drawer-w': width } as CSSProperties) : undefined;
  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <aside ref={ref} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={style}>
        <div className={styles.drawerHead}>
          <div className={styles.drawerHeadText}>
            {kicker ? <p className={styles.kicker}>{kicker}</p> : null}
            <h2 className={styles.drawerTitle} id={titleId}>
              {title}
            </h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <IconButton label="Đóng" onClick={onClose}>
            <IconClose size={20} />
          </IconButton>
        </div>
        <div className={styles.drawerBody}>{children}</div>
        {footer ? <div className={styles.drawerFoot}>{footer}</div> : null}
      </aside>
    </>,
    document.body,
  );
}

type ModalProps = {
  title: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  actions: ReactNode;
  role?: 'dialog' | 'alertdialog';
};

export function Modal({ title, onClose, children, actions, role = 'dialog' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);
  return createPortal(
    <>
      <div className={`${styles.backdrop} ${styles.backdropTop}`} onClick={onClose} aria-hidden="true" />
      <div className={styles.modalWrap}>
        <div ref={ref} className={styles.modal} role={role} aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <h2 className={styles.modalTitle} id={titleId}>
            {title}
          </h2>
          {children ? <div className={styles.modalBody}>{children}</div> : null}
          <div className={styles.modalActions}>{actions}</div>
        </div>
      </div>
    </>,
    document.body,
  );
}

type ConfirmProps = {
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Hộp xác nhận cho thao tác không hoàn tác được (chốt phiếu, ngừng dùng). */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Huỷ', tone = 'primary', busy, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      title={title}
      onClose={busy ? () => undefined : onCancel}
      role="alertdialog"
      actions={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/* ---------- Toast ---------- */
type Toast = { id: number; message: string; tone: 'ok' | 'error' };
type ToastApi = { show: (message: string, tone?: 'ok' | 'error') => void };
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const show = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.toasts} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${t.tone === 'error' ? styles.toastError : ''}`}>
            {t.tone === 'error' ? <IconAlert size={18} /> : <IconCheck size={18} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast phải nằm trong <ToastProvider>.');
  return ctx;
}
