/**
 * FE-02 /tai-khoan: Hiệu trưởng quản lý tài khoản (user_views.py, BE-11).
 * ?tao=1 thêm, ?sua=ID sửa. Khoá tài khoản → backend đăng xuất các phiên của người đó.
 * Backend chặn: sửa superuser (403), tự khoá/tự đổi vai trò (409), bỏ Hiệu trưởng cuối cùng (409).
 * Nút ở đây không dùng `write` vì quyền là can_manage_users (Hiệu trưởng), không phải can_write.
 */
import { useState, type FormEvent } from 'react';
import { roleLabel, useAuth, type Role } from '../../auth/AuthContext';
import { IconPlus } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  SelectField,
  Skeleton,
  TextField,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { fieldsOf, messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { administrationApi, type Account } from '../../services/administration';
import { focusFirstInvalid, useQueryParam, useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';

const PASSWORD_HINT = 'Ít nhất 10 ký tự, không quá phổ biến, không giống tên đăng nhập, không chỉ gồm số.';

export function UsersPage() {
  const { user: me } = useAuth();
  const q = useApiQuery(administrationApi.users, []);
  const [create] = useQueryParam('tao');
  const [edit] = useQueryParam('sua');
  const updateParams = useUpdateParams();
  const [locking, setLocking] = useState<Account | null>(null);
  const [resetting, setResetting] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockError, setLockError] = useState('');
  const toast = useToast();

  const editing = q.data?.find((u) => String(u.id) === edit && !u.is_superuser) ?? null;
  const closeForm = () => updateParams({ tao: null, sua: null });
  const addButton = (
    <Button icon={<IconPlus size={18} strokeWidth={2.4} />} onClick={() => updateParams({ tao: '1', sua: null })}>
      Thêm tài khoản
    </Button>
  );

  const toggleLock = async () => {
    if (!locking) return;
    setBusy(true);
    setLockError('');
    try {
      await administrationApi.update(locking.id, { is_active: !locking.is_active });
      toast.show(locking.is_active ? `Đã khoá ${locking.username}.` : `Đã mở khoá ${locking.username}.`);
      setLocking(null);
      q.reload();
    } catch (err) {
      setLockError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Account>[] = [
    {
      key: 'username',
      header: 'Tên đăng nhập',
      width: '200px',
      cell: (u) => (
        <span className={tableText.strong}>
          {u.username}
          {u.id === me?.id ? ' (bạn)' : ''}
        </span>
      ),
    },
    { key: 'name', header: 'Họ tên', wrap: true, cell: (u) => u.full_name || '—' },
    {
      key: 'role',
      header: 'Vai trò',
      width: '172px',
      cell: (u) => (u.is_superuser ? <Badge tone="info">Quản trị hệ thống</Badge> : roleLabel(u.role ?? undefined)),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: '136px',
      cell: (u) => (u.is_active ? <Badge tone="ok">Hoạt động</Badge> : <Badge tone="danger">Đã khoá</Badge>),
    },
    { key: 'last', header: 'Đăng nhập gần nhất', width: '168px', cell: (u) => <span className={tableText.muted}>{formatDateTime(u.last_login)}</span> },
    {
      key: 'actions',
      header: 'Thao tác',
      width: '300px',
      wrap: true,
      cell: (u) =>
        u.is_superuser ? (
          <span className={tableText.muted}>Sửa trong trang quản trị</span>
        ) : (
          <span className={s.inlineGroup}>
            <Button size="xs" variant="outline" onClick={() => updateParams({ sua: String(u.id), tao: null })}>
              Sửa
            </Button>
            <Button
              size="xs"
              variant={u.is_active ? 'danger' : 'secondary'}
              disabled={u.id === me?.id}
              title={u.id === me?.id ? 'Không tự khoá tài khoản của chính mình' : undefined}
              onClick={() => {
                setLockError('');
                setLocking(u);
              }}
            >
              {u.is_active ? 'Khoá' : 'Mở khoá'}
            </Button>
            <Button size="xs" variant="outline" onClick={() => setResetting(u)}>
              Đặt lại mật khẩu
            </Button>
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Tài khoản"
        description="Quản lý tài khoản Quản lý và Hiệu trưởng. Không có tài khoản phụ huynh."
        actions={addButton}
      />
      {q.loading ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data?.length ? (
        <EmptyState title="Chưa có tài khoản" action={addButton} />
      ) : (
        <DataTable caption="Danh sách tài khoản" rows={q.data} rowKey={(u) => u.id} columns={columns} minWidth="1120px" />
      )}

      {create || editing ? (
        <UserForm
          key={editing?.id ?? 'new'}
          account={editing}
          onClose={closeForm}
          onSaved={() => {
            closeForm();
            q.reload();
          }}
        />
      ) : null}

      {locking ? (
        <ConfirmDialog
          title={locking.is_active ? `Khoá tài khoản ${locking.username}?` : `Mở khoá ${locking.username}?`}
          confirmLabel={locking.is_active ? 'Khoá tài khoản' : 'Mở khoá'}
          tone={locking.is_active ? 'danger' : 'primary'}
          busy={busy}
          onCancel={() => setLocking(null)}
          onConfirm={toggleLock}
        >
          <p>
            {locking.is_active
              ? 'Người này bị đăng xuất khỏi mọi phiên đang mở và không đăng nhập được cho tới khi mở khoá.'
              : 'Người này đăng nhập lại được với mật khẩu hiện có.'}
          </p>
          {lockError ? (
            <Callout tone="danger" role="alert">
              {lockError}
            </Callout>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {resetting ? <PasswordForm account={resetting} onClose={() => setResetting(null)} /> : null}
    </>
  );
}

function UserForm({ account, onClose, onSaved }: { account: Account | null; onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState(account?.username ?? '');
  const [fullName, setFullName] = useState(account?.full_name ?? '');
  const [role, setRole] = useState<Role>(account?.role ?? 'manager');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!account && !username.trim()) next.username = 'Hãy nhập tên đăng nhập.';
    if (!fullName.trim()) next.full_name = 'Hãy nhập họ tên.';
    if (!account && password.length < 10) next.password = 'Mật khẩu cần ít nhất 10 ký tự.';
    if (!account && password !== confirm) next.confirm = 'Mật khẩu xác nhận chưa khớp.';
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstInvalid('user-form');
      return;
    }
    setBusy(true);
    try {
      if (account) await administrationApi.update(account.id, { full_name: fullName.trim(), role });
      else await administrationApi.create({ username: username.trim(), full_name: fullName.trim(), role, password });
      toast.show(account ? `Đã lưu tài khoản ${account.username}.` : `Đã tạo tài khoản ${username.trim()}.`);
      onSaved();
    } catch (err) {
      setFormError(messageOf(err));
      setErrors(fieldsOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={account ? `Sửa tài khoản ${account.username}` : 'Thêm tài khoản'}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="user-form" busy={busy}>
            {account ? 'Lưu thay đổi' : 'Tạo tài khoản'}
          </Button>
        </>
      }
    >
      <form id="user-form" className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        ) : null}
        <TextField
          label="Tên đăng nhập"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          readOnly={Boolean(account)}
          hint={account ? 'Không đổi được tên đăng nhập.' : undefined}
          autoComplete="off"
          autoCapitalize="none"
          maxLength={150}
          error={errors.username}
          required
        />
        <TextField label="Họ tên" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={150} error={errors.full_name} required />
        <SelectField label="Vai trò" value={role} onChange={(e) => setRole(e.target.value as Role)} error={errors.role} required>
          <option value="manager">Quản lý (làm mọi nghiệp vụ)</option>
          <option value="principal">Hiệu trưởng (xem tất cả, quản lý tài khoản)</option>
        </SelectField>
        {!account ? (
          <>
            <TextField
              label="Mật khẩu"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              error={errors.password}
              hint={PASSWORD_HINT}
              required
            />
            <TextField
              label="Xác nhận mật khẩu"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              maxLength={128}
              error={errors.confirm}
              required
            />
          </>
        ) : null}
      </form>
    </Drawer>
  );
}

function PasswordForm({ account, onClose }: { account: Account; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (password.length < 10) next.password = 'Mật khẩu cần ít nhất 10 ký tự.';
    if (password !== confirm) next.confirm = 'Mật khẩu xác nhận chưa khớp.';
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstInvalid('password-form');
      return;
    }
    setBusy(true);
    try {
      const res = await administrationApi.resetPassword(account.id, password);
      toast.show(res.message);
      onClose();
    } catch (err) {
      setFormError(messageOf(err));
      setErrors(fieldsOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Đặt lại mật khẩu: ${account.username}`}
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="password-form" busy={busy}>
            Đặt lại mật khẩu
          </Button>
        </>
      }
    >
      <form id="password-form" className={s.form} onSubmit={onSubmit} noValidate>
        <p className={s.muted}>Các phiên đăng nhập cũ của tài khoản này sẽ bị đăng xuất.</p>
        {formError ? (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        ) : null}
        <TextField
          label="Mật khẩu mới"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={PASSWORD_HINT}
          required
        />
        <TextField
          label="Xác nhận mật khẩu"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          required
        />
      </form>
    </Modal>
  );
}
