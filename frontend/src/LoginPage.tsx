import React, { useState } from 'react';

// Bổ sung hàm đọc Cookie chuẩn (lấy mã csrftoken)
function getCookie(name: string) {
  let cookieValue = '';
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const newFieldErrors: { username?: string; password?: string } = {};
    if (!username.trim()) newFieldErrors.username = 'Tên đăng nhập không được để trống.';
    if (!password) newFieldErrors.password = 'Mật khẩu không được để trống.';
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }

    setIsLoading(true);

    try {
      // 1. Gọi API để Backend gắn Cookie CSRF vào trình duyệt
      const csrfRes = await fetch('/api/auth/csrf/', {
        credentials: 'include',
      });
      if (!csrfRes.ok) throw new Error('Không thể khởi tạo phiên bảo mật');
      
      // 2. Trích xuất mã bảo mật trực tiếp từ Cookie (cách chuẩn của Django)
      let token = getCookie('csrftoken');

      // (Dự phòng) Nếu backend custom trả qua JSON
      if (!token) {
        try {
          const csrfData = await csrfRes.json();
          token = csrfData.csrf_token || csrfData.csrfToken || csrfData.token || '';
        } catch (e) {
          // Bỏ qua nếu không parse được json
        }
      }

      // 3. Gửi thông tin đăng nhập kèm Token và Cookie
      const loginRes = await fetch('/api/auth/login/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': token,
        },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const responseData = await loginRes.json().catch(() => ({}));

      if (loginRes.ok) {
        // Sau login đọc lại token vì Django có thể đổi token
        if (responseData.csrf_token) {
          // Đảm bảo cookie hoặc token mới sẵn sàng
          document.cookie = `csrftoken=${responseData.csrf_token}; path=/; SameSite=Lax`;
        }
        onLoginSuccess();
      } else {
        if (responseData.errors) {
          setFieldErrors({
            username: responseData.errors.username,
            password: responseData.errors.password,
          });
        }
        setError(responseData.message || 'Tên đăng nhập hoặc mật khẩu không chính xác!');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối đến máy chủ. Vui lòng thử lại!');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>Đăng nhập hệ thống</h1>
          <p style={styles.subtitle}>Quản lý kho bếp — SchoolOS</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Tên đăng nhập</label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldErrors.username) setFieldErrors(prev => ({ ...prev, username: '' }));
              }}
              style={{
                ...styles.input,
                borderColor: fieldErrors.username ? '#dc2626' : '#cbd5e1'
              }}
              disabled={isLoading}
              required
            />
            {fieldErrors.username && (
              <span style={styles.fieldError}>{fieldErrors.username}</span>
            )}
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: '' }));
              }}
              style={{
                ...styles.input,
                borderColor: fieldErrors.password ? '#dc2626' : '#cbd5e1'
              }}
              disabled={isLoading}
              required
            />
            {fieldErrors.password && (
              <span style={styles.fieldError}>{fieldErrors.password}</span>
            )}
          </div>

          {error && (
            <div style={styles.errorBox}>
              <span style={styles.errorIcon}>⚠️</span>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            style={{...styles.button, opacity: isLoading ? 0.7 : 1}}
            disabled={isLoading}
          >
            {isLoading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
};

// Khối CSS inline 
const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif' },
  card: { backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)', width: '100%', maxWidth: '400px' },
  header: { textAlign: 'center', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0', fontFamily: 'serif' },
  subtitle: { fontSize: '13px', color: '#64748b', margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', color: '#334155', fontWeight: '500' },
  input: { padding: '10px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' },
  errorBox: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '4px', fontSize: '13px' },
  errorIcon: { fontSize: '14px' },
  fieldError: { fontSize: '12px', color: '#dc2626', marginTop: '2px' },
  button: { padding: '12px', backgroundColor: '#059669', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' },
};