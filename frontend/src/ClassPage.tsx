import React, { useState, useEffect, useMemo } from 'react';
import { fetchApi } from './utils/api';

export interface SchoolClass {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

interface ClassPageProps {
  isViewer?: boolean;
}

export const ClassPage: React.FC<ClassPageProps> = ({ isViewer = false }) => {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tìm kiếm và lọc
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal Tạo / Sửa lớp
  const [showModal, setShowModal] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formCode, setFormCode] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);

  // Lỗi hiển thị đúng từng trường (Field-level errors)
  const [fieldErrors, setFieldErrors] = useState<{
    code?: string;
    name?: string;
    general?: string;
  }>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Tải danh sách lớp học
  const fetchClasses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi('/api/classes/');
      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi mã lỗi ${res.status}`);
      }
      const data = await res.json();
      setClasses(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách lớp học');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const openCreateModal = () => {
    setModalMode('CREATE');
    setEditingId(null);
    setFormCode('');
    setFormName('');
    setFormIsActive(true);
    setFieldErrors({});
    setShowModal(true);
  };

  const openEditModal = (cls: SchoolClass) => {
    setModalMode('EDIT');
    setEditingId(cls.id);
    setFormCode(cls.code);
    setFormName(cls.name);
    setFormIsActive(cls.is_active);
    setFieldErrors({});
    setShowModal(true);
  };

  // Lưu thông tin lớp (Tạo mới hoặc Sửa)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSuccessMessage(null);

    const newErrors: { code?: string; name?: string; general?: string } = {};

    if (modalMode === 'CREATE' && !formCode.trim()) {
      newErrors.code = 'Mã lớp không được để trống.';
    }
    if (!formName.trim()) {
      newErrors.name = 'Tên lớp không được để trống.';
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      if (modalMode === 'CREATE') {
        const res = await fetchApi('/api/classes/', {
          method: 'POST',
          body: JSON.stringify({
            code: formCode.trim().toUpperCase(),
            name: formName.trim(),
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 201) {
          setShowModal(false);
          setSuccessMessage(`Đã tạo lớp ${data.code} - ${data.name} thành công.`);
          await fetchClasses();
        } else if (res.status === 409) {
          // Lỗi mã trùng: hiển thị đúng trường code
          setFieldErrors({
            code: 'Mã lớp này đã tồn tại trong hệ thống. Vui lòng nhập mã khác.',
          });
        } else if (res.status === 400) {
          const msg = data.message || '';
          if (msg.toLowerCase().includes('code')) {
            setFieldErrors({ code: 'Mã lớp không hợp lệ hoặc bị thiếu.' });
          } else if (msg.toLowerCase().includes('name')) {
            setFieldErrors({ name: 'Tên lớp không hợp lệ hoặc bị thiếu.' });
          } else {
            setFieldErrors({ general: msg || 'Dữ liệu không hợp lệ.' });
          }
        } else if (res.status === 403) {
          setFieldErrors({ general: 'Bạn không có quyền tạo lớp học (Viewer chỉ xem).' });
        } else {
          setFieldErrors({ general: data.message || `Lỗi máy chủ (${res.status})` });
        }
      } else {
        // Mode EDIT: PATCH /api/classes/<id>/
        const res = await fetchApi(`/api/classes/${editingId}/`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formName.trim(),
            is_active: formIsActive,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          setShowModal(false);
          setSuccessMessage(`Cập nhật lớp ${data.code} thành công.`);
          await fetchClasses();
        } else if (res.status === 400) {
          // Lỗi trường tên: hiển thị đúng trường name
          setFieldErrors({ name: data.message || 'Tên lớp không hợp lệ.' });
        } else if (res.status === 403) {
          setFieldErrors({ general: 'Bạn không có quyền chỉnh sửa lớp học (Viewer chỉ xem).' });
        } else {
          setFieldErrors({ general: data.message || `Lỗi máy chủ (${res.status})` });
        }
      }
    } catch (err: any) {
      setFieldErrors({ general: err.message || 'Lỗi kết nối khi gửi dữ liệu.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Chức năng bật/tắt nhanh trạng thái hoạt động của lớp
  const handleToggleActive = async (cls: SchoolClass) => {
    if (isViewer) return;
    try {
      const res = await fetchApi(`/api/classes/${cls.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_active: !cls.is_active,
        }),
      });
      if (res.ok) {
        setSuccessMessage(`Đã ${!cls.is_active ? 'kích hoạt' : 'ngừng dùng'} lớp ${cls.code}.`);
        await fetchClasses();
      }
    } catch (e: any) {
      setError(e.message || 'Không thể đổi trạng thái lớp');
    }
  };

  // Lọc danh sách lớp
  const filteredClasses = useMemo(() => {
    return classes.filter((cls) => {
      if (statusFilter === 'ACTIVE' && !cls.is_active) return false;
      if (statusFilter === 'INACTIVE' && cls.is_active) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return cls.code.toLowerCase().includes(term) || cls.name.toLowerCase().includes(term);
      }
      return true;
    });
  }, [classes, statusFilter, searchTerm]);

  return (
    <div className="class-page">
      {/* Banner Viewer */}
      {isViewer && (
        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          color: '#1e40af',
          padding: '10px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>ℹ️</span>
          <span>Bạn đang xem danh sách với quyền <strong>Viewer (Người xem)</strong>. Các thao tác thêm, sửa và ngừng dùng lớp học bị ẩn.</span>
        </div>
      )}

      {/* Thông báo thành công */}
      {successMessage && (
        <div style={{
          backgroundColor: '#dcfce7',
          border: '1px solid #bbf7d0',
          color: '#15803d',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>✅ {successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="card-container">
        <div className="card-header">
          <div>
            <h2 className="card-title">🏫 Quản lý Lớp Học</h2>
            <p className="card-subtitle">
              Danh sách các lớp học trong trường tham gia chương trình ăn bán trú
            </p>
          </div>
          {!isViewer && (
            <button
              className="btn-add"
              onClick={openCreateModal}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>➕</span>
              <span>Thêm lớp mới</span>
            </button>
          )}
        </div>

        {/* Thanh tìm kiếm & bộ lọc */}
        <div className="filter-bar">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Tìm theo mã lớp (VD: 10A1) hoặc tên lớp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="INACTIVE">Ngừng dùng</option>
          </select>
          <button
            onClick={fetchClasses}
            disabled={loading}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              padding: '9px 14px',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              color: '#475569',
            }}
          >
            {loading ? '🔄 Đang tải...' : '🔄 Làm mới'}
          </button>
        </div>

        {/* Trạng thái dữ liệu */}
        {loading ? (
          <div className="state-box state-loading">
            ⏳ Đang tải danh sách lớp học...
          </div>
        ) : error ? (
          <div className="state-box state-error">
            <p><strong>Lỗi:</strong> {error}</p>
            <button className="btn-retry" onClick={fetchClasses}>Thử lại</button>
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="state-box state-empty">
            {classes.length === 0 ? 'Chưa có lớp học nào trong hệ thống.' : 'Không tìm thấy lớp học nào khớp với tìm kiếm.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table" id="classes-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>ID</th>
                  <th style={{ width: '140px' }}>MÃ LỚP</th>
                  <th>TÊN LỚP HỌC</th>
                  <th style={{ width: '160px' }}>TRẠNG THÁI</th>
                  {!isViewer && <th style={{ width: '160px', textAlign: 'center' }}>THAO TÁC</th>}
                </tr>
              </thead>
              <tbody>
                {filteredClasses.map((cls) => (
                  <tr key={cls.id}>
                    <td style={{ color: '#94a3b8', fontSize: '12px' }}>#{cls.id}</td>
                    <td>
                      <span className="code-badge">{cls.code}</span>
                    </td>
                    <td>
                      <strong className="cat-name">{cls.name}</strong>
                    </td>
                    <td>
                      {cls.is_active ? (
                        <span className="status-badge status-active">
                          ● Hoạt động
                        </span>
                      ) : (
                        <span className="status-badge status-locked">
                          ○ Ngừng dùng
                        </span>
                      )}
                    </td>
                    {!isViewer && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => openEditModal(cls)}
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              padding: '4px 10px',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#2563eb',
                              cursor: 'pointer'
                            }}
                          >
                            ✏️ Sửa
                          </button>
                          <button
                            onClick={() => handleToggleActive(cls)}
                            style={{
                              background: 'none',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              padding: '4px 10px',
                              fontSize: '12px',
                              color: cls.is_active ? '#dc2626' : '#15803d',
                              fontWeight: 500,
                              cursor: 'pointer'
                            }}
                          >
                            {cls.is_active ? 'Ngừng dùng' : 'Kích hoạt'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL TẠO / SỬA LỚP HỌC */}
      {/* ============================================================== */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            maxWidth: '460px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>
              {modalMode === 'CREATE' ? '➕ Thêm Lớp Học Mới' : `✏️ Chỉnh Sửa Lớp [${formCode}]`}
            </h3>

            {fieldErrors.general && (
              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                ❌ {fieldErrors.general}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Trường Mã lớp */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Mã lớp: <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: 10A1, 11B2..."
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  disabled={modalMode === 'EDIT'} // Mã lớp không được sửa khi đã tạo
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: fieldErrors.code ? '1px solid #dc2626' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: modalMode === 'EDIT' ? '#f1f5f9' : '#ffffff',
                    color: modalMode === 'EDIT' ? '#64748b' : '#0f172a',
                    fontWeight: 600
                  }}
                />
                {fieldErrors.code && (
                  <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
                    ⚠️ {fieldErrors.code}
                  </p>
                )}
                {modalMode === 'EDIT' && (
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'block' }}>
                    Mã lớp là định danh duy nhất và không thể thay đổi sau khi tạo.
                  </span>
                )}
              </div>

              {/* Trường Tên lớp */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Tên lớp học: <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Lớp 10A1 (Chuyên Toán)..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: fieldErrors.name ? '1px solid #dc2626' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: '#ffffff'
                  }}
                />
                {fieldErrors.name && (
                  <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
                    ⚠️ {fieldErrors.name}
                  </p>
                )}
              </div>

              {/* Trạng thái hoạt động (khi Sửa) */}
              {modalMode === 'EDIT' && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Trạng thái:
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span>Lớp đang hoạt động (ăn bán trú)</span>
                  </label>
                </div>
              )}

              {/* Nút hành động */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    backgroundColor: submitting ? '#94a3b8' : '#059669',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 20px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? '⏳ Đang lưu...' : (modalMode === 'CREATE' ? 'Lưu lớp mới' : 'Cập nhật')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassPage;
