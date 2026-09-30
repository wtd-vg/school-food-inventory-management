import React, { useState, useEffect, useMemo } from 'react';
import { fetchApi } from './utils/api';

export interface IssueLine {
  id?: number;
  food_id: number;
  food_name?: string;
  quantity: string | number;
  unit_cost?: string | number;
  line_total?: string;
  unit?: string;
}

export interface Issue {
  id: number;
  code: string;
  date: string;
  note: string;
  status: 'DRAFT' | 'POSTED';
  posted_at: string | null;
  total_value: string;
  lines: IssueLine[];
}

export interface FoodStockItem {
  id: number;
  code: string;
  name: string;
  unit: string;
  quantity: string;
  avg_cost: string;
  is_active: boolean;
}

interface IssuePageProps {
  isViewer?: boolean;
}

interface DraftIssueLine {
  food_id: number | '';
  quantity: string;
}

export const IssuePage: React.FC<IssuePageProps> = ({ isViewer = false }) => {
  // Danh sách phiếu xuất
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Danh sách thực phẩm kèm số tồn kho hiện tại
  const [foods, setFoods] = useState<FoodStockItem[]>([]);
  const [loadingFoods, setLoadingFoods] = useState<boolean>(false);

  // Điều hướng hiển thị: 'LIST' | 'CREATE' | 'DETAIL'
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'DETAIL'>('LIST');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  // Form tạo draft
  const getTodayString = () => new Date().toISOString().split('T')[0];
  const [formDate, setFormDate] = useState<string>(getTodayString());
  const [formCode, setFormCode] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');
  const [draftLines, setDraftLines] = useState<DraftIssueLine[]>([
    { food_id: '', quantity: '' }
  ]);
  const [formErrors, setFormErrors] = useState<{
    date?: string;
    code?: string;
    general?: string;
    lines?: string;
  }>({});
  const [submittingDraft, setSubmittingDraft] = useState<boolean>(false);

  // Modal xác nhận chốt
  const [issueToPost, setIssueToPost] = useState<Issue | null>(null);
  const [posting, setPosting] = useState<boolean>(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [networkErrorDetails, setNetworkErrorDetails] = useState<{ issueId: number; message: string } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);

  // Thông báo thành công
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Lọc danh sách
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'POSTED'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Tải danh sách thực phẩm & tồn kho
  const fetchFoods = async () => {
    setLoadingFoods(true);
    try {
      const res = await fetchApi('/api/foods/');
      if (res.ok) {
        const data = await res.json();
        setFoods(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) {
      console.error('Không thể tải tồn kho thực phẩm:', e);
    } finally {
      setLoadingFoods(false);
    }
  };

  // Tải danh sách phiếu xuất
  const fetchIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi('/api/issues/');
      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi mã lỗi ${res.status}`);
      }
      const data = await res.json();
      setIssues(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách phiếu xuất');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
    fetchFoods();
  }, []);

  // Map food id sang FoodStockItem
  const foodMap = useMemo(() => {
    const map = new Map<number, FoodStockItem>();
    foods.forEach((f) => map.set(f.id, f));
    return map;
  }, [foods]);

  // Format tiền tệ
  const formatCurrency = (val: string | number | undefined) => {
    if (val === undefined || val === null) return '0 đ';
    const num = Number(val);
    if (isNaN(num)) return val.toString();
    return num.toLocaleString('vi-VN') + ' đ';
  };

  // Format số lượng
  const formatQuantity = (val: string | number | undefined, unit?: string) => {
    if (val === undefined || val === null) return '0';
    const num = Number(val);
    if (isNaN(num)) return `${val} ${unit || ''}`.trim();
    const str = num.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
    return unit ? `${str} ${unit}` : str;
  };

  // Reset form tạo draft
  const resetForm = () => {
    setFormDate(getTodayString());
    setFormCode('');
    setFormNote('');
    setDraftLines([{ food_id: '', quantity: '' }]);
    setFormErrors({});
    setPostError(null);
    setNetworkErrorDetails(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setViewMode('CREATE');
    setSuccessMessage(null);
    // Làm mới số tồn kho khi mở form tạo phiếu xuất
    fetchFoods();
  };

  // Thêm dòng mới
  const handleAddLine = () => {
    setDraftLines((prev) => [...prev, { food_id: '', quantity: '' }]);
  };

  // Xóa dòng
  const handleRemoveLine = (index: number) => {
    if (draftLines.length <= 1) return;
    setDraftLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Thay đổi giá trị dòng
  const handleLineChange = (index: number, field: keyof DraftIssueLine, value: any) => {
    setDraftLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Kiểm tra trùng thực phẩm giữa các dòng trên UI
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

  // Xử lý tạo phiếu xuất nháp
  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setSuccessMessage(null);

    const errors: { date?: string; code?: string; general?: string; lines?: string } = {};

    if (!formDate) {
      errors.date = 'Vui lòng chọn ngày xuất kho.';
    }

    if (draftLines.length === 0) {
      errors.lines = 'Phiếu xuất phải có ít nhất một mặt hàng.';
    }

    // Kiểm tra từng dòng
    for (let i = 0; i < draftLines.length; i++) {
      const line = draftLines[i];
      if (!line.food_id) {
        errors.lines = `Dòng #${i + 1}: Vui lòng chọn thực phẩm xuất.`;
        break;
      }
      const qtyNum = Number(line.quantity);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        errors.lines = `Dòng #${i + 1}: Số lượng xuất phải lớn hơn 0.`;
        break;
      }
    }

    // Cấm trùng food trên UI
    if (duplicateFoodIds.size > 0) {
      errors.lines = 'Có thực phẩm bị trùng lặp giữa các dòng. Vui lòng gộp số lượng vào một dòng duy nhất.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmittingDraft(true);
    try {
      const payload: any = {
        date: formDate,
        note: formNote.trim(),
        lines: draftLines.map((l) => ({
          food_id: Number(l.food_id),
          quantity: l.quantity,
        })),
      };

      if (formCode.trim()) {
        payload.code = formCode.trim().toUpperCase();
      }

      const res = await fetchApi('/api/issues/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = typeof data.error === 'string' 
          ? data.error 
          : JSON.stringify(data.error || 'Không thể tạo phiếu xuất nháp');
        setFormErrors({ general: errorMsg });
        return;
      }

      await fetchIssues();
      setSuccessMessage(`Đã tạo bản nháp phiếu xuất kho ${data.code} thành công.`);
      setSelectedIssue(data);
      setViewMode('DETAIL');
    } catch (err: any) {
      setFormErrors({ general: err.message || 'Lỗi kết nối khi gửi phiếu xuất nháp.' });
    } finally {
      setSubmittingDraft(false);
    }
  };

  // Mở chi tiết phiếu xuất
  const handleOpenDetail = async (issue: Issue) => {
    setSelectedIssue(issue);
    setViewMode('DETAIL');
    setSuccessMessage(null);
    setPostError(null);
    setNetworkErrorDetails(null);

    // Tải lại chi tiết mới nhất từ server
    try {
      const res = await fetchApi(`/api/issues/${issue.id}/`);
      if (res.ok) {
        const fresh = await res.json();
        setSelectedIssue(fresh);
      }
    } catch (e) {
      console.error('Không thể làm mới chi tiết phiếu xuất:', e);
    }
  };

  // Mở xác nhận Chốt xuất kho
  const handlePromptPost = (issue: Issue) => {
    setIssueToPost(issue);
    setPostError(null);
    setNetworkErrorDetails(null);
  };

  // Thực hiện Chốt phiếu xuất
  const handleConfirmPost = async () => {
    if (!issueToPost) return;
    const targetId = issueToPost.id;
    setPosting(true);
    setPostError(null);
    setNetworkErrorDetails(null);

    try {
      const res = await fetchApi(`/api/issues/${targetId}/post/`, {
        method: 'POST',
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccessMessage(`Chốt phiếu xuất kho ${data.code || issueToPost.code} thành công! Tồn kho đã được trừ và giá vốn đã ghi nhận.`);
        setIssueToPost(null);

        // Reload tồn kho mới và danh sách phiếu
        await Promise.all([fetchIssues(), fetchFoods()]);

        // Cập nhật lại view chi tiết với trạng thái POSTED
        const detailRes = await fetchApi(`/api/issues/${targetId}/`);
        if (detailRes.ok) {
          const updatedDetail = await detailRes.json();
          setSelectedIssue(updatedDetail);
        }
      } else {
        // Yêu cầu: "nếu server báo thiếu tồn, reload tồn và giữ thông báo rõ."
        const msg = data.error || data.message || `Lỗi chốt phiếu xuất (Mã ${res.status})`;
        setPostError(msg);

        // Tự động tải lại tồn kho mới nhất để người dùng thấy tồn thực tế còn bao nhiêu
        await fetchFoods();
      }
    } catch (err: any) {
      // Lỗi mạng lúc chốt: không tự tạo phiếu mới, cho phép đọc lại trạng thái
      setNetworkErrorDetails({
        issueId: targetId,
        message: err.message || 'Mất kết nối mạng trong quá trình chốt phiếu xuất.',
      });
    } finally {
      setPosting(false);
    }
  };

  // Kiểm tra trạng thái phiếu sau lỗi mạng
  const handleCheckIssueStatus = async (issueId: number) => {
    setCheckingStatus(true);
    try {
      const res = await fetchApi(`/api/issues/${issueId}/`);
      if (res.ok) {
        const currentData: Issue = await res.json();
        setSelectedIssue(currentData);
        setIssueToPost(null);

        if (currentData.status === 'POSTED') {
          setNetworkErrorDetails(null);
          setSuccessMessage(
            `Đã kiểm tra lại máy chủ: Phiếu xuất ${currentData.code} ĐÃ ĐƯỢC CHỐT THÀNH CÔNG trước khi mất mạng! Tồn kho đã được cập nhật.`
          );
          await Promise.all([fetchIssues(), fetchFoods()]);
        } else {
          setPostError(
            `Đã kiểm tra lại máy chủ: Phiếu xuất ${currentData.code} hiện VẪN LÀ BẢN NHÁP. Bạn có thể an tâm bấm nút Chốt lại.`
          );
        }
      } else {
        setPostError(`Không thể đọc thông tin từ máy chủ (mã lỗi ${res.status}).`);
      }
    } catch (e: any) {
      setPostError('Vẫn không thể kết nối tới máy chủ. Vui lòng kiểm tra lại mạng.');
    } finally {
      setCheckingStatus(false);
    }
  };

  // Lọc danh sách hiển thị
  const filteredIssues = useMemo(() => {
    return issues.filter((iss) => {
      if (statusFilter !== 'ALL' && iss.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchCode = (iss.code || '').toLowerCase().includes(term);
        const matchId = iss.id.toString().includes(term);
        const matchNote = (iss.note || '').toLowerCase().includes(term);
        const matchDate = (iss.date || '').includes(term);
        return matchCode || matchId || matchNote || matchDate;
      }
      return true;
    });
  }, [issues, statusFilter, searchTerm]);

  return (
    <div className="issue-page">
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
          <span>Bạn đang xem với quyền <strong>Viewer (Người xem)</strong>. Chức năng tạo bản nháp và chốt phiếu xuất bị vô hiệu hóa.</span>
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
      {/* MÀN HÌNH 1: DANH SÁCH PHIẾU XUẤT KHO */}
      {/* ============================================================== */}
      {viewMode === 'LIST' && (
        <div className="card-container">
          <div className="card-header">
            <div>
              <h2 className="card-title">📤 Quản lý Phiếu Xuất Kho</h2>
              <p className="card-subtitle">
                Lập phiếu xuất nháp phục vụ chế biến bữa ăn, đối chiếu tồn kho và chốt trừ tồn theo giá vốn bình quân
              </p>
            </div>
            {!isViewer && (
              <button
                className="btn-add"
                onClick={handleOpenCreate}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>➕</span>
                <span>Tạo phiếu xuất mới</span>
              </button>
            )}
          </div>

          {/* Thanh công cụ tìm kiếm và lọc */}
          <div className="filter-bar">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Tìm theo mã phiếu xuất, ghi chú hoặc ngày..."
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
              onClick={() => { fetchIssues(); fetchFoods(); }}
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
              ⏳ Đang tải danh sách phiếu xuất kho...
            </div>
          ) : error ? (
            <div className="state-box state-error">
              <p><strong>Lỗi tải danh sách:</strong> {error}</p>
              <button className="btn-retry" onClick={fetchIssues}>Thử lại</button>
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="state-box state-empty">
              {issues.length === 0 ? 'Chưa có phiếu xuất kho nào.' : 'Không tìm thấy phiếu xuất nào khớp với tìm kiếm.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table" id="issues-table">
                <thead>
                  <tr>
                    <th>MÃ CHỨNG TỪ</th>
                    <th>NGÀY XUẤT</th>
                    <th>TRẠNG THÁI</th>
                    <th style={{ textAlign: 'right' }}>SỐ MẶT HÀNG</th>
                    <th style={{ textAlign: 'right' }}>TỔNG GIÁ VỐN (SERVER)</th>
                    <th>GHI CHÚ MỤC ĐÍCH</th>
                    <th style={{ textAlign: 'center' }}>THAO TÁC</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((iss) => (
                    <tr key={iss.id}>
                      <td>
                        <span className="code-badge" style={{ backgroundColor: '#f1f5f9', color: '#0f172a' }}>
                          🏷️ {iss.code}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{iss.date}</td>
                      <td>
                        {iss.status === 'POSTED' ? (
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
                        {iss.lines ? iss.lines.length : 0} mặt hàng
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: iss.status === 'POSTED' ? '#dc2626' : '#64748b' }}>
                        {/* Chi tiết đơn giá xuất và tổng giá do backend chụp */}
                        {iss.status === 'POSTED' ? formatCurrency(iss.total_value) : '0 đ (Chưa chốt)'}
                      </td>
                      <td style={{ color: '#64748b', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {iss.note || '-'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenDetail(iss)}
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
      {/* MÀN HÌNH 2: TẠO PHIẾU XUẤT NHÁP */}
      {/* ============================================================== */}
      {viewMode === 'CREATE' && (
        <div className="card-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 className="card-title">📝 Lập Phiếu Xuất Kho (Bản nháp)</h2>
              <p className="card-subtitle">
                Chọn ngày, mục đích xuất và các dòng nguyên liệu. Tồn kho tham khảo được hiển thị ngay bên cạnh.
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
              {/* Ngày xuất */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Ngày xuất kho: <span style={{ color: '#dc2626' }}>*</span>
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

              {/* Mã phiếu xuất (tùy chọn) */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Mã chứng từ xuất (Tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder="Để trống hệ thống sẽ tự sinh (XK...)"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: formErrors.code ? '1px solid #dc2626' : '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: '#ffffff'
                  }}
                />
                {formErrors.code && (
                  <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{formErrors.code}</p>
                )}
              </div>

              {/* Ghi chú mục đích xuất */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Lý do / Mục đích xuất kho:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Xuất chế biến bữa trưa cho 300 học sinh ngày 30/09..."
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

            {/* BẢNG CHỌN THỰC PHẨM VÀ SỐ LƯỢNG XUẤT */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                    Danh sách thực phẩm xuất kho
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    💡 Đơn giá xuất kho do hệ thống tự động ghi nhận theo giá vốn bình quân tại thời điểm chốt.
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
                  ➕ Thêm dòng xuất
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
                      <th style={{ minWidth: '240px' }}>THỰC PHẨM <span style={{ color: '#dc2626' }}>*</span></th>
                      <th style={{ width: '180px', textAlign: 'right' }}>TỒN KHO THAM KHẢO</th>
                      <th style={{ width: '160px' }}>SỐ LƯỢNG XUẤT <span style={{ color: '#dc2626' }}>*</span></th>
                      <th style={{ width: '100px' }}>ĐƠN VỊ</th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftLines.map((line, idx) => {
                      const selectedFood = typeof line.food_id === 'number' ? foodMap.get(line.food_id) : undefined;
                      const isDuplicate = typeof line.food_id === 'number' && duplicateFoodIds.has(line.food_id);
                      const currentStock = selectedFood ? Number(selectedFood.quantity) : 0;
                      const qtyVal = Number(line.quantity) || 0;
                      const isExceedingStock = selectedFood && qtyVal > currentStock;

                      return (
                        <tr key={idx} style={{ backgroundColor: isDuplicate ? '#fff1f2' : isExceedingStock ? '#fffbeb' : 'transparent' }}>
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
                              <option value="">-- Chọn thực phẩm xuất --</option>
                              {foods.map((f) => (
                                <option key={f.id} value={f.id}>
                                  [{f.code}] {f.name} (Tồn: {formatQuantity(f.quantity, f.unit)})
                                </option>
                              ))}
                            </select>
                            {isDuplicate && (
                              <p style={{ color: '#dc2626', fontSize: '11px', fontWeight: 600, marginTop: '3px' }}>
                                ⚠️ Mặt hàng này đã được chọn ở dòng khác!
                              </p>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {selectedFood ? (
                              <div>
                                <span style={{
                                  fontWeight: 700,
                                  color: currentStock <= 0 ? '#dc2626' : '#059669',
                                  fontSize: '13px'
                                }}>
                                  {formatQuantity(selectedFood.quantity, selectedFood.unit)}
                                </span>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                  Giá vốn: {formatCurrency(selectedFood.avg_cost)}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              placeholder="VD: 20"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: isExceedingStock ? '1px solid #d97706' : '1px solid #cbd5e1',
                                fontSize: '13px',
                                textAlign: 'right'
                              }}
                            />
                            {isExceedingStock && (
                              <p style={{ color: '#d97706', fontSize: '11px', marginTop: '2px', fontWeight: 500 }}>
                                ⚠️ Vượt tồn hiển thị ({currentStock})
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
                {submittingDraft ? '⏳ Đang lưu nháp...' : '💾 Lưu bản nháp xuất kho (Draft)'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================== */}
      {/* MÀN HÌNH 3: CHI TIẾT PHIẾU XUẤT & CHỐT XUẤT KHO */}
      {/* ============================================================== */}
      {viewMode === 'DETAIL' && selectedIssue && (
        <div className="card-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                <h2 className="card-title" style={{ margin: 0 }}>
                  Phiếu Xuất Kho: {selectedIssue.code}
                </h2>
                {selectedIssue.status === 'POSTED' ? (
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
                {selectedIssue.status === 'POSTED'
                  ? `Đã trừ kho thành công lúc ${selectedIssue.posted_at ? new Date(selectedIssue.posted_at).toLocaleString('vi-VN') : '-'}. Dữ liệu ở trạng thái chỉ đọc.`
                  : 'Bản nháp đang chờ chốt. Tồn kho thực tế chưa bị thay đổi.'}
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
              {selectedIssue.status === 'DRAFT' && !isViewer && (
                <button
                  type="button"
                  onClick={() => handlePromptPost(selectedIssue)}
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
                  🔒 Chốt xuất kho
                </button>
              )}
            </div>
          </div>

          {/* Thông tin chung */}
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
              <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Mã chứng từ:</span>
              <strong style={{ fontSize: '14px', color: '#0f172a' }}>{selectedIssue.code}</strong>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Ngày xuất:</span>
              <strong style={{ fontSize: '14px', color: '#0f172a' }}>{selectedIssue.date}</strong>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Trạng thái:</span>
              <strong style={{ fontSize: '14px', color: selectedIssue.status === 'POSTED' ? '#16a34a' : '#d97706' }}>
                {selectedIssue.status === 'POSTED' ? 'Đã chốt (Đã trừ tồn)' : 'Bản nháp (Chưa trừ tồn)'}
              </strong>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Tổng giá vốn xuất (Server):</span>
              <strong style={{ fontSize: '18px', color: selectedIssue.status === 'POSTED' ? '#dc2626' : '#64748b' }}>
                {selectedIssue.status === 'POSTED' ? formatCurrency(selectedIssue.total_value) : '0 đ'}
              </strong>
            </div>
            {selectedIssue.note && (
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Mục đích / Ghi chú:</span>
                <span style={{ fontSize: '13px', color: '#334155' }}>{selectedIssue.note}</span>
              </div>
            )}
          </div>

          {/* Bảng các dòng hàng xuất */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
              Danh sách chi tiết mặt hàng xuất
            </h3>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table className="custom-table" style={{ margin: 0 }}>
                <thead style={{ backgroundColor: '#f8fafc' }}>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>THỰC PHẨM</th>
                    <th style={{ textAlign: 'right' }}>SỐ LƯỢNG XUẤT</th>
                    <th style={{ textAlign: 'right' }}>ĐƠN GIÁ VỐN (SERVER)</th>
                    <th style={{ textAlign: 'right' }}>THÀNH TIỀN XUẤT (SERVER)</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedIssue.lines || []).map((line, idx) => (
                    <tr key={line.id || idx}>
                      <td style={{ color: '#94a3b8', fontSize: '12px' }}>{idx + 1}</td>
                      <td>
                        <strong>{line.food_name || `Thực phẩm #${line.food_id}`}</strong>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatQuantity(line.quantity, line.unit)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#475569' }}>
                        {selectedIssue.status === 'POSTED' ? formatCurrency(line.unit_cost) : 'Chờ chốt'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: selectedIssue.status === 'POSTED' ? '#dc2626' : '#64748b' }}>
                        {selectedIssue.status === 'POSTED' ? formatCurrency(line.line_total) : '0 đ'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {selectedIssue.status === 'POSTED' && (
                  <tfoot style={{ backgroundColor: '#f8fafc', fontWeight: 700 }}>
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'right', padding: '12px' }}>
                        TỔNG GIÁ VỐN XUẤT KHO:
                      </td>
                      <td style={{ textAlign: 'right', padding: '12px', fontSize: '15px', color: '#dc2626' }}>
                        {formatCurrency(selectedIssue.total_value)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL XÁC NHẬN CHỐT XUẤT KHO (VÀ XỬ LÝ THIẾU TỒN / LỖI MẠNG) */}
      {/* ============================================================== */}
      {issueToPost && (
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
            maxWidth: '540px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              🔒 Xác nhận Chốt Phiếu Xuất: {issueToPost.code}
            </h3>

            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginBottom: '16px' }}>
              Khi thực hiện chốt phiếu xuất:
            </p>
            <ul style={{ fontSize: '13px', color: '#475569', paddingLeft: '20px', marginBottom: '16px', lineHeight: 1.6 }}>
              <li>Máy chủ sẽ <strong>khóa hàng và kiểm tra tồn kho</strong> thực tế của từng mặt hàng.</li>
              <li>Nếu đủ tồn, hệ thống <strong>trừ tồn kho và chụp giá vốn bình quân (avg_cost)</strong> ngay lập tức.</li>
              <li>Nếu <strong>thiếu tồn dù chỉ một mặt hàng</strong>, toàn bộ phiếu xuất sẽ bị hủy bỏ (rollback) và không đổi tồn kho.</li>
            </ul>

            {/* Thông báo lỗi từ server (đặc biệt khi thiếu tồn) */}
            {postError && (
              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '16px',
                lineHeight: 1.5
              }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                  ❌ Máy chủ từ chối chốt phiếu:
                </div>
                <div>{postError}</div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#7f1d1d', fontStyle: 'italic' }}>
                  ℹ️ Hệ thống đã tự động làm mới lại số tồn kho thực tế từ cơ sở dữ liệu.
                </div>
              </div>
            )}

            {/* Lỗi mạng lúc chốt */}
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
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                  ⚠️ Cảnh báo mất kết nối mạng lúc chốt
                </div>
                <p>
                  Yêu cầu chốt phiếu bị gián đoạn ({networkErrorDetails.message}).
                </p>
                <p style={{ marginTop: '6px', fontWeight: 600 }}>
                  Hệ thống KHÔNG tự tạo phiếu mới. Vui lòng bấm kiểm tra trạng thái phiếu từ máy chủ:
                </p>
                <button
                  type="button"
                  onClick={() => handleCheckIssueStatus(networkErrorDetails.issueId)}
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
                onClick={() => setIssueToPost(null)}
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
                  {posting ? '⏳ Đang kiểm tra tồn & chốt...' : 'Xác nhận Chốt xuất kho'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssuePage;
