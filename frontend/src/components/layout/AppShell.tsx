import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { roleLabel, useAuth } from '../../auth/AuthContext';
import { IconBowl, IconLogOut } from '../icons';
import { useToast } from '../ui';
import { APP_NAME, NAV_ITEMS, SCHOOL_NAME, type NavItem } from './nav';
import styles from './AppShell.module.css';

function Brand() {
  return (
    <NavLink to="/bua-trua" className={styles.brand} aria-label={`${APP_NAME} – về trang Hôm nay`}>
      <span className={styles.logo}>
        <IconBowl size={22} />
      </span>
      <span className={styles.brandText}>
        <span className={styles.brandName}>{APP_NAME}</span>
        {SCHOOL_NAME ? <span className={styles.schoolName}>{SCHOOL_NAME}</span> : null}
      </span>
    </NavLink>
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

function UserMenu() {
  const { user, logout } = useAuth();
  const { admin } = useNavItems();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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
  }, [open]);

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
    <div className={styles.userArea} ref={areaRef}>
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
      </button>
      {open ? (
        <div className={styles.menu} role="menu" aria-label="Tài khoản">
          <p className={styles.menuHead}>
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

/** Khung trang (UI_GUIDE.md): sidebar 232 → chỉ icon (<1280) → tab dưới đáy (<768). */
export function AppShell() {
  const { main, admin } = useNavItems();
  // Khu hiện tại (/kho, /bua-trua…): đổi khu thì nội dung hiện lên lại; đổi tab con không.
  const section = useLocation().pathname.split('/')[1] ?? '';
  return (
    <div className={styles.shell}>
      <div className={styles.backdrop} aria-hidden="true" />
      <a className={styles.skip} href="#main">
        Bỏ qua điều hướng
      </a>

      <aside className={styles.sidebar}>
        <Brand />
        <nav className={styles.nav} aria-label="Điều hướng chính">
          {[...main, ...admin].map((item) => (
            <NavLink key={item.to} to={item.to} className={styles.navLink} title={item.label}>
              <item.icon size={20} className={styles.navIcon} />
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <UserMenu />
      </aside>

      <header className={styles.topbar}>
        <Brand />
        <UserMenu />
      </header>

      <main id="main" className={styles.main} tabIndex={-1}>
        <div className={styles.content}>
          <div key={section} className={styles.page}>
            <Outlet />
          </div>
        </div>
      </main>

      <nav className={styles.tabbar} aria-label="Điều hướng chính (điện thoại)">
        {/* Thanh tab điện thoại chỉ giữ 5 mục nghiệp vụ; Tài khoản/Nhật ký nằm trong menu tài khoản. */}
        {main.map((item) => (
          <NavLink key={item.to} to={item.to} className={styles.tabLink}>
            <span className={styles.tabIcon}>
              <item.icon size={22} />
            </span>
            {item.short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
