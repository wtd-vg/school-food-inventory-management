/**
 * Phiên đăng nhập: /api/auth/me/ quyết định vai trò manager | viewer.
 * fetchApi phát sự kiện `session-expired` khi gặp 401; nếu đang đăng nhập thì
 * quay về màn đăng nhập với thông báo "Phiên làm việc đã hết".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../lib/http';

export type Role = 'manager' | 'principal';
export type User = { id: number; username: string; full_name: string; role: Role; can_write: boolean; can_manage_users: boolean; can_view_audit: boolean };
type Status = 'loading' | 'anon' | 'authed';

type AuthValue = {
  status: Status;
  user: User | null;
  /** Viewer chỉ xem: nút ghi hiện ở trạng thái khoá. */
  canWrite: boolean;
  canManageUsers: boolean;
  canViewAudit: boolean;
  /** true khi vừa bị đá ra vì hết phiên; màn đăng nhập hiện thông báo. */
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<User>('/api/auth/me/')
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authed');
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus('anon');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusRef = useRef<Status>(status);
  statusRef.current = status;

  useEffect(() => {
    const onExpired = () => {
      // Chỉ xử lý khi đang đăng nhập; 401 lúc gõ sai mật khẩu không tính là hết phiên.
      if (statusRef.current !== 'authed') return;
      setSessionExpired(true);
      setUser(null);
      setStatus('anon');
    };
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    await api.get('/api/auth/csrf/');
    try {
      const res = await api.post<{ user: User }>('/api/auth/login/', { username, password });
      setUser(res.user);
      setSessionExpired(false);
      setStatus('authed');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        throw new ApiError(403, 'Tài khoản chưa được phân quyền', err.errors);
      }
      if (err instanceof ApiError && err.status === 401) {
        throw new ApiError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
      }
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout/');
    } finally {
      setUser(null);
      setSessionExpired(false);
      setStatus('anon');
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      canWrite: user?.can_write ?? false,
      canManageUsers: user?.can_manage_users ?? false,
      canViewAudit: user?.can_view_audit ?? false,
      sessionExpired,
      login,
      logout,
    }),
    [status, user, sessionExpired, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong <AuthProvider>.');
  return ctx;
}

export function roleLabel(role: Role | undefined): string {
  return role === 'manager' ? 'Quản lý' : role === 'principal' ? 'Hiệu trưởng' : 'Chưa phân quyền';
}
