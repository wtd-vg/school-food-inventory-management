import { useState, type FormEvent } from 'react';
import { roleLabel, type Role } from '../../auth/AuthContext';
import { Badge, Button, Callout, ConfirmDialog, DataTable, Drawer, EmptyState, ErrorState, Modal, PageHeader, SelectField, Skeleton, Stack, TextField, useToast } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { administrationApi, type Account } from '../../services/administration';
import { useQueryParam, useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';

export function UsersPage() {
  const q = useApiQuery(administrationApi.users, []);
  const [create] = useQueryParam('tao');
  const [edit] = useQueryParam('sua');
  const update = useUpdateParams();
  const [locking, setLocking] = useState<Account | null>(null);
  const [reset, setReset] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const editing = q.data?.find(u => String(u.id) === edit && !u.is_superuser);
  const close = () => update({ tao: null, sua: null });
  async function lock() {
    if (!locking) return;
    setBusy(true); setError('');
    try {
      await administrationApi.update(locking.id, { is_active: !locking.is_active });
      toast.show(locking.is_active ? 'Đã khóa tài khoản.' : 'Đã mở tài khoản.');
      setLocking(null); q.reload();
    } catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  }
  return <>
    <PageHeader title="Tài khoản" actions={<Button onClick={() => update({ tao: '1', sua: null })}>Thêm tài khoản</Button>} />
    {q.loading ? <Skeleton /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState title="Chưa có tài khoản" action={<Button onClick={() => update({ tao: '1' })}>Thêm tài khoản</Button>} /> :
      <DataTable caption="Tài khoản" rows={q.data} rowKey={u => u.id} columns={[
        { key: 'username', header: 'Tên đăng nhập', cell: u => u.username },
        { key: 'name', header: 'Họ tên', cell: u => u.full_name },
        { key: 'role', header: 'Vai trò', cell: u => u.is_superuser ? <Badge tone="info">Quản trị hệ thống</Badge> : roleLabel(u.role ?? undefined) },
        { key: 'status', header: 'Trạng thái', cell: u => <Badge tone={u.is_active ? 'ok' : 'neutral'}>{u.is_active ? 'Hoạt động' : 'Đã khóa'}</Badge> },
        { key: 'last', header: 'Đăng nhập cuối', cell: u => formatDateTime(u.last_login) },
        { key: 'actions', header: 'Thao tác', wrap: true, cell: u => u.is_superuser ? null : <Stack gap="sm">
          <Button size="xs" variant="secondary" onClick={() => update({ sua: String(u.id), tao: null })}>Sửa</Button>
          <Button size="xs" variant="secondary" onClick={() => { setError(''); setLocking(u); }}>{u.is_active ? 'Khóa' : 'Mở khóa'}</Button>
          <Button size="xs" variant="secondary" onClick={() => setReset(u)}>Đặt lại mật khẩu</Button>
        </Stack> },
      ]} />}
    {create || editing ? <UserForm key={editing?.id ?? 'new'} user={editing ?? null} onClose={close} onSaved={() => { close(); q.reload(); }} /> : null}
    {locking ? <ConfirmDialog title={locking.is_active ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?'} confirmLabel="Xác nhận" busy={busy} onCancel={() => setLocking(null)} onConfirm={lock}>
      <p>{locking.username}{locking.is_active ? ' sẽ bị đăng xuất khỏi các phiên đang mở.' : ' có thể đăng nhập trở lại.'}</p>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
    </ConfirmDialog> : null}
    {reset ? <PasswordForm user={reset} onClose={() => setReset(null)} /> : null}
  </>;
}

function UserForm({ user, onClose, onSaved }: { user: Account | null; onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState(user?.username ?? '');
  const [name, setName] = useState(user?.full_name ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'manager');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    const next: Record<string, string> = {};
    if (!username.trim()) next.username = 'Hãy nhập tên đăng nhập.';
    if (!name.trim()) next.full_name = 'Hãy nhập họ tên.';
    if (!user && password.length < 10) next.password = 'Mật khẩu cần ít nhất 10 ký tự.';
    if (!user && password !== confirm) next.confirm = 'Mật khẩu xác nhận chưa khớp.';
    setErrors(next); if (Object.keys(next).length) return;
    setBusy(true);
    try {
      if (user) await administrationApi.update(user.id, { full_name: name.trim(), role });
      else await administrationApi.create({ username: username.trim(), full_name: name.trim(), role, password });
      toast.show('Đã lưu tài khoản.'); onSaved();
    } catch (err) { setError(messageOf(err)); setErrors(fieldsOf(err)); } finally { setBusy(false); }
  }
  return <Drawer title={user ? 'Sửa tài khoản' : 'Thêm tài khoản'} onClose={busy ? () => undefined : onClose} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button><Button form="user-form" type="submit" busy={busy}>Lưu</Button></>}>
    <form id="user-form" className={s.form} onSubmit={submit} noValidate>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <TextField label="Tên đăng nhập" value={username} onChange={e => setUsername(e.target.value)} readOnly={!!user} maxLength={150} error={errors.username} required />
      <TextField label="Họ tên" value={name} onChange={e => setName(e.target.value)} maxLength={150} error={errors.full_name} required />
      <SelectField label="Vai trò" value={role} onChange={e => setRole(e.target.value as Role)} error={errors.role}><option value="manager">Quản lý</option><option value="principal">Hiệu trưởng</option></SelectField>
      {!user ? <><TextField label="Mật khẩu" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={128} error={errors.password} hint="≥ 10 ký tự, không quá phổ biến" required /><TextField label="Xác nhận mật khẩu" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} error={errors.confirm} required /></> : null}
    </form>
  </Drawer>;
}

function PasswordForm({ user, onClose }: { user: Account; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    const next: Record<string, string> = {};
    if (password.length < 10) next.password = 'Mật khẩu cần ít nhất 10 ký tự.';
    if (password !== confirm) next.confirm = 'Mật khẩu xác nhận chưa khớp.';
    setErrors(next); if (Object.keys(next).length) return;
    setBusy(true);
    try { await administrationApi.resetPassword(user.id, password); toast.show('Đã đặt lại mật khẩu. Các phiên cũ đã đăng xuất.'); onClose(); }
    catch (err) { setError(messageOf(err)); setErrors(fieldsOf(err)); } finally { setBusy(false); }
  }
  return <Modal title={`Đặt lại mật khẩu: ${user.username}`} onClose={busy ? () => undefined : onClose} actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button><Button type="submit" form="password-form" busy={busy}>Đặt lại mật khẩu</Button></>}>
    <form id="password-form" className={s.form} onSubmit={submit} noValidate>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <TextField label="Mật khẩu mới" type="password" autoComplete="new-password" maxLength={128} value={password} onChange={e => setPassword(e.target.value)} error={errors.password} hint="≥ 10 ký tự, không quá phổ biến" required />
      <TextField label="Xác nhận mật khẩu" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} error={errors.confirm} required />
    </form>
  </Modal>;
}
