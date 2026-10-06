import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { roleLabel, useAuth } from '../../auth/AuthContext';
import { IconChevronDown, IconClose, IconLogOut, IconSearch, LogoMark } from '../icons';
import { useToast } from '../ui';
import { AlertsBell } from './AlertsBell';
import { GlobalSearch } from './GlobalSearch';
import { APP_NAME, NAV_ITEMS, SCHOOL_NAME, isNavActive, type NavItem } from './nav';
import styles from './AppShell.module.css';

function Brand() {
  return (
    <Link to="/bua-trua" className={styles.brand} aria-label={`${APP_NAME} – về Tổng quan`}>
      <span className={styles.logo}>
        <LogoMark size={30} />
      </span>
      <span className={styles.brandText}>
        <span className={styles.brandName}>{APP_NAME}</span>
        {SCHOOL_NAME ? <span className={styles.schoolName}>{SCHOOL_NAME}</span> : null}
      </span>
    </Link>
  );
}

/** Mục điều hướng theo quyền: Tài khoản/Nhật ký chỉ hiện với Hiệu trưởng (FE-02/03). */
function useNavItems(): { main: NavItem[]; admin: NavItem[] } {
  const { canManageUsers, canViewAudit } = useAuth();
  const allowed = (item: NavItem) =>
    !item.requires || (item.requires === 'users' ? canManageUsers : canViewAudit);
  return {
    main: NAV_ITEMS.filter((item) => !item.requires),
    admin: NAV_ITEMS.filter((item) => item.requires && allowed(item)),
  };
}

/** Đóng popover khi bấm ra ngoài hoặc Esc (trả focus về nút mở). */
function useDismiss(open: boolean, setOpen: (v: boolean) => void) {
  const areaRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
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
  }, [open, setOpen]);
  return { areaRef, buttonRef };
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { admin } = useNavItems();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { areaRef, buttonRef } = useDismiss(open, setOpen);

  if (!user) return null;
  const initial = user.username.trim().charAt(0) || '?';

  const onLogout = async () => {
    setOpen(false);
    try {
      await logout();
    } catch {
      toast.show('Đăng xuất chưa thành công. Vui lòng thử lại.', 'error');
    }
    navigate('/dang-nhap', { replace: true });
  };

  return (
    <div className={styles.popArea} ref={areaRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.userButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản ${user.username}, ${roleLabel(user.role)}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        <span className={styles.userText}>
          <span className={styles.userName}>{user.username}</span>
          <span className={styles.userRole}>{roleLabel(user.role)}</span>
        </span>
        <IconChevronDown size={16} className={styles.userChevron} />
      </button>
      {open ? (
        <div className={`${styles.pop} ${styles.popRight}`} role="menu" aria-label="Tài khoản">
          <p className={styles.popHead}>
            <strong>{user.username}</strong>
            {roleLabel(user.role)}
          </p>
          {admin.map((item) => (
            <NavLink key={item.to} to={item.to} role="menuitem" className={styles.menuItem} onClick={() => setOpen(false)}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
          <button type="button" role="menuitem" className={styles.menuItem} onClick={onLogout} autoFocus>
            <IconLogOut size={18} />
            Đăng xuất
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RailLink({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  const active = isNavActive(item, pathname);
  return (
    <Link
      to={item.to}
      className={styles.railLink}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      data-tip={item.label}
    >
      <item.icon size={20} />
    </Link>
  );
}

/**
 * Khung app SF78: viền gradient 8px bo 30 → cửa sổ trắng bo 22 → thanh trên 60px + thanh dọc 64px chỉ icon.
 * Điện thoại (<768): bỏ viền, ô tìm kiếm mở bằng nút, điều hướng ở thanh tab dưới đáy.
 */
export function AppShell() {
  const { main, admin } = useNavItems();
  const { pathname } = useLocation();
  const [mobileSearch, setMobileSearch] = useState(false);

  useEffect(() => setMobileSearch(false), [pathname]);

  return (
    <div className={styles.frame}>
      <div className={styles.window}>
        <a className={styles.skip} href="#main">
          Bỏ qua điều hướng
        </a>

        <header className={styles.topbar}>
          <Brand />
          <GlobalSearch className={styles.search} />
          <div className={styles.topActions}>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.searchToggle}`}
              aria-label={mobileSearch ? 'Đóng tìm kiếm' : 'Tìm kiếm'}
              aria-expanded={mobileSearch}
              onClick={() => setMobileSearch((v) => !v)}
            >
              {mobileSearch ? <IconClose size={20} /> : <IconSearch size={20} />}
            </button>
            <AlertsBell />
            <UserMenu />
          </div>
        </header>
        {mobileSearch ? (
          <div className={styles.mobileSearch}>
            <GlobalSearch autoFocus />
          </div>
        ) : null}

        <div className={styles.body}>
          <nav className={styles.rail} aria-label="Điều hướng chính">
            {main.map((item) => (
              <RailLink key={item.to} item={item} />
            ))}
            {admin.length ? <span className={styles.railDivider} aria-hidden="true" /> : null}
            {admin.map((item) => (
              <RailLink key={item.to} item={item} />
            ))}
          </nav>

          <main id="main" className={styles.main} tabIndex={-1}>
            <div className={styles.content}>
              <Outlet />
            </div>
          </main>
        </div>

        <nav className={styles.tabbar} aria-label="Điều hướng chính (điện thoại)">
          {/* Tài khoản/Nhật ký nằm trong menu tài khoản trên điện thoại. */}
          {main.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={styles.tabLink}
              aria-current={isNavActive(item, pathname) ? 'page' : undefined}
            >
              <span className={styles.tabIcon}>
                <item.icon size={20} />
              </span>
              {item.short}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
