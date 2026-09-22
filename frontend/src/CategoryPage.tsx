import React, { useState, useEffect } from 'react';

export interface Category {
  id?: number | string;
  code?: string;
  name?: string;
  is_active?: boolean;
  status?: string;
}

export const CategoryPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // --- STATE CHO MODAL THÊM MỚI (Bao gồm cả Trạng thái) ---
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newCode, setNewCode] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newStatus, setNewStatus] = useState<string>('active'); // Mặc định là Hoạt động
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Hàm tải danh sách
  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/categories/');
      if (!response.ok) {
        throw new Error('Lỗi kết nối Backend: ' + response.status);
      }
      const data = await response.json();
      const list = Array.isArray(data) ? data : data.results || [];
      setCategories(list);
    } catch (err: any) {
      setError(err.message || 'Không thể kết nối Backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // --- HÀM XỬ LÝ GỬI API THÊM MỚI (POST) ---
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Chuyển đổi trạng thái từ giao diện sang giá trị boolean is_active của Django
      const isActiveValue = newStatus === 'active';

      const response = await fetch('/api/categories/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: newCode,
          name: newName,
          is_active: isActiveValue,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Thêm mới thất bại. Vui lòng kiểm tra lại!');
      }

      // Đóng modal, reset form và làm mới lại bảng dữ liệu
      setIsModalOpen(false);
      setNewCode('');
      setNewName('');
      setNewStatus('active');
      fetchCategories();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- HÀM XỬ LÝ XÓA DANH MỤC (DELETE) ---
  const handleDeleteCategory = async (id: number | string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa danh mục này không?')) return;
    
    try {
      const response = await fetch(`/api/categories/${id}/`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Xóa thất bại từ server');
      }

      fetchCategories();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const totalCount = categories.length;
  const activeCount = categories.filter(
    (c) => c.is_active === true || c.status === 'active' || c.status === 'Hoạt động'
  ).length;
  const lockedCount = categories.filter(
    (c) => c.is_active === false || c.status === 'locked' || c.status === 'Tạm khóa'
  ).length;

  const filteredCategories = categories.filter((cat) => {
    const nameStr = cat.name || '';
    const codeStr = cat.code || '';
    const matchesSearch =
      nameStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      codeStr.toLowerCase().includes(searchTerm.toLowerCase());

    const isAct = cat.is_active === true || cat.status === 'active' || cat.status === 'Hoạt động';
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && isAct) ||
      (statusFilter === 'locked' && !isAct);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="card-container">
      <div className="card-header">
        <div>
          <h2 className="card-title">Danh mục thực phẩm</h2>
          <p className="card-subtitle">
            Quản lý các nhóm thực phẩm và nguyên liệu trong kho bếp.
          </p>
        </div>
        <button 
          className="btn-add"
          onClick={() => setIsModalOpen(true)}
        >
          + Thêm mới
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Tổng danh mục</span>
          <span className="stat-value text-dark">{totalCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Đang hoạt động</span>
          <span className="stat-value text-green">{activeCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Tạm khóa</span>
          <span className="stat-value text-red">{lockedCount}</span>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Tìm theo mã hoặc tên danh mục..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="status-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Tất cả trạng thái ▼</option>
          <option value="active">Đang hoạt động</option>
          <option value="locked">Tạm khóa</option>
        </select>
      </div>

      {loading && (
        <div className="state-box state-loading">
          ⏳ Đang tải dữ liệu từ CSDL...
        </div>
      )}

      {!loading && error && (
        <div className="state-box state-error">
          <p>⚠️ {error}</p>
          <button onClick={fetchCategories} className="btn-retry">
            🔄 Thử lại
          </button>
        </div>
      )}

      {!loading && !error && filteredCategories.length === 0 && (
        <div className="state-box state-empty">
          📭 Không tìm thấy danh mục nào.
        </div>
      )}

      {!loading && !error && filteredCategories.length > 0 && (
        <table className="custom-table">
          <thead>
            <tr>
              <th>MÃ</th>
              <th>TÊN DANH MỤC</th>
              <th>TRẠNG THÁI</th>
              <th>HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody>
            {filteredCategories.map((cat, index) => {
              const isActive = cat.is_active === true || cat.status === 'active' || cat.status === 'Hoạt động';
              return (
                <tr key={cat.id || index}>
                  <td>
                    <span className="code-badge">{cat.code || 'N/A'}</span>
                  </td>
                  <td className="cat-name">{cat.name || 'Không có tên'}</td>
                  <td>
                    {isActive ? (
                      <span className="status-badge status-active">
                        • Hoạt động
                      </span>
                    ) : (
                      <span className="status-badge status-locked">
                        • Tạm khóa
                      </span>
                    )}
                  </td>
                  <td>
                    <button 
                      className="btn-action-delete"
                      onClick={() => cat.id && handleDeleteCategory(cat.id)}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* --- MODAL FORM THÊM MỚI DANH MỤC (ĐÃ CÓ TRẠNG THÁI) --- */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '12px',
            width: '420px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>
              Thêm danh mục mới
            </h3>
            <form onSubmit={handleCreateCategory}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', color: '#374151', fontWeight: 500 }}>
                  Mã danh mục
                </label>
                <input 
                  type="text" 
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Ví dụ: CAT01"
                  required
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', color: '#374151', fontWeight: 500 }}>
                  Tên danh mục
                </label>
                <input 
                  type="text" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ví dụ: Thực phẩm tươi sống"
                  required
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', color: '#374151', fontWeight: 500 }}>
                  Trạng thái
                </label>
                <select 
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#fff', boxSizing: 'border-box' }}
                >
                  <option value="active">Hoạt động</option>
                  <option value="locked">Tạm khóa</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '10px 16px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  style={{ padding: '10px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                >
                  {submitting ? 'Đang lưu...' : 'Lưu vào CSDL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryPage;