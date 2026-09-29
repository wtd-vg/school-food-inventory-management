import React, { useState, useEffect, useCallback } from 'react';
import { fetchApi } from './utils/api';

export interface Food {
  id: number;
  code: string;
  name: string;
  unit: string;
  is_active: boolean;
  quantity?: string;
  avg_cost?: string;
  stock_version?: number;
}

export interface IssueLineInput {
  food_id: number | '';
  quantity: string;
}

export interface IssueLineServer {
  id?: number;
  food_id: number;
  food_code?: string;
  food_name?: string;
  food_unit?: string;
  quantity: string;
  unit_cost?: string; // Giá vốn snapshot do server trả về sau khi chốt
  total?: string;
}

export interface Issue {
  id: number;
  code?: string;
  date: string;
  note: string;
  status: 'draft' | 'posted';
  total?: string;
  created_by?: string;
  posted_at?: string | null;
  lines: IssueLineServer[];
}

interface IssuePageProps {
  isViewer?: boolean;
}

// Key cho local storage mock khi backend chưa có API SF28
const LOCAL_ISSUES_KEY = 'schoolfood_mock_issues';

export const IssuePage: React.FC<IssuePageProps> = ({ isViewer = false }) => {
  // Danh mục thực phẩm & Tồn kho
  const [foods, setFoods] = useState<Food[]>([]);
  const [loadingFoods, setLoadingFoods] = useState<boolean>(true);
  const [foodsError, setFoodsError] = useState<string | null>(null);

  // Danh sách phiếu xuất đã lập
  const [issuesList, setIssuesList] = useState<Issue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);

  // State Form phiếu xuất hiện tại
  const [currentIssue, setCurrentIssue] = useState<Issue | null>(null);
  const [formDate, setFormDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [formNote, setFormNote] = useState<string>('');
  const [formLines, setFormLines] = useState<IssueLineInput[]>([
    { food_id: '', quantity: '' }
  ]);

  // Trạng thái thao tác
  const [savingDraft, setSavingDraft] = useState<boolean>(false);
  const [posting, setPosting] = useState<boolean>(false);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);

  // Thông báo lỗi, thành công & Cảnh báo thiếu tồn kho rõ ràng
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stockShortageError, setStockShortageError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  // Modal xác nhận chốt
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Chế độ mô phỏng fallback nếu API SF28 chưa có trên backend
  const [isMockMode, setIsMockMode] = useState<boolean>(false);

  // Format tiền tệ VND
  const formatVND = (value: string | number | undefined) => {
    if (value === undefined || value === null || value === '') return '0 đ';
    const num = Number(value);
    if (isNaN(num)) return `${value} đ`;
    return num.toLocaleString('vi-VN') + ' đ';
  };

  // Format số lượng
  const formatQty = (value: string | number | undefined, unit: string = '') => {
    if (value === undefined || value === null || value === '') return '0';
    const num = Number(value);
    if (isNaN(num)) return `${value} ${unit}`.trim();
    return `${num.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} ${unit}`.trim();
  };

  // 1. Tải danh sách thực phẩm & Tồn kho hiện tại
  const loadFoods = useCallback(async () => {
    try {
      const res = await fetchApi('/api/foods/');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.results || [];
        setFoods(list);
        setFoodsError(null);
      } else {
        setFoodsError(`Không thể tải dữ liệu thực phẩm: Mã ${res.status}`);
      }
    } catch (err: any) {
      setFoodsError(`Lỗi kết nối khi tải thực phẩm: ${err.message || 'Lỗi mạng'}`);
    } finally {
      setLoadingFoods(false);
    }
  }, []);

  // 2. Tải danh sách phiếu xuất
  const loadIssues = useCallback(async () => {
    try {
      const res = await fetchApi('/api/issues/');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.results || [];
        setIssuesList(list);
        setIsMockMode(false);
      } else if (res.status === 404) {
        // Backend chưa có endpoint SF28 -> Dùng mock storage
        setIsMockMode(true);
        const saved = localStorage.getItem(LOCAL_ISSUES_KEY);
        if (saved) {
          try {
            setIssuesList(JSON.parse(saved));
          } catch {
            setIssuesList([]);
          }
        }
      }
    } catch {
      setIsMockMode(true);
      const saved = localStorage.getItem(LOCAL_ISSUES_KEY);
      if (saved) {
        try {
          setIssuesList(JSON.parse(saved));
        } catch {
          setIssuesList([]);
        }
      }
    }
  }, []);

  useEffect(() => {
    loadFoods();
    loadIssues();
  }, [loadFoods, loadIssues]);

  // Kiểm tra cấm chọn trùng food trong form UI
  const selectedFoodIds = formLines
    .map(line => line.food_id)
    .filter(id => id !== '' && typeof id === 'number') as number[];

  const duplicateFoodIds = selectedFoodIds.filter(
    (id, index) => selectedFoodIds.indexOf(id) !== index
  );
  const hasDuplicateFood = duplicateFoodIds.length > 0;

  // Thêm dòng xuất mới
  const handleAddLine = () => {
    setFormLines(prev => [...prev, { food_id: '', quantity: '' }]);
  };

  // Xóa dòng xuất
  const handleRemoveLine = (index: number) => {
    if (formLines.length === 1) {
      setFormLines([{ food_id: '', quantity: '' }]);
      return;
    }
    setFormLines(prev => prev.filter((_, i) => i !== index));
  };

  // Cập nhật giá trị dòng
  const handleLineChange = (index: number, field: keyof IssueLineInput, value: string | number) => {
    setFormLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Tạo phiếu mới
  const handleNewIssue = () => {
    setCurrentIssue(null);
    setSelectedIssueId(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNote('');
    setFormLines([{ food_id: '', quantity: '' }]);
    setErrorMessage(null);
    setStockShortageError(null);
    setSuccessMessage(null);
    setNetworkWarning(null);
  };

  // Chọn xem lại phiếu xuất từ danh sách
  const handleSelectIssue = (issue: Issue) => {
    setCurrentIssue(issue);
    setSelectedIssueId(issue.id);
    setFormDate(issue.date);
    setFormNote(issue.note || '');
    setFormLines(
      issue.lines.map(l => ({
        food_id: l.food_id,
        quantity: l.quantity
      }))
    );
    setErrorMessage(null);
    setStockShortageError(null);
    setSuccessMessage(null);
    setNetworkWarning(null);
  };

  // Validate form trước khi lưu nháp
  const validateForm = (): string | null => {
    if (!formDate) return 'Vui lòng chọn Ngày xuất.';
    if (formLines.length === 0) return 'Phiếu xuất phải có ít nhất 1 dòng hàng.';

    for (let i = 0; i < formLines.length; i++) {
      const line = formLines[i];
      if (!line.food_id) return `Dòng ${i + 1}: Vui lòng chọn Thực phẩm xuất.`;

      const qty = parseFloat(line.quantity);
      if (isNaN(qty) || qty <= 0) return `Dòng ${i + 1}: Số lượng xuất phải lớn hơn 0.`;
    }

    if (hasDuplicateFood) {
      return 'Không được chọn trùng thực phẩm trong cùng một phiếu xuất.';
    }

    return null;
  };

  // =========================================================================
  // 1. TẠO / LƯU NHÁP PHIẾU XUẤT (DRAFT)
  // =========================================================================
  const handleSaveDraft = async () => {
    setErrorMessage(null);
    setStockShortageError(null);
    setSuccessMessage(null);
    setNetworkWarning(null);

    const validationErr = validateForm();
    if (validationErr) {
      setErrorMessage(validationErr);
      return;
    }

    setSavingDraft(true);

    // Frontend TUYỆT ĐỐI KHÔNG GỬI unit_cost! Chỉ gửi food_id và quantity
    const payload = {
      date: formDate,
      note: formNote.trim(),
      lines: formLines.map(l => ({
        food_id: Number(l.food_id),
        quantity: l.quantity.toString().trim()
      }))
    };

    try {
      const response = await fetchApi('/api/issues/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const savedIssue: Issue = await response.json();
        setCurrentIssue(savedIssue);
        setSelectedIssueId(savedIssue.id);
        setSuccessMessage(`Đã lưu nháp phiếu xuất #${savedIssue.code || savedIssue.id} thành công! (Trạng thái: DRAFT - Tồn kho chưa bị trừ)`);
        loadIssues();
      } else if (response.status === 404 && isMockMode) {
        handleSaveDraftMock(payload);
      } else {
        const errData = await response.json().catch(() => null);
        const msg = errData?.error || (errData ? JSON.stringify(errData) : `Lỗi ${response.status}`);
        setErrorMessage(`Lưu nháp xuất kho thất bại: ${msg}`);
      }
    } catch (err: any) {
      if (isMockMode) {
        handleSaveDraftMock(payload);
      } else {
        setErrorMessage(`Lỗi mạng khi lưu nháp xuất: ${err.message || 'Không thể kết nối máy chủ'}`);
      }
    } finally {
      setSavingDraft(false);
    }
  };

  // Mock lưu nháp theo chuẩn contract SF28
  const handleSaveDraftMock = (payload: any) => {
    const nextId = issuesList.length > 0 ? Math.max(...issuesList.map(i => i.id)) + 1 : 1;
    const issueCode = `PX-${new Date().getFullYear()}${String(nextId).padStart(3, '0')}`;

    const mappedLines: IssueLineServer[] = payload.lines.map((l: any, idx: number) => {
      const f = foods.find(food => food.id === l.food_id);
      return {
        id: idx + 1,
        food_id: l.food_id,
        food_code: f?.code || '',
        food_name: f?.name || `Thực phẩm #${l.food_id}`,
        food_unit: f?.unit || 'kg',
        quantity: l.quantity,
        unit_cost: '0.00', // Chưa chốt nên giá vốn snapshot chưa có
        total: '0.00'
      };
    });

    const newIssue: Issue = {
      id: nextId,
      code: issueCode,
      date: payload.date,
      note: payload.note,
      status: 'draft',
      total: '0.00',
      lines: mappedLines,
      posted_at: null
    };

    const updatedList = [newIssue, ...issuesList];
    setIssuesList(updatedList);
    localStorage.setItem(LOCAL_ISSUES_KEY, JSON.stringify(updatedList));

    setCurrentIssue(newIssue);
    setSelectedIssueId(newIssue.id);
    setSuccessMessage(`Đã lưu nháp phiếu xuất #${newIssue.code} thành công! (Mô phỏng UI - Tồn kho chưa bị trừ)`);
  };

  // =========================================================================
  // 2. CHỐT PHIẾU XUẤT (POST ISSUE) VỚI XÁC NHẬN VÀ KIỂM TRA THIẾU TỒN
  // =========================================================================
  const handlePostIssue = async () => {
    if (!currentIssue || currentIssue.status !== 'draft') {
      setErrorMessage('Chỉ có thể chốt phiếu xuất ở trạng thái Nháp (DRAFT).');
      return;
    }

    setShowConfirmModal(false);
    setPosting(true);
    setErrorMessage(null);
    setStockShortageError(null);
    setSuccessMessage(null);
    setNetworkWarning(null);

    const issueId = currentIssue.id;

    try {
      const response = await fetchApi(`/api/issues/${issueId}/post/`, {
        method: 'POST'
      });

      if (response.ok) {
        const postedIssue: Issue = await response.json();
        setCurrentIssue(postedIssue);
        setSuccessMessage(`✅ Chốt phiếu xuất #${postedIssue.code || issueId} thành công! Tồn kho đã được trừ và giá vốn đã được snapshot.`);
        await loadFoods(); // Reload lại tồn kho mới nhất
        await loadIssues();
      } else if (response.status === 409) {
        // Yêu cầu đặc tả: "nếu server báo thiếu tồn, reload tồn và giữ thông báo rõ."
        const errData = await response.json().catch(() => null);
        const shortageMsg = errData?.error || 'Không đủ tồn kho để xuất hàng (Xung đột tồn kho 409).';
        setStockShortageError(`❌ LỖI THIẾU TỒN KHO: ${shortageMsg}`);

        // Tự động reload tồn kho ngay lập tức để cập nhật số tồn mới nhất
        await loadFoods();
      } else if (response.status === 404 && isMockMode) {
        // Fallback Mock kiểm tra thiếu tồn và chốt theo chuẩn SF26
        handlePostIssueMock(issueId);
      } else {
        const errData = await response.json().catch(() => null);
        const msg = errData?.error || `Lỗi chốt phiếu xuất (${response.status})`;
        setErrorMessage(`Lỗi từ máy chủ: ${msg}`);
      }
    } catch (networkErr: any) {
      // Yêu cầu đặc tả: Lỗi mạng lúc chốt -> đọc lại chi tiết phiếu, không tự tạo lại phiếu mới
      setNetworkWarning(`⚠️ Mất kết nối mạng khi gửi lệnh chốt phiếu xuất! Đang đọc lại chi tiết phiếu #${issueId} từ máy chủ...`);
      await checkIssueStatus(issueId);
    } finally {
      setPosting(false);
    }
  };

  // Đọc lại chi tiết phiếu xuất để biết trạng thái
  const checkIssueStatus = async (issueId: number) => {
    setCheckingStatus(true);
    try {
      const res = await fetchApi(`/api/issues/${issueId}/`);
      if (res.ok) {
        const detail: Issue = await res.json();
        setCurrentIssue(detail);
        if (detail.status === 'posted') {
          setSuccessMessage(`✅ Phiếu xuất #${detail.code || issueId} đã được chốt thành công trước khi gián đoạn mạng.`);
          setNetworkWarning(null);
          loadFoods();
        } else {
          setNetworkWarning(`Phiếu xuất #${detail.code || issueId} hiện vẫn ở trạng thái Nháp (DRAFT). Bạn có thể bấm Chốt lại.`);
        }
      } else {
        setNetworkWarning(`Không thể đọc lại chi tiết phiếu xuất: Máy chủ trả về mã ${res.status}.`);
      }
    } catch {
      setNetworkWarning(`Không thể kết nối máy chủ để đọc lại phiếu xuất #${issueId}.`);
    } finally {
      setCheckingStatus(false);
    }
  };

  // Mock chốt phiếu xuất theo đúng logic SF26 (kiểm tra thiếu tồn, trừ tồn, snapshot avg_cost)
  const handlePostIssueMock = (issueId: number) => {
    if (!currentIssue) return;

    // 1. KIỂM TRA THIẾU TỒN KHO (SF26 chống âm kho)
    for (const line of currentIssue.lines) {
      const food = foods.find(f => f.id === line.food_id);
      const currentStock = parseFloat(food?.quantity || '0');
      const requestQty = parseFloat(line.quantity);

      if (requestQty > currentStock) {
        // TỒN KHÔNG ĐỦ -> BÁO LỖI THIẾU TỒN VÀ RELOAD TỒN
        setStockShortageError(
          `❌ LỖI THIẾU TỒN KHO: Không đủ tồn kho cho '${food?.name || `Mã ${line.food_id}`}'. Tồn kho hiện tại: ${currentStock.toFixed(3)}, yêu cầu xuất: ${requestQty.toFixed(3)}.`
        );
        loadFoods(); // Reload tồn
        return;
      }
    }

    // 2. NẾU ĐỦ TỒN: Trừ tồn kho, snapshot avg_cost, giữ nguyên avg_cost
    let totalExportValue = 0;
    const updatedFoods = [...foods];
    const postedLines: IssueLineServer[] = currentIssue.lines.map(line => {
      const foodIdx = updatedFoods.findIndex(f => f.id === line.food_id);
      const currentCost = parseFloat(updatedFoods[foodIdx]?.avg_cost || '0');
      const qtyOut = parseFloat(line.quantity);
      const lineCost = qtyOut * currentCost;
      totalExportValue += lineCost;

      // Trừ tồn kho thực tế, GIỮ NGUYÊN avg_cost
      const oldQty = parseFloat(updatedFoods[foodIdx].quantity || '0');
      updatedFoods[foodIdx] = {
        ...updatedFoods[foodIdx],
        quantity: Math.max(0, oldQty - qtyOut).toFixed(3)
      };

      return {
        ...line,
        unit_cost: currentCost.toFixed(2), // Snapshot giá vốn do server ghi lại
        total: lineCost.toFixed(2)
      };
    });

    setFoods(updatedFoods);

    const postedIssue: Issue = {
      ...currentIssue,
      status: 'posted',
      total: totalExportValue.toFixed(2),
      lines: postedLines,
      posted_at: new Date().toISOString()
    };

    const updatedList = issuesList.map(i => i.id === issueId ? postedIssue : i);
    setIssuesList(updatedList);
    localStorage.setItem(LOCAL_ISSUES_KEY, JSON.stringify(updatedList));

    setCurrentIssue(postedIssue);
    setSuccessMessage(`✅ Chốt phiếu xuất #${postedIssue.code} thành công! Đã trừ ${currentIssue.lines.length} mặt hàng khỏi tồn kho.`);
  };

  const isFormLocked = currentIssue?.status === 'posted';

  return (
    <div className="issue-page">

      {/* THÔNG BÁO THÀNH CÔNG */}
      {successMessage && (
        <div style={{
          backgroundColor: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#065f46',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px',
          fontWeight: 600
        }}>
          {successMessage}
        </div>
      )}

      {/* THÔNG BÁO LỖI THIẾU TỒN KHO RÕ RÀNG (YÊU CẦU SF27: giữ thông báo rõ, reload tồn) */}
      {stockShortageError && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '2px solid #ef4444',
          color: '#991b1b',
          padding: '14px 18px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px',
          fontWeight: 700,
          boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <span>CẢNH BÁO TỒN KHO KHÔNG ĐỦ — ĐÃ TỰ ĐỘNG LÀM MỚI TỒN KHO THỰC TẾ:</span>
          </div>
          <div style={{ fontWeight: 500, fontSize: '13px', color: '#7f1d1d', paddingLeft: '26px' }}>
            {stockShortageError}
          </div>
          <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '6px', paddingLeft: '26px' }}>
            💡 Vui lòng kiểm tra lại cột "Tồn kho hiện tại" bên dưới và điều chỉnh số lượng xuất phù hợp trước khi thử chốt lại.
          </div>
        </div>
      )}

      {/* THÔNG BÁO LỖI CHUNG */}
      {errorMessage && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px',
          fontWeight: 500
        }}>
          {errorMessage}
        </div>
      )}

      {/* CẢNH BÁO MẠNG */}
      {networkWarning && (
        <div style={{
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          color: '#92400e',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>{networkWarning}</div>
          {currentIssue && (
            <button
              onClick={() => checkIssueStatus(currentIssue.id)}
              disabled={checkingStatus}
              style={{
                backgroundColor: '#d97706',
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              {checkingStatus ? 'Đang đọc...' : 'Kiểm tra trạng thái'}
            </button>
          )}
        </div>
      )}

      {foodsError && (
        <div className="state-box state-error">{foodsError}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
        {/* ========================================================================= */}
        {/* CỘT TRÁI: FORM LẬP VÀ XEM CHI TIẾT PHIẾU XUẤT */}
        {/* ========================================================================= */}
        <div className="card-container">
          <div className="card-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="card-title">
                  {currentIssue ? `Phiếu xuất #${currentIssue.code || currentIssue.id}` : 'Lập phiếu xuất kho mới'}
                </h2>
                {currentIssue && (
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: currentIssue.status === 'posted' ? '#dcfce7' : '#fef3c7',
                    color: currentIssue.status === 'posted' ? '#15803d' : '#b45309',
                    border: `1px solid ${currentIssue.status === 'posted' ? '#86efac' : '#fcd34d'}`
                  }}>
                    {currentIssue.status === 'posted' ? 'ĐÃ CHỐT (POSTED)' : 'BẢN NHÁP (DRAFT)'}
                  </span>
                )}
              </div>
              <p className="card-subtitle">
                {isFormLocked
                  ? '🔒 Phiếu xuất này đã được chốt và trừ tồn kho. Chi tiết phiếu chỉ đọc (Read-only).'
                  : currentIssue
                  ? 'Phiếu đang ở trạng thái Nháp. Tồn kho chưa bị trừ. Bạn có thể kiểm tra tồn và bấm Chốt.'
                  : 'Chọn thực phẩm và số lượng cần xuất kho. Tồn kho hiển thị để tham khảo.'}
              </p>
            </div>

            <button
              onClick={handleNewIssue}
              className="btn-add"
              style={{ backgroundColor: '#475569' }}
            >
              + Tạo phiếu xuất mới
            </button>
          </div>

          {/* CẢNH BÁO QUYỀN VIEWER */}
          {isViewer && (
            <div style={{
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#475569'
            }}>
              🔒 Tài khoản của bạn có vai trò <strong>Viewer (Chỉ xem)</strong>. Bạn chỉ có thể xem danh sách và chi tiết phiếu xuất.
            </div>
          )}

          {/* THÔNG TIN CHUNG: NGÀY XUẤT & GHI CHÚ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '16px',
            marginBottom: '20px',
            backgroundColor: '#f8fafc',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Ngày xuất <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                disabled={isFormLocked || isViewer || savingDraft || posting}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: isFormLocked ? '#f1f5f9' : '#ffffff',
                  fontSize: '13px',
                  color: '#0f172a'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Mục đích / Ghi chú xuất kho
              </label>
              <input
                type="text"
                placeholder="Ví dụ: Xuất chế biến bữa trưa học sinh bán trú..."
                value={formNote}
                onChange={e => setFormNote(e.target.value)}
                disabled={isFormLocked || isViewer || savingDraft || posting}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: isFormLocked ? '#f1f5f9' : '#ffffff',
                  fontSize: '13px',
                  color: '#0f172a'
                }}
              />
            </div>
          </div>

          {/* CẢNH BÁO CHỌN TRÙNG THỰC PHẨM TRÊN GIAO DIỆN */}
          {hasDuplicateFood && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>🚫 CẤM THỰC PHẨM TRÙNG:</span>
              <span>Có thực phẩm được chọn lặp lại ở nhiều dòng! Mỗi thực phẩm chỉ được xuất hiện 1 lần trong phiếu xuất.</span>
            </div>
          )}

          {/* BẢNG CÁC DÒNG HÀNG XUẤT (ISSUE LINES) */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                Danh sách thực phẩm xuất kho ({formLines.length} dòng)
              </h3>
              {!isFormLocked && !isViewer && (
                <button
                  type="button"
                  onClick={handleAddLine}
                  disabled={savingDraft || posting}
                  style={{
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  + Thêm dòng xuất kho
                </button>
              )}
            </div>

            <table className="custom-table" style={{ marginTop: '0' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9' }}>
                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                  <th>Thực phẩm / Nguyên liệu <span style={{ color: '#dc2626' }}>*</span></th>
                  <th style={{ width: '130px', backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                    Tồn kho (Tham khảo)
                  </th>
                  <th style={{ width: '130px' }}>Số lượng xuất <span style={{ color: '#dc2626' }}>*</span></th>
                  {/* CỘT GIÁ VỐN CHỈ ĐỌC (YÊU CẦU: Không cho nhập đơn giá xuất từ frontend) */}
                  <th style={{ width: '140px', textAlign: 'right' }}>
                    Đơn giá vốn {isFormLocked ? '(Snapshot)' : '(Chỉ đọc)'}
                  </th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Thành tiền xuất</th>
                  {!isFormLocked && !isViewer && <th style={{ width: '50px', textAlign: 'center' }}>Xóa</th>}
                </tr>
              </thead>
              <tbody>
                {formLines.map((line, idx) => {
                  const selectedFood = foods.find(f => f.id === line.food_id);
                  const isDuplicated = line.food_id !== '' && duplicateFoodIds.includes(line.food_id as number);
                  const currentStock = parseFloat(selectedFood?.quantity || '0');
                  const requestQty = parseFloat(line.quantity) || 0;
                  const isOverStock = line.food_id !== '' && requestQty > currentStock;

                  // Giá vốn: nếu đã posted thì lấy từ server line, nếu chưa chốt thì lấy avg_cost tham khảo
                  const unitCostVal = currentIssue?.lines[idx]?.unit_cost
                    ? parseFloat(currentIssue.lines[idx].unit_cost || '0')
                    : parseFloat(selectedFood?.avg_cost || '0');
                  const lineTotal = requestQty * unitCostVal;

                  return (
                    <tr key={idx} style={{ backgroundColor: isDuplicated || isOverStock ? '#fff1f2' : 'transparent' }}>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#64748b' }}>
                        {idx + 1}
                      </td>

                      {/* Chọn thực phẩm */}
                      <td>
                        <select
                          value={line.food_id}
                          onChange={e => handleLineChange(idx, 'food_id', e.target.value ? Number(e.target.value) : '')}
                          disabled={isFormLocked || isViewer || savingDraft || posting}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '4px',
                            border: isDuplicated ? '2px solid #ef4444' : '1px solid #cbd5e1',
                            fontSize: '13px',
                            backgroundColor: isFormLocked ? '#f1f5f9' : '#ffffff'
                          }}
                        >
                          <option value="">-- Chọn Thực phẩm --</option>
                          {foods.map(f => {
                            const isChosenElsewhere = formLines.some(
                              (other, otherIdx) => otherIdx !== idx && other.food_id === f.id
                            );
                            return (
                              <option
                                key={f.id}
                                value={f.id}
                                disabled={isChosenElsewhere}
                              >
                                {f.code} - {f.name} {isChosenElsewhere ? '(Đã chọn)' : `(Tồn: ${f.quantity || 0} ${f.unit})`}
                              </option>
                            );
                          })}
                        </select>
                        {isDuplicated && (
                          <div style={{ color: '#dc2626', fontSize: '11px', marginTop: '3px' }}>
                            ⚠️ Thực phẩm bị chọn trùng!
                          </div>
                        )}
                        {isOverStock && (
                          <div style={{ color: '#dc2626', fontSize: '11px', marginTop: '3px', fontWeight: 600 }}>
                            ⚠️ Yêu cầu ({requestQty}) vượt tồn kho ({currentStock})!
                          </div>
                        )}
                      </td>

                      {/* Tồn kho hiện tại để tham khảo */}
                      <td style={{ backgroundColor: '#f0f9ff', fontWeight: 700, color: '#0369a1', fontSize: '13px' }}>
                        {selectedFood ? `${formatQty(selectedFood.quantity, selectedFood.unit)}` : '-'}
                      </td>

                      {/* Số lượng xuất */}
                      <td>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          placeholder="0.000"
                          value={line.quantity}
                          onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                          disabled={isFormLocked || isViewer || savingDraft || posting}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '4px',
                            border: isOverStock ? '2px solid #ef4444' : '1px solid #cbd5e1',
                            fontSize: '13px',
                            backgroundColor: isFormLocked ? '#f1f5f9' : '#ffffff'
                          }}
                        />
                      </td>

                      {/* Đơn giá vốn: KHÔNG CHO PHÉP NHẬP TỪ FRONTEND (Chỉ đọc) */}
                      <td style={{ textAlign: 'right', color: '#475569', fontSize: '13px' }}>
                        {selectedFood ? (
                          <span>
                            {formatVND(unitCostVal)}
                            {!isFormLocked && (
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                (Giá vốn tham khảo)
                              </div>
                            )}
                          </span>
                        ) : '-'}
                      </td>

                      {/* Thành tiền xuất */}
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                        {currentIssue?.lines[idx]?.total
                          ? formatVND(currentIssue.lines[idx].total)
                          : formatVND(lineTotal)}
                      </td>

                      {/* Xóa dòng */}
                      {!isFormLocked && !isViewer && (
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={savingDraft || posting}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#dc2626',
                              cursor: 'pointer',
                              fontSize: '16px'
                            }}
                            title="Xóa dòng này"
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* TỔNG GIÁ TRỊ XUẤT KHO DO SERVER TÍNH */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            marginBottom: '24px'
          }}>
            <div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                Tổng giá trị xuất kho:
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {isFormLocked
                  ? '(*) Giá trị chính thức do máy chủ ghi nhận (Quantity × Snapshot Unit Cost)'
                  : '(*) Giá trị ước tính theo giá vốn tham khảo hiện tại — Server sẽ ghi nhận giá vốn chính xác lúc chốt'}
              </div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0284c7' }}>
              {currentIssue?.total && currentIssue.total !== '0.00'
                ? formatVND(currentIssue.total)
                : formatVND(
                    formLines.reduce((acc, l) => {
                      const f = foods.find(food => food.id === l.food_id);
                      const cost = parseFloat(f?.avg_cost || '0');
                      const qty = parseFloat(l.quantity) || 0;
                      return acc + qty * cost;
                    }, 0)
                  )}
            </div>
          </div>

          {/* CÁC NÚT HÀNH ĐỘNG: LƯU NHÁP & CHỐT PHIẾU XUẤT */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '14px', alignItems: 'center' }}>
            {/* NÚT LƯU NHÁP */}
            {!isFormLocked && !isViewer && (
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft || posting || hasDuplicateFood}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: savingDraft || posting || hasDuplicateFood ? 'not-allowed' : 'pointer',
                  opacity: hasDuplicateFood ? 0.6 : 1
                }}
              >
                {savingDraft ? '⏳ Đang lưu nháp...' : '💾 Lưu nháp xuất kho (Create Draft)'}
              </button>
            )}

            {/* NÚT CHỐT CÓ XÁC NHẬN (POST ISSUE) */}
            {!isViewer && currentIssue && currentIssue.status === 'draft' && (
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={posting || savingDraft}
                style={{
                  backgroundColor: posting ? '#9ca3af' : '#ea580c',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: posting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {posting ? '🔒 Đang chốt phiếu...' : '🔒 Chốt phiếu xuất (Post Issue)'}
              </button>
            )}

            {/* TRẠNG THÁI ĐÃ CHỐT */}
            {isFormLocked && (
              <div style={{
                backgroundColor: '#dcfce7',
                color: '#15803d',
                padding: '8px 16px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                ✅ Phiếu đã chốt lúc: {currentIssue?.posted_at ? new Date(currentIssue.posted_at).toLocaleString('vi-VN') : 'Đã chốt'}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CỘT PHẢI: BẢNG TỒN KHO THỰC TẾ & DANH SÁCH LỊCH SỬ PHIẾU XUẤT */}
        {/* ========================================================================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* THẺ TỒN KHO THAM KHẢO & CẬP NHẬT */}
          <div className="card-container" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                📦 Tồn kho thực tế
              </h3>
              <button
                onClick={loadFoods}
                disabled={loadingFoods}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {loadingFoods ? 'Đang tải...' : '🔄 Làm mới'}
              </button>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '12px' }}>
              {foods.map(f => (
                <div key={f.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid #f1f5f9'
                }}>
                  <div>
                    <div style={{ fontWeight: 500, color: '#334155' }}>{f.name}</div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Giá vốn: {formatVND(f.avg_cost)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: parseFloat(f.quantity || '0') > 0 ? '#0284c7' : '#dc2626' }}>
                      {formatQty(f.quantity, f.unit)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DANH SÁCH PHIẾU XUẤT ĐÃ LẬP */}
          <div className="card-container" style={{ padding: '20px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                📋 Lịch sử phiếu xuất
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {issuesList.length} phiếu
              </span>
            </div>

            {issuesList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '13px' }}>
                Chưa có phiếu xuất nào được lập.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                {issuesList.map(issue => {
                  const isSelected = selectedIssueId === issue.id;
                  const isPosted = issue.status === 'posted';

                  return (
                    <div
                      key={issue.id}
                      onClick={() => handleSelectIssue(issue)}
                      style={{
                        padding: '12px',
                        borderRadius: '6px',
                        border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                        backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                          #{issue.code || `PX-${issue.id}`}
                        </span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: isPosted ? '#dcfce7' : '#fef3c7',
                          color: isPosted ? '#15803d' : '#b45309'
                        }}>
                          {isPosted ? 'ĐÃ CHỐT' : 'NHÁP'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                        {issue.date} {issue.note ? `• ${issue.note}` : ''}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: '#64748b' }}>{issue.lines.length} mặt hàng</span>
                        <span style={{ fontWeight: 700, color: '#0284c7' }}>
                          {formatVND(issue.total)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL XÁC NHẬN CHỐT PHIẾU XUẤT (CONFIRM MODAL) */}
      {/* ========================================================================= */}
      {showConfirmModal && currentIssue && (
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
          zIndex: 999
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            width: '480px',
            maxWidth: '90%',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#ffedd5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                📦
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                Xác nhận chốt phiếu xuất #{currentIssue.code || currentIssue.id}
              </h3>
            </div>

            <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6, marginBottom: '20px' }}>
              <p style={{ marginBottom: '8px' }}>
                Bạn có chắc chắn muốn chốt phiếu xuất kho này?
              </p>
              <div style={{
                backgroundColor: '#f8fafc',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '13px',
                border: '1px solid #e2e8f0',
                marginBottom: '12px'
              }}>
                <div><strong>Ngày xuất:</strong> {currentIssue.date}</div>
                <div><strong>Số lượng mặt hàng:</strong> {currentIssue.lines.length} loại</div>
                <div><strong>Ghi chú:</strong> {currentIssue.note || 'Không có'}</div>
              </div>
              <p style={{ color: '#ea580c', fontWeight: 600 }}>
                ⚠️ Lưu ý quan trọng: Sau khi chốt:
              </p>
              <ul style={{ paddingLeft: '20px', color: '#64748b', fontSize: '13px' }}>
                <li>Số lượng tồn kho sẽ bị TRỪ vĩnh viễn trong kho.</li>
                <li>Đơn giá vốn snapshot sẽ được ghi nhận tại thời điểm chốt (giá bình quân hiện tại).</li>
                <li>Hệ thống sẽ từ chối nếu có bất kỳ mặt hàng nào thiếu tồn kho (chống âm kho).</li>
                <li>Phiếu xuất sẽ bị KHÓA VĨNH VIỄN không thể chỉnh sửa.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={posting}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  padding: '9px 18px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handlePostIssue}
                disabled={posting}
                style={{
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: posting ? 'not-allowed' : 'pointer'
                }}
              >
                {posting ? 'Đang chốt...' : 'Xác nhận Chốt xuất kho'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssuePage;
