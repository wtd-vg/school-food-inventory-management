import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { IconBowl } from '../../components/icons';
import { APP_NAME, SCHOOL_NAME } from '../../components/layout/nav';
import { Button, Callout, TextField } from '../../components/ui';
import { messageOf } from '../../lib/http';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { status, login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/kho';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'authed') return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: typeof errors = {};
    if (!username.trim()) next.username = 'Hãy nhập tên đăng nhập.';
    if (!password) next.password = 'Hãy nhập mật khẩu.';
    setErrors(next);
    if (next.username || next.password) return;
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(messageOf(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            <IconBowl size={26} />
          </span>
          <div>
            <p className={styles.brandName}>{APP_NAME}</p>
            {SCHOOL_NAME ? <p className={styles.school}>{SCHOOL_NAME}</p> : null}
          </div>
        </div>

        <div>
          <h1 className={styles.title} id="login-title">
            Đăng nhập
          </h1>
          <p className={styles.lead}>Quản lý kho và bữa trưa bán trú.</p>
        </div>

        {sessionExpired ? (
          <Callout tone="info" role="status">
            Phiên làm việc đã hết. Vui lòng đăng nhập lại.
          </Callout>
        ) : null}
        {formError ? (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        ) : null}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <TextField
            label="Tên đăng nhập"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={errors.username}
            required
            autoFocus
          />
          <div className={styles.passwordRow}>
            <TextField
              label="Mật khẩu"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              className={styles.passwordInput}
              required
            />
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
          <Button type="submit" block busy={busy}>
            Đăng nhập
          </Button>
        </form>

        <p className={styles.foot}>Quên mật khẩu? Liên hệ quản lý kho của trường.</p>
      </section>
    </main>
  );
}
