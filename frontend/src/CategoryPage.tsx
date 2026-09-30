import React, { useState, useEffect } from 'react';
import { fetchApi } from './utils/api';

export interface Category {
  id?: number | string;
  code?: string;
  name?: string;
  is_active?: boolean;
  status?: string;
}

interface CategoryPageProps {
  isViewer?: boolean;
}

export const CategoryPage: React.FC<CategoryPageProps> = ({ isViewer = false }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // --- STATE CHO MODAL TẠO / SỬA ---
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [formCode, setFormCode] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formStatus, setFormStatus] = useState<string>('active');
  const [fieldErrors, setFieldErrors] = useState<{ code?: string; name?: string; general?: string }>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Hàm tải danh sách danh mục
  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchApi('/api/categories/');
      if (!response.ok) {
        throw new Error('Lỗi kết nối máy chủ: ' + response.status);
      }
      const data = await response.json();
      const list = Array.isArray(data) ? data : data.results || [];
      setCategories(list);
    } catch (err: any) {
      setError(err.message || 'Không thể kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const openCreateModal = () => {
    setModalMode('CREATE');
    setEditingId(null);
    setFormCode('');
    setFormName('');
    setFormStatus('active');
    setFieldErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setModalMode('EDIT');
    setEditingId(cat.id || null);
    setFormCode(cat.code || '');
    setFormName(cat.name || '');
    const isActive = cat.is_active === true || cat.status === 'active' || cat.status === 'Hoạt động';
    setFormStatus(isActive ? 'active' : 'locked');
    setFieldErrors({});
    setIsModalOpen(true);
  };

  // --- HÀM XỬ LÝ LƯU DANH MỤC (TẠO MỚI / SỬA) ---
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const newFieldErrors: { code?: string; name?: string } = {};
    if (!formCode.trim()) newFieldErrors.code = 'Mã danh mục không được để trống.';
    if (!formName.trim()) newFieldErrors.name = 'Tên danh mục không được để trống.';

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const isActiveValue = formStatus === 'active';

      if (modalMode === 'CREATE') {
        const response = await fetchApi('/api/categories/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: formCode.trim().toUpperCase(),
            name: formName.trim(),
            is_active: isActiveValue,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error || errData.detail || errData.message || 'Thêm mới thất bại.';
          if (errMsg.toLowerCase().includes('already exists') || errMsg.toLowerCase().includes('trùng')) {
            setFieldErrors({ code: 'Mã danh mục đã tồn tại trong hệ thống.' });
          } else {
            setFieldErrors({ general: errMsg });
          }
          return;
        }
      } else {
        // EDIT: PATCH /api/categories/<id>/
        const response = await fetchApi(`/api/categories/${editingId}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: formCode.trim().toUpperCase(),
            name: formName.trim(),
            is_active: isActiveValue,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error || errData.detail || errData.message || 'Cập nhật thất bại.';
          if (errMsg.toLowerCase().includes('already exists') || errMsg.toLowerCase().includes('trùng')) {
            setFieldErrors({ code: 'Mã danh mục đã tồn tại trong hệ thống.' });
          } else if (errMsg.includes('referenced by FoodItem')) {
            setFieldErrors({ general: 'Không thể tạm khóa danh mục vì đang có thực phẩm liên kết!' });
          } else {
            setFieldErrors({ general: errMsg });
          }
          return;
        }
      }

      setIsModalOpen(false);
      fetchCategories();
    } catch (err: any) {
      setFieldErrors({ general: err.message || 'Lỗi kết nối đến máy chủ.' });
    } finally {
      setSubmitting(false);
    }
  };

  // --- HÀM XỬ LÝ CHUYỂN TRẠNG THÁI DANH MỤC (PATCH) ---
  const handleToggleActive = async (cat: Category) => {
    if (!cat.id) return;
    const currentActive = cat.is_active === true || cat.status === 'active' || cat.status === 'Hoạt động';
    const nextActive = !currentActive;
    const actionText = nextActive ? 'kích hoạt lại' : 'ngừng sử dụng';

    if (!window.confirm(`Bạn có chắc chắn muốn ${actionText} danh mục "${cat.name}"?`)) return;

    try {
      const response = await fetchApi(`/api/categories/${cat.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: nextActive,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error || errData.detail || errData.message || 'Cập nhật trạng thái thất bại';
        if (errMsg.includes('referenced by FoodItem')) {
          alert('Không thể ngừng sử dụng danh mục vì đang có thực phẩm liên kết tới danh mục này!');
        } else {
          alert(errMsg);
        }
        return;
      }

      fetchCategories();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật trạng thái');
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
        {!isViewer && (
          <button 
            className="btn-add"
            onClick={openCreateModal}
          >
            + Thêm danh mục
          </button>
        )}
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

      {error && !loading && (
        <div className="state-box state-error">
          ❌ {error}
          <br />
          <button className="btn-retry" onClick={fetchCategories}>Thử lại</button>
        </div>
      )}

      {!loading && !error && filteredCategories.length === 0 && (
        <div className="state-box state-empty">
          Không tìm thấy danh mục nào phù hợp.
        </div>
      )}

      {!loading && !error && filteredCategories.length > 0 && (
        <table className="custom-table">
          <thead>
            <tr>
              <th>MÃ</th>
              <th>TÊN DANH MỤC</th>
              <th>TRẠNG THÁI</th>
              {!isViewer && <th>HÀNH ĐỘNG</th>}
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
                  {!isViewer && (
                    <td>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#0284c7',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            padding: '2px 6px',
                          }}
                          onClick={() => openEditModal(cat)}
                        >
                          Sửa
                        </button>
                        <span style={{ color: '#cbd5e1' }}>|</span>
                        <button 
                          className={isActive ? "btn-action-delete" : "btn-action-activate"}
                          style={!isActive ? { color: '#059669', background: 'none', border: 'none', fontWeight: 600, fontSize: '13px', cursor: 'pointer' } : undefined}
                          onClick={() => handleToggleActive(cat)}
                        >
                          {isActive ? 'Ngừng dùng' : 'Kích hoạt'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* MODAL FORM TẠO MỚI / CHỈNH SỬA DANH MỤC */}
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
              {modalMode === 'CREATE' ? 'Thêm danh mục mới' : 'Chỉnh sửa danh mục'}
            </h3>

            {fieldErrors.general && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#fef2f2',
                color: '#b91c1c',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '14px',
              }}>
                ⚠️ {fieldErrors.general}
              </div>
            )}

            <form onSubmit={handleSaveCategory}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: '#374151', fontWeight: 500 }}>
                  Mã danh mục (*)
                </label>
                <input 
                  type="text" 
                  value={formCode}
                  onChange={(e) => {
                    setFormCode(e.target.value);
                    if (fieldErrors.code) setFieldErrors(prev => ({ ...prev, code: '' }));
                  }}
                  placeholder="Ví dụ: RAU_CU"
                  required
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: `1px solid ${fieldErrors.code ? '#dc2626' : '#d1d5db'}`,
                    borderRadius: '6px',
                    boxSizing: 'border-box',
                    outline: 'none',
                    textTransform: 'uppercase'
                  }}
                />
                {fieldErrors.code && (
                  <span style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.code}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: '#374151', fontWeight: 500 }}>
                  Tên danh mục (*)
                </label>
                <input 
                  type="text" 
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: '' }));
                  }}
                  placeholder="Ví dụ: Rau củ quả tươi"
                  required
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: `1px solid ${fieldErrors.name ? '#dc2626' : '#d1d5db'}`,
                    borderRadius: '6px',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
                {fieldErrors.name && (
                  <span style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.name}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: '#374151', fontWeight: 500 }}>
                  Trạng thái
                </label>
                <select 
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  disabled={submitting}
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
                  disabled={submitting}
                  style={{ padding: '10px 16px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  style={{
                    padding: '10px 16px',
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                    opacity: submitting ? 0.7 : 1
                  }}
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