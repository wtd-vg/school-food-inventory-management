import React, { useState, useEffect, useMemo } from 'react';
import { fetchApi } from './utils/api';

export interface DishComponent {
  food_id: number;
  quantity: string;
  food_unit?: string;
  unit?: string;
}

export interface Dish {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  components: DishComponent[];
}

export interface FoodOption {
  id: number;
  code: string;
  name: string;
  unit: string;
  is_active: boolean;
}

interface RecipePageProps {
  isViewer?: boolean;
}

interface RecipeLineDraft {
  food_id: number | '';
  quantity: string;
  unit: string;
}

export const RecipePage: React.FC<RecipePageProps> = ({ isViewer = false }) => {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Danh mục thực phẩm để chọn trong công thức
  const [foods, setFoods] = useState<FoodOption[]>([]);

  // Lọc và tìm kiếm món ăn
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal Tạo / Sửa món và công thức
  const [showModal, setShowModal] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state - Giữ nguyên toàn bộ giá trị khi gửi sai dữ liệu, không bị reset!
  const [formCode, setFormCode] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [recipeLines, setRecipeLines] = useState<RecipeLineDraft[]>([
    { food_id: '', quantity: '', unit: 'g' }
  ]);

  // Modal xem chi tiết công thức (Dành cho viewer hoặc xem nhanh)
  const [viewingDish, setViewingDish] = useState<Dish | null>(null);

  // Lỗi hiển thị
  const [fieldErrors, setFieldErrors] = useState<{
    code?: string;
    name?: string;
    general?: string;
    lines?: string;
  }>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Tải danh sách món ăn và công thức
  const fetchDishes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi('/api/dishes/');
      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi mã lỗi ${res.status}`);
      }
      const data = await res.json();
      setDishes(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách món ăn');
    } finally {
      setLoading(false);
    }
  };

  // Tải danh sách thực phẩm
  const fetchFoods = async () => {
    try {
      const res = await fetchApi('/api/foods/');
      if (res.ok) {
        const data = await res.json();
        setFoods(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) {
      console.error('Không thể tải thực phẩm:', e);
    }
  };

  useEffect(() => {
    fetchDishes();
    fetchFoods();
  }, []);

  // Map food_id sang FoodOption
  const foodMap = useMemo(() => {
    const map = new Map<number, FoodOption>();
    foods.forEach((f) => map.set(f.id, f));
    return map;
  }, [foods]);

  // Đơn vị phù hợp theo đơn vị kho của thực phẩm
  const getAvailableUnits = (foodUnit?: string): string[] => {
    if (!foodUnit) return ['g', 'kg', 'ml', 'lit', 'cái', 'piece'];
    const u = foodUnit.toLowerCase().trim();
    if (u === 'kg') return ['g', 'kg'];
    if (u === 'g') return ['g', 'kg'];
    if (u === 'lit' || u === 'lít' || u === 'l') return ['ml', 'lit'];
    if (u === 'ml') return ['ml', 'lit'];
    if (u === 'piece' || u === 'cái' || u === 'quả' || u === 'hộp') return [foodUnit, 'piece'];
    return [foodUnit];
  };

  // Kiểm tra trùng thực phẩm trong các dòng công thức
  const duplicateFoodIds = useMemo(() => {
    const counts = new Map<number, number>();
    recipeLines.forEach((line) => {
      if (typeof line.food_id === 'number') {
        counts.set(line.food_id, (counts.get(line.food_id) || 0) + 1);
      }
    });
    const dupes = new Set<number>();
    counts.forEach((count, id) => {
      if (count > 1) dupes.add(id);
    });
    return dupes;
  }, [recipeLines]);

  const openCreateModal = () => {
    setModalMode('CREATE');
    setEditingId(null);
    setFormCode('');
    setFormName('');
    setFormIsActive(true);
    setRecipeLines([{ food_id: '', quantity: '', unit: 'g' }]);
    setFieldErrors({});
    setShowModal(true);
  };

  const openEditModal = (dish: Dish) => {
    setModalMode('EDIT');
    setEditingId(dish.id);
    setFormCode(dish.code);
    setFormName(dish.name);
    setFormIsActive(dish.is_active);

    // Chuẩn bị các dòng công thức từ món hiện tại
    const lines: RecipeLineDraft[] = (dish.components || []).map((c) => {
      const f = foodMap.get(c.food_id);
      return {
        food_id: c.food_id,
        quantity: c.quantity,
        unit: c.food_unit || f?.unit || 'kg',
      };
    });

    setRecipeLines(lines.length > 0 ? lines : [{ food_id: '', quantity: '', unit: 'g' }]);
    setFieldErrors({});
    setShowModal(true);
  };

  // Thêm dòng nguyên liệu vào công thức
  const handleAddLine = () => {
    setRecipeLines((prev) => [...prev, { food_id: '', quantity: '', unit: 'g' }]);
  };

  // Xóa dòng nguyên liệu
  const handleRemoveLine = (index: number) => {
    if (recipeLines.length <= 1) return;
    setRecipeLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Thay đổi giá trị dòng
  const handleLineChange = (index: number, field: keyof RecipeLineDraft, value: any) => {
    setRecipeLines((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };

      // Khi chọn thực phẩm mới, tự động gợi ý đơn vị mặc định thông dụng
      if (field === 'food_id' && typeof value === 'number') {
        const food = foodMap.get(value);
        if (food) {
          const avail = getAvailableUnits(food.unit);
          updated.unit = avail[0]; // Mặc định chọn đơn vị đầu tiên (vd: 'g' cho kg)
        }
      }

      next[index] = updated;
      return next;
    });
  };

  // Xử lý nộp form (Tạo hoặc Sửa món & công thức)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSuccessMessage(null);

    const errors: { code?: string; name?: string; general?: string; lines?: string } = {};

    if (modalMode === 'CREATE' && !formCode.trim()) {
      errors.code = 'Mã món không được để trống.';
    }
    if (!formName.trim()) {
      errors.name = 'Tên món không được để trống.';
    }

    if (recipeLines.length === 0) {
      errors.lines = 'Công thức phải có ít nhất một nguyên liệu.';
    }

    // Kiểm tra từng dòng
    for (let i = 0; i < recipeLines.length; i++) {
      const line = recipeLines[i];
      if (!line.food_id) {
        errors.lines = `Dòng #${i + 1}: Vui lòng chọn nguyên liệu thực phẩm.`;
        break;
      }
      const qtyNum = Number(line.quantity);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        errors.lines = `Dòng #${i + 1}: Định lượng phải là số lớn hơn 0.`;
        break;
      }
      if (!line.unit) {
        errors.lines = `Dòng #${i + 1}: Vui lòng chọn đơn vị tính.`;
        break;
      }
    }

    // YÊU CẦU: Hai dòng trùng food bị báo lỗi ngay trên UI
    if (duplicateFoodIds.size > 0) {
      errors.lines = 'Có nguyên liệu bị trùng lặp giữa các dòng. Mỗi loại thực phẩm chỉ được thêm một lần trong công thức.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const componentsPayload = recipeLines.map((l) => ({
        food_id: Number(l.food_id),
        quantity: l.quantity,
        unit: l.unit,
      }));

      if (modalMode === 'CREATE') {
        const res = await fetchApi('/api/dishes/', {
          method: 'POST',
          body: JSON.stringify({
            code: formCode.trim().toUpperCase(),
            name: formName.trim(),
            components: componentsPayload,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 201) {
          setShowModal(false);
          setSuccessMessage(`Đã tạo món [${data.code}] ${data.name} kèm công thức thành công.`);
          await fetchDishes();
        } else {
          // YÊU CẦU QUAN TRỌNG: Gửi sai dữ liệu KHÔNG MẤT TOÀN BỘ PHẦN ĐANG NHẬP!
          // Form vẫn giữ nguyên showModal=true, các biến state (formCode, formName, recipeLines) không hề bị reset.
          if (res.status === 409) {
            setFieldErrors({ code: 'Mã món ăn đã tồn tại. Vui lòng chọn mã khác.' });
          } else if (res.status === 400) {
            const msg = data.message || 'Dữ liệu không hợp lệ.';
            if (msg.includes('Duplicate food')) {
              setFieldErrors({ lines: 'Máy chủ phát hiện nguyên liệu trùng lặp trong công thức.' });
            } else if (msg.includes('Code and name')) {
              setFieldErrors({ general: 'Mã món và tên món là bắt buộc.' });
            } else if (msg.includes('Cannot convert') || msg.includes('unit')) {
              setFieldErrors({ lines: `Lỗi quy đổi đơn vị: ${msg}` });
            } else {
              setFieldErrors({ general: msg });
            }
          } else if (res.status === 403) {
            setFieldErrors({ general: 'Bạn không có quyền thao tác (Tài khoản Viewer chỉ có quyền xem).' });
          } else {
            setFieldErrors({ general: data.message || `Lỗi từ máy chủ (HTTP ${res.status})` });
          }
        }
      } else {
        // Mode EDIT: PATCH /api/dishes/<id>/
        const res = await fetchApi(`/api/dishes/${editingId}/`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formName.trim(),
            is_active: formIsActive,
            components: componentsPayload,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          setShowModal(false);
          setSuccessMessage(`Đã cập nhật món [${data.code}] ${data.name} thành công.`);
          await fetchDishes();
        } else {
          // Giữ nguyên phần đang nhập khi lỗi server
          if (res.status === 400) {
            setFieldErrors({ general: data.message || 'Dữ liệu cập nhật không hợp lệ.' });
          } else if (res.status === 403) {
            setFieldErrors({ general: 'Bạn không có quyền chỉnh sửa công thức món.' });
          } else {
            setFieldErrors({ general: data.message || `Lỗi máy chủ (${res.status})` });
          }
        }
      }
    } catch (err: any) {
      // Giữ nguyên form khi gặp lỗi mạng
      setFieldErrors({ general: err.message || 'Lỗi kết nối khi gửi dữ liệu.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Lọc danh sách món ăn
  const filteredDishes = useMemo(() => {
    return dishes.filter((d) => {
      if (statusFilter === 'ACTIVE' && !d.is_active) return false;
      if (statusFilter === 'INACTIVE' && d.is_active) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return d.code.toLowerCase().includes(term) || d.name.toLowerCase().includes(term);
      }
      return true;
    });
  }, [dishes, statusFilter, searchTerm]);

  return (
    <div className="recipe-page">
      {/* Banner quyền Viewer */}
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
          <span>Bạn đang xem với quyền <strong>Viewer (Người xem)</strong>. Chức năng tạo món và sửa công thức bị ẩn.</span>
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
            <h2 className="card-title">🍲 Quản lý Món Ăn & Công Thức Bữa Trưa</h2>
            <p className="card-subtitle">
              Cấu hình định lượng nguyên liệu cho mỗi suất ăn học sinh phục vụ tính toán nhu cầu kho tự động
            </p>
          </div>
          {!isViewer && (
            <button
              className="btn-add"
              onClick={openCreateModal}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>➕</span>
              <span>Thêm món ăn mới</span>
            </button>
          )}
        </div>

        {/* Thanh tìm kiếm và bộ lọc */}
        <div className="filter-bar">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Tìm theo mã món (VD: TK01) hoặc tên món ăn..."
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
            <option value="ACTIVE">Đang phục vụ</option>
            <option value="INACTIVE">Tạm ngưng</option>
          </select>
          <button
            onClick={() => { fetchDishes(); fetchFoods(); }}
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

        {/* Trạng thái danh sách */}
        {loading ? (
          <div className="state-box state-loading">
            ⏳ Đang tải danh sách món ăn & công thức...
          </div>
        ) : error ? (
          <div className="state-box state-error">
            <p><strong>Lỗi tải dữ liệu:</strong> {error}</p>
            <button className="btn-retry" onClick={fetchDishes}>Thử lại</button>
          </div>
        ) : filteredDishes.length === 0 ? (
          <div className="state-box state-empty">
            {dishes.length === 0 ? 'Chưa có món ăn nào trong thực đơn.' : 'Không tìm thấy món ăn nào khớp với tìm kiếm.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table" id="dishes-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>ID</th>
                  <th style={{ width: '130px' }}>MÃ MÓN</th>
                  <th>TÊN MÓN ĂN</th>
                  <th>ĐỊNH LƯỢNG NGUYÊN LIỆU (1 SUẤT)</th>
                  <th style={{ width: '130px' }}>TRẠNG THÁI</th>
                  <th style={{ width: '160px', textAlign: 'center' }}>THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {filteredDishes.map((dish) => (
                  <tr key={dish.id}>
                    <td style={{ color: '#94a3b8', fontSize: '12px' }}>#{dish.id}</td>
                    <td>
                      <span className="code-badge">{dish.code}</span>
                    </td>
                    <td>
                      <strong className="cat-name">{dish.name}</strong>
                    </td>
                    <td>
                      {/* Tóm tắt các nguyên liệu trong công thức */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {(dish.components || []).map((comp, idx) => {
                          const food = foodMap.get(comp.food_id);
                          return (
                            <span
                              key={idx}
                              style={{
                                backgroundColor: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                color: '#334155'
                              }}
                            >
                              🥗 {food?.name || `NL #${comp.food_id}`}: <strong>{comp.quantity} {comp.food_unit || food?.unit || ''}</strong>
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      {dish.is_active ? (
                        <span className="status-badge status-active">
                          ● Phục vụ
                        </span>
                      ) : (
                        <span className="status-badge status-locked">
                          ○ Tạm ngưng
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          onClick={() => setViewingDish(dish)}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            color: '#0f172a',
                            cursor: 'pointer'
                          }}
                        >
                          👁️ Xem
                        </button>
                        {!isViewer && (
                          <button
                            onClick={() => openEditModal(dish)}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
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
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL TẠO / SỬA MÓN ĂN & CÔNG THỨC */}
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
            maxWidth: '680px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              {modalMode === 'CREATE' ? '➕ Thêm Món Ăn & Thiết Lập Công Thức' : `✏️ Chỉnh Sửa Công Thức Món [${formCode}]`}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              Nhập mã, tên món và định lượng các nguyên liệu thực phẩm cần thiết cho 1 suất ăn học sinh.
            </p>

            {fieldErrors.general && (
              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                ❌ {fieldErrors.general}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 2fr',
                gap: '16px',
                marginBottom: '20px'
              }}>
                {/* Mã món */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Mã món ăn: <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="VD: TK01, CR02..."
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    disabled={modalMode === 'EDIT'}
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
                </div>

                {/* Tên món */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Tên món ăn: <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Thịt lợn kho trứng cút..."
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
              </div>

              {/* Trạng thái hoạt động nếu sửa */}
              {modalMode === 'EDIT' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span>Món đang được phục vụ trong thực đơn bán trú</span>
                  </label>
                </div>
              )}

              {/* KHU VỰC CÔNG THỨC NGUYÊN LIỆU */}
              <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                      Định lượng nguyên liệu cho 1 suất ăn
                    </h4>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      Hệ thống tự động quy đổi g → kg, ml → lit khi lưu vào kho dữ liệu.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    style={{
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    ➕ Thêm nguyên liệu
                  </button>
                </div>

                {fieldErrors.lines && (
                  <div style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    marginBottom: '12px'
                  }}>
                    ⚠️ {fieldErrors.lines}
                  </div>
                )}

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table className="custom-table" style={{ margin: 0 }}>
                    <thead style={{ backgroundColor: '#f8fafc' }}>
                      <tr>
                        <th style={{ width: '30px' }}>#</th>
                        <th>NGUYÊN LIỆU <span style={{ color: '#dc2626' }}>*</span></th>
                        <th style={{ width: '140px' }}>ĐỊNH LƯỢNG <span style={{ color: '#dc2626' }}>*</span></th>
                        <th style={{ width: '110px' }}>ĐƠN VỊ <span style={{ color: '#dc2626' }}>*</span></th>
                        <th style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipeLines.map((line, idx) => {
                        const isDuplicate = typeof line.food_id === 'number' && duplicateFoodIds.has(line.food_id);
                        const selectedFood = typeof line.food_id === 'number' ? foodMap.get(line.food_id) : undefined;
                        const availableUnits = getAvailableUnits(selectedFood?.unit);

                        return (
                          <tr key={idx} style={{ backgroundColor: isDuplicate ? '#fff1f2' : 'transparent' }}>
                            <td style={{ color: '#94a3b8', fontSize: '12px' }}>{idx + 1}</td>
                            <td>
                              <select
                                value={line.food_id}
                                onChange={(e) => handleLineChange(idx, 'food_id', e.target.value ? Number(e.target.value) : '')}
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  border: isDuplicate ? '2px solid #dc2626' : '1px solid #cbd5e1',
                                  fontSize: '13px',
                                  backgroundColor: '#ffffff'
                                }}
                              >
                                <option value="">-- Chọn thực phẩm --</option>
                                {foods.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    [{f.code}] {f.name} (ĐV kho: {f.unit})
                                  </option>
                                ))}
                              </select>
                              {/* Báo lỗi trùng food ngay trên UI theo đúng tiêu chí AC */}
                              {isDuplicate && (
                                <p style={{ color: '#dc2626', fontSize: '11px', fontWeight: 700, marginTop: '3px' }}>
                                  ⚠️ Hai dòng trùng thực phẩm! Mỗi nguyên liệu chỉ được chọn một lần.
                                </p>
                              )}
                            </td>
                            <td>
                              <input
                                type="number"
                                step="any"
                                min="0.000001"
                                placeholder="VD: 60"
                                value={line.quantity}
                                onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  fontSize: '13px',
                                  textAlign: 'right'
                                }}
                              />
                            </td>
                            <td>
                              <select
                                value={line.unit}
                                onChange={(e) => handleLineChange(idx, 'unit', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  fontSize: '13px',
                                  backgroundColor: '#ffffff'
                                }}
                              >
                                {availableUnits.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {recipeLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#dc2626',
                                    cursor: 'pointer',
                                    fontSize: '16px'
                                  }}
                                  title="Xóa nguyên liệu này"
                                >
                                  🗑️
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

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
                  disabled={submitting || duplicateFoodIds.size > 0}
                  style={{
                    backgroundColor: submitting || duplicateFoodIds.size > 0 ? '#94a3b8' : '#059669',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 24px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: submitting || duplicateFoodIds.size > 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? '⏳ Đang lưu công thức...' : 'Lưu công thức món'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL XEM CHI TIẾT CÔNG THỨC */}
      {/* ============================================================== */}
      {viewingDish && (
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
            maxWidth: '520px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  🍲 {viewingDish.name}
                </h3>
                <span className="code-badge">{viewingDish.code}</span>
              </div>
              <button
                onClick={() => setViewingDish(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px', fontWeight: 600 }}>
              Công thức định lượng cho 1 suất ăn:
            </p>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
              <table className="custom-table" style={{ margin: 0 }}>
                <thead style={{ backgroundColor: '#f8fafc' }}>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>NGUYÊN LIỆU THỰC PHẨM</th>
                    <th style={{ textAlign: 'right' }}>ĐỊNH LƯỢNG</th>
                    <th style={{ width: '80px' }}>ĐƠN VỊ KHO</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingDish.components || []).map((comp, idx) => {
                    const f = foodMap.get(comp.food_id);
                    return (
                      <tr key={idx}>
                        <td style={{ color: '#94a3b8', fontSize: '12px' }}>{idx + 1}</td>
                        <td>
                          <strong>{f?.name || `Thực phẩm #${comp.food_id}`}</strong>{' '}
                          <span style={{ fontSize: '11px', color: '#64748b' }}>({f?.code})</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                          {comp.quantity}
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: '#f1f5f9',
                            borderRadius: '4px',
                            fontSize: '12px'
                          }}>
                            {comp.food_unit || f?.unit || '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setViewingDish(null)}
                style={{
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  padding: '8px 18px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipePage;
