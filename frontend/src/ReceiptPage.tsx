import React, { useState, useEffect, useMemo } from 'react';
import { fetchApi } from './utils/api';

export interface ReceiptLine {
  id?: number;
  food_id: number;
  food_name?: string;
  quantity: string | number;
  unit_price: string | number;
  line_total?: string;
  unit?: string;
}

export interface Receipt {
  id: number;
  supplier_id: number;
  supplier_name?: string;
  date: string;
  note: string;
  status: 'DRAFT' | 'POSTED';
  posted_at: string | null;
  total_value: string;
  lines: ReceiptLine[];
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  phone?: string;
  is_active?: boolean;
}

export interface FoodItem {
  id: number;
  code: string;
  name: string;
  unit: string;
  is_active: boolean;
  quantity?: string;
  avg_cost?: string;
}

interface ReceiptPageProps {
  isViewer?: boolean;
}

interface DraftLineState {
  food_id: number | '';
  quantity: string;
  unit_price: string;
}

export const ReceiptPage: React.FC<ReceiptPageProps> = ({ isViewer = false }) => {
  // Danh sách phiếu nhập
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Danh mục tham chiếu
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [foods, setFoods] = useState<FoodItem[]>([]);

  // Điều hướng hiển thị: 'LIST' | 'CREATE' | 'DETAIL'
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'DETAIL'>('LIST');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  // Form tạo draft
  const getTodayString = () => new Date().toISOString().split('T')[0];
  const [formSupplierId, setFormSupplierId] = useState<number | ''>('');
  const [formDate, setFormDate] = useState<string>(getTodayString());
  const [formNote, setFormNote] = useState<string>('');
  const [draftLines, setDraftLines] = useState<DraftLineState[]>([
    { food_id: '', quantity: '', unit_price: '' }
  ]);
  const [formErrors, setFormErrors] = useState<{
    supplier?: string;
    date?: string;
    general?: string;
    lines?: string;
  }>({});
  const [submittingDraft, setSubmittingDraft] = useState<boolean>(false);

  // Modal xác nhận chốt
  const [receiptToPost, setReceiptToPost] = useState<Receipt | null>(null);
  const [posting, setPosting] = useState<boolean>(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [networkErrorDetails, setNetworkErrorDetails] = useState<{ receiptId: number; message: string } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);

  // Thông báo thành công
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter cho danh sách
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'POSTED'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Tải danh sách phiếu nhập
  const fetchReceipts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi('/api/receipts/');
      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi mã lỗi ${res.status}`);
      }
      const data = await res.json();
      setReceipts(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách phiếu nhập');
    } finally {
      setLoading(false);
    }
  };

  // Tải nhà cung cấp và thực phẩm để chọn
  const fetchReferences = async () => {
    try {
      const [resSuppliers, resFoods] = await Promise.all([
        fetchApi('/api/suppliers/'),
        fetchApi('/api/foods/')
      ]);
      if (resSuppliers.ok) {
        const sData = await resSuppliers.json();
        setSuppliers(sData.results || []);
      }
      if (resFoods.ok) {
        const fData = await resFoods.json();
        setFoods(fData.results || fData || []);
      }
    } catch (e) {
      console.error('Lỗi tải danh mục tham chiếu:', e);
    }
  };

  useEffect(() => {
    fetchReceipts();
    fetchReferences();
  }, []);

  // Map food id sang FoodItem
  const foodMap = useMemo(() => {
    const map = new Map<number, FoodItem>();
    foods.forEach((f) => map.set(f.id, f));
    return map;
  }, [foods]);

  // Format tiền tệ
  const formatCurrency = (val: string | number) => {
    const num = Number(val);
    if (isNaN(num)) return val?.toString() || '0 đ';
    return num.toLocaleString('vi-VN') + ' đ';
  };

  // Format số lượng
  const formatQuantity = (val: string | number, unit?: string) => {
    const num = Number(val);
    if (isNaN(num)) return `${val} ${unit || ''}`.trim();
    const str = num.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
    return unit ? `${str} ${unit}` : str;
  };

  // Reset form tạo draft
  const resetForm = () => {
    setFormSupplierId('');
    setFormDate(getTodayString());
    setFormNote('');
    setDraftLines([{ food_id: '', quantity: '', unit_price: '' }]);
    setFormErrors({});
    setPostError(null);
    setNetworkErrorDetails(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setViewMode('CREATE');
    setSuccessMessage(null);
  };

  // Thêm dòng mới
  const handleAddLine = () => {
    setDraftLines((prev) => [...prev, { food_id: '', quantity: '', unit_price: '' }]);
  };

  // Xóa dòng
  const handleRemoveLine = (index: number) => {
    if (draftLines.length <= 1) return;
    setDraftLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Cập nhật giá trị một dòng
  const handleLineChange = (index: number, field: keyof DraftLineState, value: any) => {
    setDraftLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Kiểm tra trùng thực phẩm trong các dòng của UI
  const duplicateFoodIds = useMemo(() => {
    const counts = new Map<number, number>();
    draftLines.forEach((l) => {
      if (typeof l.food_id === 'number') {
        counts.set(l.food_id, (counts.get(l.food_id) || 0) + 1);
      }
    });
    const dupes = new Set<number>();
    counts.forEach((count, id) => {
      if (count > 1) dupes.add(id);
    });
    return dupes;
  }, [draftLines]);

  // Xử lý tạo draft
  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setSuccessMessage(null);

    const errors: { supplier?: string; date?: string; general?: string; lines?: string } = {};

    if (!formSupplierId) {
      errors.supplier = 'Vui lòng chọn nhà cung cấp.';
    }
    if (!formDate) {
      errors.date = 'Vui lòng chọn ngày nhập.';
    }

    if (draftLines.length === 0) {
      errors.lines = 'Phiếu nhập phải có ít nhất một mặt hàng.';
    }

    // Kiểm tra từng dòng
    for (let i = 0; i < draftLines.length; i++) {
      const line = draftLines[i];
      if (!line.food_id) {
        errors.lines = `Dòng #${i + 1}: Vui lòng chọn thực phẩm.`;
        break;
      }
      const qtyNum = Number(line.quantity);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        errors.lines = `Dòng #${i + 1}: Số lượng phải lớn hơn 0.`;
        break;
      }
      const priceNum = Number(line.unit_price);
      if (isNaN(priceNum) || priceNum <= 0) {
        errors.lines = `Dòng #${i + 1}: Đơn giá phải lớn hơn 0 đ.`;
        break;
      }
    }

    // Cấm trùng food trong UI
    if (duplicateFoodIds.size > 0) {
      errors.lines = 'Có thực phẩm bị chọn trùng lặp giữa các dòng. Mỗi loại thực phẩm chỉ được nhập một dòng trong một phiếu.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmittingDraft(true);
    try {
      const payload = {
        supplier_id: Number(formSupplierId),
        date: formDate,
        note: formNote.trim(),
        lines: draftLines.map((l) => ({
          food_id: Number(l.food_id),
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
      };

      const res = await fetchApi('/api/receipts/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = typeof data.error === 'string' 
          ? data.error 
          : JSON.stringify(data.error || 'Không thể tạo phiếu nhập');
        setFormErrors({ general: errorMsg });
        return;
      }

      // Tạo draft thành công -> tải lại danh sách phiếu và chuyển sang xem chi tiết bản đã lưu
      await fetchReceipts();
      setSuccessMessage(`Đã tạo bản nháp phiếu nhập #${data.id} thành công.`);
      setSelectedReceipt(data);
      setViewMode('DETAIL');
    } catch (err: any) {
      setFormErrors({ general: err.message || 'Lỗi kết nối khi tạo phiếu nháp.' });
    } finally {
      setSubmittingDraft(false);
    }
  };

  // Mở chi tiết phiếu từ danh sách
  const handleOpenDetail = async (r: Receipt) => {
    setSelectedReceipt(r);
    setViewMode('DETAIL');
    setSuccessMessage(null);
    setPostError(null);
    setNetworkErrorDetails(null);

    // Tải lại chi tiết mới nhất từ server để có đủ lines và trạng thái chuẩn
    try {
      const res = await fetchApi(`/api/receipts/${r.id}/`);
      if (res.ok) {
        const fresh = await res.json();
        setSelectedReceipt(fresh);
      }
    } catch (e) {
      console.error('Không thể làm mới chi tiết phiếu:', e);
    }
  };

  // Xác nhận mở modal Chốt
  const handlePromptPost = (r: Receipt) => {
    setReceiptToPost(r);
    setPostError(null);
    setNetworkErrorDetails(null);
  };

  // Thực hiện Chốt phiếu nhập
  const handleConfirmPost = async () => {
    if (!receiptToPost) return;
    const targetId = receiptToPost.id;
    setPosting(true);
    setPostError(null);
    setNetworkErrorDetails(null);

    try {
      const res = await fetchApi(`/api/receipts/${targetId}/post/`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMessage(`Chốt phiếu nhập #${targetId} thành công! Tồn kho và giá vốn bình quân đã được cập nhật.`);
        setReceiptToPost(null);

        // Reload tồn kho (refetch foods) và danh sách phiếu
        await Promise.all([fetchReceipts(), fetchReferences()]);

        // Cập nhật lại view chi tiết với trạng thái POSTED
        const detailRes = await fetchApi(`/api/receipts/${targetId}/`);
        if (detailRes.ok) {
          const updatedDetail = await detailRes.json();
          setSelectedReceipt(updatedDetail);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || errData.message || `Lỗi từ máy chủ (HTTP ${res.status})`;
        setPostError(msg);
      }
    } catch (err: any) {
      // Lỗi mạng lúc chốt: Tuân thủ yêu cầu:
      // "Lỗi mạng lúc chốt: đọc lại chi tiết phiếu để biết trạng thái; không tự tạo lại phiếu mới."
      setNetworkErrorDetails({
        receiptId: targetId,
        message: err.message || 'Mất kết nối mạng trong quá trình gửi yêu cầu chốt phiếu.',
      });
    } finally {
      setPosting(false);
    }
  };

  // Kiểm tra trạng thái phiếu sau khi gặp lỗi mạng (Không tự tạo lại phiếu mới!)
  const handleCheckReceiptStatus = async (receiptId: number) => {
    setCheckingStatus(true);
    try {
      const res = await fetchApi(`/api/receipts/${receiptId}/`);
      if (res.ok) {
        const currentData: Receipt = await res.json();
        setSelectedReceipt(currentData);
        setReceiptToPost(null);

        if (currentData.status === 'POSTED') {
          setNetworkErrorDetails(null);
          setSuccessMessage(
            `Đã kiểm tra lại máy chủ: Phiếu nhập #${receiptId} thực tế ĐÃ ĐƯỢC CHỐT THÀNH CÔNG trước khi đứt kết nối mạng! Form đã được khóa và tồn kho đã cập nhật.`
          );
          await Promise.all([fetchReceipts(), fetchReferences()]);
        } else {
          setPostError(
            `Đã kiểm tra lại máy chủ: Phiếu nhập #${receiptId} hiện VẪN LÀ BẢN NHÁP (chưa chốt). Bạn có thể an tâm bấm nút "Xác nhận chốt" lại mà không sợ bị trùng phiếu.`
          );
        }
      } else {
        setPostError(`Không thể lấy thông tin phiếu từ máy chủ (mã lỗi ${res.status}).`);
      }
    } catch (e: any) {
      setPostError('Vẫn không thể kết nối tới máy chủ. Vui lòng kiểm tra lại đường truyền mạng.');
    } finally {
      setCheckingStatus(false);
    }
  };

  // Lọc danh sách hiển thị
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchId = r.id.toString().includes(term);
        const matchSupplier = (r.supplier_name || '').toLowerCase().includes(term);
        const matchNote = (r.note || '').toLowerCase().includes(term);
        const matchDate = (r.date || '').includes(term);
        return matchId || matchSupplier || matchNote || matchDate;
      }
      return true;
    });
  }, [receipts, statusFilter, searchTerm]);

  return (
    <div className="receipt-page">
      {/* Banner thông báo quyền Viewer */}
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
          <span>Bạn đang xem với quyền <strong>Viewer (Người xem)</strong>. Chức năng tạo bản nháp và chốt phiếu nhập bị vô hiệu hóa.</span>
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

      {/* ============================================================== */}
      {/* MÀN HÌNH 1: DANH SÁCH PHIẾU NHẬP KHO */}
      {/* ============================================================== */}
      {viewMode === 'LIST' && (
        <div className="card-container">
          <div className="card-header">
            <div>
              <h2 className="card-title">📥 Quản lý Phiếu Nhập Kho</h2>
              <p className="card-subtitle">
                Tạo bản nháp, đối chiếu đơn giá nhập và chốt ghi sổ kho theo giá bình quân
              </p>
            </div>
            {!isViewer && (
              <button
                className="btn-add"
                onClick={handleOpenCreate}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>➕</span>
                <span>Tạo phiếu nhập mới</span>
              </button>
            )}
          </div>

          {/* Thanh công cụ lọc & tìm kiếm */}
          <div className="filter-bar">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Tìm theo mã phiếu (#id), nhà cung cấp, ghi chú hoặc ngày..."
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
              <option value="DRAFT">Chỉ bản nháp (DRAFT)</option>
              <option value="POSTED">Đã chốt (POSTED)</option>
            </select>
            <button
              onClick={fetchReceipts}
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
              ⏳ Đang tải danh sách phiếu nhập kho...
            </div>
          ) : error ? (
            <div className="state-box state-error">
              <p><strong>Lỗi tải danh sách phiếu nhập:</strong> {error}</p>
              <button className="btn-retry" onClick={fetchReceipts}>Thử lại</button>
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="state-box state-empty">
              {receipts.length === 0 ? 'Chưa có phiếu nhập nào trong hệ thống.' : 'Không tìm thấy phiếu nhập nào phù hợp.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table" id="receipts-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>MÃ PHIẾU</th>
                    <th>NGÀY NHẬP</th>
                    <th>NHÀ CUNG CẤP</th>
                    <th>TRẠNG THÁI</th>
                    <th style={{ textAlign: 'right' }}>SỐ MẶT HÀNG</th>
                    <th style={{ textAlign: 'right' }}>TỔNG GIÁ TRỊ (SERVER)</th>
                    <th>GHI CHÚ</th>
                    <th style={{ textAlign: 'center' }}>THAO TÁC</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceipts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="code-badge">#{r.id}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td>
                        <strong>{r.supplier_name || `NCC #${r.supplier_id}`}</strong>
                      </td>
                      <td>
                        {r.status === 'POSTED' ? (
                          <span className="status-badge status-active">
                            🔒 ĐÃ CHỐT
                          </span>
                        ) : (
                          <span style={{
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'inline-block'
                          }}>
                            📝 BẢN NHÁP
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>
                        {r.lines ? r.lines.length : 0} mặt hàng
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                        {/* total_value hoàn toàn do server trả về */}
                        {formatCurrency(r.total_value)}
                      </td>
                      <td style={{ color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.note || '-'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenDetail(r)}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '5px 12px',
                            color: '#1e293b',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          👁️ Chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MÀN HÌNH 2: TẠO BẢN NHÁP PHIẾU NHẬP MỚI */}
      {/* ============================================================== */}
      {viewMode === 'CREATE' && (
        <div className="card-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 className="card-title">📝 Tạo Phiếu Nhập Kho (Bản nháp)</h2>
              <p className="card-subtitle">
                Chọn nhà cung cấp, ngày nhập và các dòng hàng. Dữ liệu sẽ lưu ở trạng thái nháp trước khi chốt.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#475569',
              }}
            >
              ← Quay lại danh sách
            </button>
          </div>

          {formErrors.general && (
            <div className="state-box state-error" style={{ marginBottom: '20px' }}>
              <strong>Lỗi:</strong> {formErrors.general}
            </div>
          )}

          <form onSubmit={handleCreateDraft}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              backgroundColor: '#f8fafc',
              padding: '18px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              marginBottom: '24px'
            }}>
              {/* Chọn Nhà cung cấp */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Nhà cung cấp: <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  value={formSupplierId}
                  onChange={(e) => setFormSupplierId(e.target.value ? Number(e.target.value) : '')}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: formErrors.supplier ? '1px solid #dc2626' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="">-- Chọn nhà cung cấp --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.code}] {s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
                {formErrors.supplier && (
                  <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{formErrors.supplier}</p>
                )}
              </div>

              {/* Ngày nhập */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Ngày nhập kho: <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: formErrors.date ? '1px solid #dc2626' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: '#ffffff'
                  }}
                />
                {formErrors.date && (
                  <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{formErrors.date}</p>
                )}
              </div>

              {/* Ghi chú */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Ghi chú phiếu nhập:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Nhập rau củ đợt sáng thứ 4 theo hợp đồng tuần..."
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: '#ffffff'
                  }}
                />
              </div>
            </div>

            {/* BẢNG CHI TIẾT CÁC DÒNG HÀNG */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  Danh sách mặt hàng nhập kho
                </h3>
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
                  ➕ Thêm mặt hàng
                </button>
              </div>

              {formErrors.lines && (
                <div style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  marginBottom: '12px'
                }}>
                  ⚠️ {formErrors.lines}
                </div>
              )}

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table className="custom-table" style={{ margin: 0 }}>
                  <thead style={{ backgroundColor: '#f8fafc' }}>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th style={{ minWidth: '220px' }}>THỰC PHẨM <span style={{ color: '#dc2626' }}>*</span></th>
                      <th style={{ width: '100px' }}>ĐƠN VỊ</th>
                      <th style={{ width: '140px' }}>SỐ LƯỢNG <span style={{ color: '#dc2626' }}>*</span></th>
                      <th style={{ width: '180px' }}>ĐƠN GIÁ NHẬP (VNĐ) <span style={{ color: '#dc2626' }}>*</span></th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftLines.map((line, idx) => {
                      const selectedFood = typeof line.food_id === 'number' ? foodMap.get(line.food_id) : undefined;
                      const isDuplicate = typeof line.food_id === 'number' && duplicateFoodIds.has(line.food_id);

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
                                  [{f.code}] {f.name} ({f.unit})
                                </option>
                              ))}
                            </select>
                            {isDuplicate && (
                              <p style={{ color: '#dc2626', fontSize: '11px', fontWeight: 600, marginTop: '3px' }}>
                                ⚠️ Thực phẩm này bị trùng lặp ở dòng khác!
                              </p>
                            )}
                          </td>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 8px',
                              backgroundColor: '#f1f5f9',
                              borderRadius: '4px',
                              fontSize: '12px',
                              color: '#475569',
                              fontWeight: 500
                            }}>
                              {selectedFood?.unit || '-'}
                            </span>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              placeholder="VD: 50"
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
                            <input
                              type="number"
                              step="any"
                              min="1"
                              placeholder="VD: 90000"
                              value={line.unit_price}
                              onChange={(e) => handleLineChange(idx, 'unit_price', e.target.value)}
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
                          <td style={{ textAlign: 'center' }}>
                            {draftLines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(idx)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  fontSize: '16px',
                                  padding: '4px'
                                }}
                                title="Xóa dòng này"
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

            {/* NÚT THAO TÁC */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  padding: '9px 18px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={submittingDraft || duplicateFoodIds.size > 0}
                style={{
                  backgroundColor: submittingDraft || duplicateFoodIds.size > 0 ? '#94a3b8' : '#059669',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 24px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: submittingDraft || duplicateFoodIds.size > 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {submittingDraft ? '⏳ Đang lưu nháp...' : '💾 Lưu bản nháp (Draft)'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================== */}
      {/* MÀN HÌNH 3: XEM CHI TIẾT BẢN ĐÃ LƯU & NÚT CHỐT */}
      {/* ============================================================== */}
      {viewMode === 'DETAIL' && selectedReceipt && (
        <div className="card-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                <h2 className="card-title" style={{ margin: 0 }}>
                  Phiếu Nhập Kho #{selectedReceipt.id}
                </h2>
                {selectedReceipt.status === 'POSTED' ? (
                  <span className="status-badge status-active" style={{ fontSize: '13px' }}>
                    🔒 ĐÃ CHỐT (POSTED)
                  </span>
                ) : (
                  <span style={{
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                    padding: '4px 12px',
                    borderRadius: '999px',
                    fontSize: '13px',
                    fontWeight: 600
                  }}>
                    📝 BẢN NHÁP (DRAFT)
                  </span>
                )}
              </div>
              <p className="card-subtitle">
                {selectedReceipt.status === 'POSTED'
                  ? `Phiếu đã được ghi sổ kho lúc ${selectedReceipt.posted_at ? new Date(selectedReceipt.posted_at).toLocaleString('vi-VN') : '-'}. Dữ liệu ở trạng thái chỉ đọc.`
                  : 'Bản nháp đã lưu trên máy chủ. Kiểm tra kỹ thông tin trước khi thực hiện chốt phiếu.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#475569',
                }}
              >
                ← Quay lại danh sách
              </button>
              {/* Nút Chốt có xác nhận: chỉ hiển thị khi phiếu là DRAFT và người dùng không phải Viewer */}
              {selectedReceipt.status === 'DRAFT' && !isViewer && (
                <button
                  type="button"
                  onClick={() => handlePromptPost(selectedReceipt)}
                  style={{
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 18px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(220,38,38,0.3)'
                  }}
                >
                  🔒 Chốt phiếu nhập
                </button>
              )}
            </div>
          </div>

          {/* Hộp thông tin phiếu */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '18px',
            marginBottom: '24px'
          }}>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Nhà cung cấp:</span>
              <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                {selectedReceipt.supplier_name || `NCC #${selectedReceipt.supplier_id}`}
              </strong>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Ngày lập phiếu:</span>
              <strong style={{ fontSize: '14px', color: '#0f172a' }}>{selectedReceipt.date}</strong>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Trạng thái:</span>
              <strong style={{ fontSize: '14px', color: selectedReceipt.status === 'POSTED' ? '#16a34a' : '#d97706' }}>
                {selectedReceipt.status === 'POSTED' ? 'Đã chốt (Khóa dữ liệu)' : 'Bản nháp (Chưa ghi kho)'}
              </strong>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Tổng tiền (Do server trả):</span>
              <strong style={{ fontSize: '18px', color: '#059669' }}>
                {formatCurrency(selectedReceipt.total_value)}
              </strong>
            </div>
            {selectedReceipt.note && (
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Ghi chú:</span>
                <span style={{ fontSize: '13px', color: '#334155' }}>{selectedReceipt.note}</span>
              </div>
            )}
          </div>

          {/* Bảng các dòng chi tiết */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
              Danh sách chi tiết mặt hàng
            </h3>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table className="custom-table" style={{ margin: 0 }}>
                <thead style={{ backgroundColor: '#f8fafc' }}>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>THỰC PHẨM</th>
                    <th style={{ textAlign: 'right' }}>SỐ LƯỢNG</th>
                    <th style={{ textAlign: 'right' }}>ĐƠN GIÁ NHẬP</th>
                    <th style={{ textAlign: 'right' }}>THÀNH TIỀN (SERVER)</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedReceipt.lines || []).map((line, idx) => (
                    <tr key={line.id || idx}>
                      <td style={{ color: '#94a3b8', fontSize: '12px' }}>{idx + 1}</td>
                      <td>
                        <strong>{line.food_name || `Thực phẩm #${line.food_id}`}</strong>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatQuantity(line.quantity, line.unit)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#475569' }}>
                        {formatCurrency(line.unit_price)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                        {formatCurrency(line.line_total || Number(line.quantity) * Number(line.unit_price))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ backgroundColor: '#f8fafc', fontWeight: 700 }}>
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right', padding: '12px' }}>
                      TỔNG CỘNG GIÁ TRỊ PHIẾU:
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px', fontSize: '15px', color: '#059669' }}>
                      {formatCurrency(selectedReceipt.total_value)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL XÁC NHẬN CHỐT PHIẾU NHẬP (VÀ XỬ LÝ LỖI MẠNG) */}
      {/* ============================================================== */}
      {receiptToPost && (
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
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              🔒 Xác nhận Chốt Phiếu Nhập #{receiptToPost.id}
            </h3>

            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginBottom: '16px' }}>
              Sau khi chốt phiếu:
            </p>
            <ul style={{ fontSize: '13px', color: '#475569', paddingLeft: '20px', marginBottom: '16px', lineHeight: 1.6 }}>
              <li>Toàn bộ số lượng và đơn giá của các mặt hàng sẽ được <strong>ghi nhận chính thức vào kho</strong>.</li>
              <li>Hệ thống sẽ <strong>tính lại giá vốn bình quân (avg_cost)</strong> và cập nhật phiên bản tồn kho.</li>
              <li>Phiếu nhập sẽ bị <strong>khóa hoàn toàn</strong>, không thể chỉnh sửa hay xóa.</li>
            </ul>

            {postError && (
              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                ❌ <strong>Lỗi:</strong> {postError}
              </div>
            )}

            {/* Xử lý đặc biệt cho Lỗi mạng lúc chốt */}
            {networkErrorDetails && (
              <div style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#92400e',
                padding: '14px',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '16px',
                lineHeight: 1.5
              }}>
                <div style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚠️ Cảnh báo mất kết nối mạng</span>
                </div>
                <p>
                  Yêu cầu chốt phiếu bị ngắt quãng giữa chừng ({networkErrorDetails.message}).
                </p>
                <p style={{ marginTop: '6px', fontWeight: 600 }}>
                  Hệ thống KHÔNG tự tạo lại phiếu mới để tránh nhân đôi tồn kho. Vui lòng nhấn nút bên dưới để đọc lại trạng thái thực tế từ máy chủ:
                </p>
                <button
                  type="button"
                  onClick={() => handleCheckReceiptStatus(networkErrorDetails.receiptId)}
                  disabled={checkingStatus}
                  style={{
                    marginTop: '10px',
                    backgroundColor: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: checkingStatus ? 'not-allowed' : 'pointer',
                    width: '100%'
                  }}
                >
                  {checkingStatus ? '🔄 Đang kiểm tra trạng thái trên máy chủ...' : '🔍 Đọc lại chi tiết phiếu từ máy chủ'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setReceiptToPost(null)}
                disabled={posting || checkingStatus}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  padding: '9px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: posting || checkingStatus ? 'not-allowed' : 'pointer',
                }}
              >
                Đóng
              </button>
              {!networkErrorDetails && (
                <button
                  type="button"
                  onClick={handleConfirmPost}
                  disabled={posting}
                  style={{
                    backgroundColor: posting ? '#94a3b8' : '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    padding: '9px 20px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: posting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {posting ? '⏳ Đang xử lý chốt...' : 'Xác nhận Chốt'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptPage;
