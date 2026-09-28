import React, { useState, useEffect } from 'react';
import { fetchApi } from './utils/api';

export interface Category {
  id: number;
  code: string;
  name: string;
  is_active?: boolean;
}

export interface Food {
  id: number;
  code: string;
  name: string;
  category_id: number;
  category_name?: string;
  unit: string;
  is_active: boolean;
  quantity?: string;
  avg_cost?: string;
  stock_version?: number;
}

interface FoodPageProps {
  isViewer?: boolean;
}

const COMMON_UNITS = [
  'kg',
  'g',
  'lít',
  'ml',
  'hộp',
  'gói',
  'chai',
  'bó',
  'quả',
  'con',
  'thùng',
  'bao'
];

export const FoodPage: React.FC<FoodPageProps> = ({ isViewer = false }) => {
  const [foods, setFoods] = useState<Food[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'LOCKED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formUnit, setFormUnit] = useState('kg');
  const [customUnit, setCustomUnit] = useState('');
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<{
    code?: string;
    name?: string;
    category?: string;
    unit?: string;
    general?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  // Tải danh sách thực phẩm & danh mục
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resFoods, resCats] = await Promise.all([
        fetchApi('/api/foods/'),
        fetchApi('/api/categories/')
      ]);

      if (!resFoods.ok || !resCats.ok) {
        throw new Error('Không thể tải dữ liệu từ máy chủ.');
      }

      const foodsData = await resFoods.json();
      const catsData = await resCats.json();

      setFoods(Array.isArray(foodsData) ? foodsData : foodsData.results || []);
      setCategories(Array.isArray(catsData) ? catsData : catsData.results || []);
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi khi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Mở modal tạo mới
  const openCreateModal = () => {
    setModalMode('CREATE');
    setEditingId(null);
    setFormCode('');
    setFormName('');
    setFormCategory(categories.length > 0 ? String(categories[0].id) : '');
    setFormUnit('kg');
    setCustomUnit('');
    setIsCustomUnit(false);
    setFormIsActive(true);
    setFieldErrors({});
    setShowModal(true);
  };

  // Mở modal chỉnh sửa
  const openEditModal = (item: Food) => {
    setModalMode('EDIT');
    setEditingId(item.id);
    setFormCode(item.code);
    setFormName(item.name);
    setFormCategory(String(item.category_id));
    if (COMMON_UNITS.includes(item.unit.toLowerCase())) {
      setFormUnit(item.unit.toLowerCase());
      setIsCustomUnit(false);
      setCustomUnit('');
    } else {
      setFormUnit('other');
      setIsCustomUnit(true);
      setCustomUnit(item.unit);
    }
    setFormIsActive(item.is_active);
    setFieldErrors({});
    setShowModal(true);
  };

  // Số liệu thống kê
  const totalCount = foods.length;
  const activeCount = foods.filter(f => f.is_active).length;
  const lockedCount = totalCount - activeCount;

  // Lọc dữ liệu
  const filteredFoods = foods.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        item.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'ALL' ? true :
                        statusFilter === 'ACTIVE' ? item.is_active : !item.is_active;
    const matchCat = categoryFilter === 'ALL' ? true :
                     String(item.category_id) === categoryFilter;
    return matchSearch && matchStatus && matchCat;
  });

  // Tìm tên danh mục từ ID
  const getCategoryName = (catId: number) => {
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.name : '—';
  };

  // Submit form Tạo / Sửa thực phẩm
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const chosenUnit = isCustomUnit ? customUnit.trim() : formUnit;
    const newFieldErrors: { code?: string; name?: string; category?: string; unit?: string } = {};

    if (!formCode.trim()) newFieldErrors.code = 'Mã thực phẩm không được để trống.';
    if (!formName.trim()) newFieldErrors.name = 'Tên thực phẩm không được để trống.';
    if (!formCategory) newFieldErrors.category = 'Vui lòng chọn danh mục.';
    if (!chosenUnit) newFieldErrors.unit = 'Vui lòng chọn hoặc nhập đơn vị tính.';

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        category_id: Number(formCategory),
        unit: chosenUnit.toLowerCase(),
        is_active: formIsActive,
      };

      if (modalMode === 'CREATE') {
        const res = await fetchApi('/api/foods/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error || errData.message || 'Không thể thêm thực phẩm mới.';
          if (errMsg.toLowerCase().includes('already exists') || errMsg.toLowerCase().includes('trùng')) {
            setFieldErrors({ code: 'Mã thực phẩm đã tồn tại trong hệ thống.' });
          } else {
            setFieldErrors({ general: errMsg });
          }
          return;
        }
      } else {
        // EDIT: PATCH /api/foods/<id>/
        const res = await fetchApi(`/api/foods/${editingId}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error || errData.message || 'Không thể cập nhật thực phẩm.';
          if (errMsg.toLowerCase().includes('already exists') || errMsg.toLowerCase().includes('trùng')) {
            setFieldErrors({ code: 'Mã thực phẩm đã tồn tại trong hệ thống.' });
          } else {
            setFieldErrors({ general: errMsg });
          }
          return;
        }
      }

      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setFieldErrors({ general: err.message || 'Lỗi kết nối máy chủ.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Ngừng dùng / Kích hoạt lại thực phẩm (PATCH is_active)
  const handleToggleActive = async (item: Food) => {
    const nextActive = !item.is_active;
    const actionText = nextActive ? 'kích hoạt lại' : 'ngừng sử dụng';
    if (!window.confirm(`Bạn có chắc chắn muốn ${actionText} thực phẩm "${item.name}"?`)) return;

    try {
      const res = await fetchApi(`/api/foods/${item.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextActive }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Không thể thay đổi trạng thái thực phẩm.');
      }
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="card-container">
      {/* Header */}
      <div className="card-header">
        <div>
          <h2 className="card-title">Quản lý Thực phẩm</h2>
          <p className="card-subtitle">Quản lý danh sách thực phẩm và nguyên liệu nhập kho bếp.</p>
        </div>
        {!isViewer && (
          <button className="btn-add" onClick={openCreateModal}>
            + Thêm thực phẩm
          </button>
        )}
      </div>

      {/* Thống kê */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Tổng thực phẩm</span>
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

      {/* Thanh lọc & tìm kiếm */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Tìm theo mã hoặc tên thực phẩm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="status-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="ALL">Tất cả danh mục ▼</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          className="status-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="ALL">Tất cả trạng thái ▼</option>
          <option value="ACTIVE">Hoạt động</option>
          <option value="LOCKED">Tạm khóa</option>
        </select>
      </div>

      {/* Nội dung bảng */}
      {loading ? (
        <div className="state-box state-loading">⏳ Đang tải dữ liệu thực phẩm...</div>
      ) : error ? (
        <div className="state-box state-error">
          ❌ {error}
          <br />
          <button className="btn-retry" onClick={fetchData}>Thử lại</button>
        </div>
      ) : filteredFoods.length === 0 ? (
        <div className="state-box state-empty">📮 Không tìm thấy thực phẩm nào phù hợp.</div>
      ) : (
        <table className="custom-table">
          <thead>
            <tr>
              <th>MÃ TP</th>
              <th>TÊN THỰC PHẨM</th>
              <th>DANH MỤC</th>
              <th>ĐƠN VỊ TÍNH</th>
              <th>TRẠNG THÁI</th>
              {!isViewer && <th>THAO TÁC</th>}
            </tr>
          </thead>
          <tbody>
            {filteredFoods.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className="code-badge">{item.code}</span>
                </td>
                <td className="cat-name">{item.name}</td>
                <td>{item.category_name || getCategoryName(item.category_id)}</td>
                <td>{item.unit}</td>
                <td>
                  <span className={`status-badge ${item.is_active ? 'status-active' : 'status-locked'}`}>
                    {item.is_active ? '• Hoạt động' : '• Tạm khóa'}
                  </span>
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
                        onClick={() => openEditModal(item)}
                      >
                        Sửa
                      </button>
                      <span style={{ color: '#cbd5e1' }}>|</span>
                      <button
                        className={item.is_active ? 'btn-action-delete' : 'btn-action-activate'}
                        style={!item.is_active ? { color: '#059669', background: 'none', border: 'none', fontWeight: 600, fontSize: '13px', cursor: 'pointer' } : undefined}
                        onClick={() => handleToggleActive(item)}
                      >
                        {item.is_active ? 'Ngừng dùng' : 'Kích hoạt'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal thêm / sửa thực phẩm */}
      {showModal && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h3 style={{ marginBottom: 16, fontSize: 18, fontWeight: 700 }}>
              {modalMode === 'CREATE' ? 'Thêm thực phẩm mới' : 'Chỉnh sửa thực phẩm'}
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

            <form onSubmit={handleSubmit}>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Mã thực phẩm (*)</label>
                <input
                  type="text"
                  required
                  disabled={submitting}
                  style={{
                    ...modalStyles.input,
                    borderColor: fieldErrors.code ? '#dc2626' : '#cbd5e1',
                    textTransform: 'uppercase'
                  }}
                  placeholder="VD: GA01, THIT01"
                  value={formCode}
                  onChange={(e) => {
                    setFormCode(e.target.value);
                    if (fieldErrors.code) setFieldErrors(prev => ({ ...prev, code: '' }));
                  }}
                />
                {fieldErrors.code && (
                  <span style={modalStyles.fieldError}>{fieldErrors.code}</span>
                )}
              </div>

              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Tên thực phẩm (*)</label>
                <input
                  type="text"
                  required
                  disabled={submitting}
                  style={{
                    ...modalStyles.input,
                    borderColor: fieldErrors.name ? '#dc2626' : '#cbd5e1'
                  }}
                  placeholder="VD: Gạo tẻ ST25, Thịt lợn ba chỉ"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: '' }));
                  }}
                />
                {fieldErrors.name && (
                  <span style={modalStyles.fieldError}>{fieldErrors.name}</span>
                )}
              </div>

              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Danh mục (*)</label>
                <select
                  required
                  disabled={submitting}
                  style={{
                    ...modalStyles.input,
                    borderColor: fieldErrors.category ? '#dc2626' : '#cbd5e1'
                  }}
                  value={formCategory}
                  onChange={(e) => {
                    setFormCategory(e.target.value);
                    if (fieldErrors.category) setFieldErrors(prev => ({ ...prev, category: '' }));
                  }}
                >
                  <option value="">-- Chọn danh mục --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.code})
                    </option>
                  ))}
                </select>
                {fieldErrors.category && (
                  <span style={modalStyles.fieldError}>{fieldErrors.category}</span>
                )}
              </div>

              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Đơn vị tính (*)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    style={{ ...modalStyles.input, flex: 1 }}
                    value={isCustomUnit ? 'other' : formUnit}
                    disabled={submitting}
                    onChange={(e) => {
                      if (e.target.value === 'other') {
                        setIsCustomUnit(true);
                      } else {
                        setIsCustomUnit(false);
                        setFormUnit(e.target.value);
                      }
                      if (fieldErrors.unit) setFieldErrors(prev => ({ ...prev, unit: '' }));
                    }}
                  >
                    {COMMON_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    <option value="other">-- Nhập khác --</option>
                  </select>

                  {isCustomUnit && (
                    <input
                      type="text"
                      placeholder="Nhập đơn vị..."
                      style={{ ...modalStyles.input, flex: 1, borderColor: fieldErrors.unit ? '#dc2626' : '#cbd5e1' }}
                      value={customUnit}
                      disabled={submitting}
                      onChange={(e) => {
                        setCustomUnit(e.target.value);
                        if (fieldErrors.unit) setFieldErrors(prev => ({ ...prev, unit: '' }));
                      }}
                      required
                    />
                  )}
                </div>
                {fieldErrors.unit && (
                  <span style={modalStyles.fieldError}>{fieldErrors.unit}</span>
                )}
              </div>

              <div style={{ ...modalStyles.formGroup, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id="form_is_active"
                  checked={formIsActive}
                  disabled={submitting}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                />
                <label htmlFor="form_is_active" style={{ fontSize: 13, cursor: 'pointer' }}>
                  Đang hoạt động (cho phép sử dụng trong kho)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button
                  type="button"
                  style={modalStyles.btnCancel}
                  disabled={submitting}
                  onClick={() => setShowModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-add"
                  style={{
                    opacity: submitting ? 0.7 : 1,
                    cursor: submitting ? 'not-allowed' : 'pointer'
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

// CSS inline cho Modal và Field Error
const modalStyles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#ffffff',
    padding: '24px',
    borderRadius: '12px',
    width: '450px',
    maxWidth: '90%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '14px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  fieldError: {
    fontSize: '12px',
    color: '#dc2626',
    marginTop: '2px',
  },
  btnCancel: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  }
};

export default FoodPage;