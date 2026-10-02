import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { parseDec } from '../../lib/decimal';
import { inventoryApi } from '../../services/inventory';
import { IconAlert, IconArrowIn, IconArrowOut, IconBell } from '../icons';
import styles from './AppShell.module.css';

type Alert = { key: string; text: string; to: string; tone: 'danger' | 'draft' };

async function loadAlerts(): Promise<Alert[]> {
  const [stock, foods, receipts, issues] = await Promise.all([
    inventoryApi.stock(),
    inventoryApi.foods(),
    inventoryApi.receipts(),
    inventoryApi.issues(),
  ]);
  const active = new Set(foods.filter((f) => f.is_active).map((f) => f.id));
  const out = stock.filter((s) => active.has(s.id) && (parseDec(s.quantity)?.v ?? 0n) === 0n).length;
  const draftIn = receipts.filter((r) => r.status === 'DRAFT').length;
  const draftOut = issues.filter((r) => r.status === 'DRAFT').length;
  const list: Alert[] = [];
  if (out) list.push({ key: 'out', text: `${out} mặt hàng đang hết`, to: '/kho?nhom=het-hang', tone: 'danger' });
  if (draftIn) list.push({ key: 'in', text: `${draftIn} phiếu nhập nháp chưa chốt`, to: '/kho/phieu-nhap', tone: 'draft' });
  if (draftOut) list.push({ key: 'outdoc', text: `${draftOut} phiếu xuất nháp chưa chốt`, to: '/kho/phieu-xuat', tone: 'draft' });
  return list;
}

/** Chuông "Cần chú ý" (SF78): chỉ đếm việc có thật trong kho (hết hàng, phiếu nháp); chấm đỏ khi có việc. */
export function AlertsBell() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [failed, setFailed] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(() => {
    loadAlerts()
      .then((a) => {
        setAlerts(a);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  // Tải lại khi đổi màn: chốt phiếu ở màn khác thì chuông cập nhật theo.
  useEffect(refresh, [refresh, pathname]);

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

  const count = alerts?.length ?? 0;
  const label = count ? `Cần chú ý: ${count} việc` : 'Cần chú ý: không có việc';

  return (
    <div className={styles.popArea} ref={areaRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.iconBtn}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell size={20} />
        {count ? <span className={styles.dot} aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className={`${styles.pop} ${styles.popRight}`} role="dialog" aria-label="Cần chú ý">
          <p className={styles.popHead}>Cần chú ý</p>
          {failed ? (
            <p className={styles.popNote}>Chưa tải được danh sách việc.</p>
          ) : !alerts ? (
            <p className={styles.popNote}>Đang tải…</p>
          ) : alerts.length === 0 ? (
            <p className={styles.popNote}>Không có việc nào cần chú ý.</p>
          ) : (
            <ul className={styles.alertList}>
              {alerts.map((a) => {
                const Icon = a.key === 'out' ? IconAlert : a.key === 'in' ? IconArrowIn : IconArrowOut;
                return (
                  <li key={a.key}>
                    <Link to={a.to} className={styles.alertItem} onClick={() => setOpen(false)}>
                      <span className={`${styles.alertIcon} ${styles[`alert-${a.tone}`]}`}>
                        <Icon size={16} />
                      </span>
                      {a.text}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
