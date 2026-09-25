import React, { useState, useEffect } from 'react';
import { LoginPage } from './LoginPage';
import { CategoryPage } from './CategoryPage';
import FoodPage from './FoodPage';
import { fetchApi } from './utils/api';

type Screen = 'LOGIN' | 'CATEGORIES' | 'FOODS';

export const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('LOGIN');
  const [isViewer, setIsViewer] = useState(false); 
  const [currentUser, setCurrentUser] = useState<string>('');

  const checkAuth = async () => {
    try {
      const res = await fetchApi('/api/auth/me/');
      if (res.ok) {
        const data = await res.json();
        setIsViewer(data.role === 'viewer');
        setCurrentUser(data.username || '');
        setCurrentScreen('CATEGORIES');
      } else {
        setIsViewer(false);
        setCurrentUser('');
        setCurrentScreen('LOGIN');
      }
    } catch {
      setIsViewer(false);
      setCurrentUser('');
      setCurrentScreen('LOGIN');
    }
  };

  useEffect(() => {
    // Lắng nghe sự kiện hết hạn session để tự động văng ra login
    const handleSessionExpired = () => {
      setIsViewer(false);
      setCurrentUser('');
      setCurrentScreen('LOGIN');
    };
    window.addEventListener('session-expired', handleSessionExpired);
    
    // Kiểm tra đăng nhập khi vừa mở web
    checkAuth();

    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, []);

  const handleLogout = async () => {
    await fetchApi('/api/auth/logout/', { method: 'POST' });
    setIsViewer(false);
    setCurrentUser('');
    setCurrentScreen('LOGIN');
  };

  // Nếu chưa đăng nhập, chỉ hiển thị giao diện Login
  if (currentScreen === 'LOGIN') {
    return <LoginPage onLoginSuccess={checkAuth} />;
  }

  // Nếu đã đăng nhập, hiển thị giao diện chính
  return (
    <div className="school-app">
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; background-color: #f1f5f9; color: #1e293b; }
        .top-navbar { background-color: #0b1329; height: 52px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; color: #ffffff; }
        .brand-logo { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; }
        .logo-icon { font-size: 20px; }
        .nav-menu { display: flex; gap: 12px; align-items: center; }
        .nav-item { color: #94a3b8; text-decoration: none; font-size: 13px; padding: 6px 14px; border-radius: 20px; }
        .nav-item.active { background-color: #ffffff; color: #0f172a; font-weight: 600; }
        .sub-header { background-color: #064e3b; color: #ffffff; padding: 10px 24px; font-size: 13px; font-weight: 500; }
        .main-content { max-width: 1000px; margin: 30px auto; padding: 0 20px; }
        
        /* CSS cho menu chuyển tab nội bộ */
        .tab-menu { display: flex; gap: 24px; margin-bottom: 24px; border-bottom: 1px solid #cbd5e1; }
        .tab-item { padding-bottom: 12px; font-weight: 600; font-size: 14px; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; }
        .tab-item.active { color: #059669; border-bottom-color: #059669; }
        .btn-logout { background: transparent; border: 1px solid #475569; color: #cbd5e1; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 16px; }
        .btn-logout:hover { background: #1e293b; color: white; }

        /* Các class CSS dùng bên trong Page */
        .card-container { background: #ffffff; border-radius: 12px; padding: 28px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .card-title { font-size: 22px; font-weight: 700; color: #0f172a; }
        .card-subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
        .btn-add { background-color: #059669; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 6px; }
        .stat-label { font-size: 12px; color: #64748b; font-weight: 500; }
        .stat-value { font-size: 24px; font-weight: 700; }
        .text-dark { color: #0f172a; } .text-green { color: #16a34a; } .text-red { color: #dc2626; }
        .filter-bar { display: flex; gap: 12px; margin-bottom: 20px; }
        .search-input-wrapper { position: relative; flex: 1; }
        .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; color: #94a3b8; }
        .search-input { width: 100%; padding: 9px 12px 9px 36px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; outline: none; }
        .status-select { padding: 9px 16px; border: 1px solid #cbd5e1; border-radius: 6px; background-color: #ffffff; font-size: 13px; color: #334155; }
        .custom-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .custom-table th { text-align: left; font-size: 11px; font-weight: 700; color: #475569; padding: 12px; border-bottom: 1px solid #f1f5f9; }
        .custom-table td { padding: 14px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .code-badge { background-color: #e2e8f0; color: #334155; font-family: monospace; font-weight: 700; padding: 3px 8px; border-radius: 4px; font-size: 11px; }
        .cat-name { font-weight: 500; color: #0f172a; }
        .status-badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; }
        .status-active { background-color: #dcfce7; color: #15803d; }
        .status-locked { background-color: #fee2e2; color: #b91c1c; }
        .btn-action-delete { background: none; border: none; color: #dc2626; font-weight: 600; font-size: 13px; cursor: pointer; }
        .state-box { padding: 24px; border-radius: 8px; text-align: center; font-size: 13px; margin: 15px 0; }
        .state-loading { background-color: #f8fafc; color: #64748b; }
        .state-error { background-color: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
        .state-empty { background-color: #f8fafc; color: #64748b; border: 1px dashed #cbd5e1; }
        .btn-retry { margin-top: 10px; padding: 6px 12px; background-color: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; }
      `}</style>

      <header className="top-navbar">
        <div className="brand-logo">
          <span className="logo-icon">⌘</span>
          <span className="logo-text">SchoolOS</span>
        </div>
        <nav className="nav-menu">
          <a href="#" className="nav-item">Điều hành</a>
          <a href="#" className="nav-item active">Bếp ăn & Kho</a>
          <a href="#" className="nav-item">Kế toán</a>
          {currentUser && (
            <span style={{ fontSize: '12px', color: '#cbd5e1', marginLeft: '8px' }}>
              👤 {currentUser} <span style={{ 
                backgroundColor: isViewer ? '#475569' : '#059669', 
                padding: '2px 8px', 
                borderRadius: '10px', 
                fontSize: '11px',
                fontWeight: 600,
                color: '#fff' 
              }}>
                {isViewer ? 'Viewer (Chỉ xem)' : 'Admin/Manager (Đầy đủ)'}
              </span>
            </span>
          )}
          <button onClick={handleLogout} className="btn-logout">Đăng xuất</button>
        </nav>
      </header>

      <div className="sub-header">
        🥗 Quản lý kho bếp — {currentScreen === 'CATEGORIES' ? 'Danh mục' : 'Thực phẩm & Nguyên liệu'}
      </div>

      <main className="main-content">
        {/* Menu Tab chuyển đổi màn hình */}
        <div className="tab-menu">
          <div 
            className={`tab-item ${currentScreen === 'CATEGORIES' ? 'active' : ''}`}
            onClick={() => setCurrentScreen('CATEGORIES')}
          >
            Danh mục thực phẩm
          </div>
          <div 
            className={`tab-item ${currentScreen === 'FOODS' ? 'active' : ''}`}
            onClick={() => setCurrentScreen('FOODS')}
          >
            Quản lý Thực phẩm
          </div>
        </div>

        {/* Nội dung thay đổi dựa trên State */}
        {currentScreen === 'CATEGORIES' && <CategoryPage isViewer={isViewer} />}
        {currentScreen === 'FOODS' && <FoodPage isViewer={isViewer} />}
      </main>
    </div>
  );
}

export default App;