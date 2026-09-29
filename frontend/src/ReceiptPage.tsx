import React, { useState, useEffect, useCallback } from 'react';
import { fetchApi } from './utils/api';

export interface Supplier {
  id: number;
  code: string;
  name: string;
  phone?: string;
  is_active: boolean;
}

export interface Food {
  id: number;
  code: string;
  name: string;
  unit: string;
  is_active: boolean;
  quantity?: string;
  avg_cost?: string;
}

export interface ReceiptLineInput {
  food_id: number | '';
  quantity: string;
  unit_price: string;
}

export interface ReceiptLineServer {
  id?: number;
  food_id: number;
  food_code?: string;
  food_name?: string;
  food_unit?: string;
  quantity: string;
  unit_price: string;
  total?: string;
}

export interface Receipt {
  id: number;
  supplier_id: number;
  supplier_name?: string;
  supplier_code?: string;
  date: string;
  note: string;
  status: 'draft' | 'posted';
  total: string;
  created_by?: string;
  posted_at?: string | null;
  lines: ReceiptLineServer[];
}

interface ReceiptPageProps {
  isViewer?: boolean;
}

// Key cho local storage mock khi backend chưa có API SF22
const LOCAL_RECEIPTS_KEY = 'schoolfood_mock_receipts';

export const ReceiptPage: React.FC<ReceiptPageProps> = ({ isViewer = false }) => {
  // Danh mục tham chiếu
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [refError, setRefError] = useState<string | null>(null);

  // Danh sách phiếu nhập đã lập
  const [receiptsList, setReceiptsList] = useState<Receipt[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(null);

  // State Form phiếu nhập hiện tại
  const [currentReceipt, setCurrentReceipt] = useState<Receipt | null>(null);
  const [formSupplierId, setFormSupplierId] = useState<number | ''>('');
  const [formDate, setFormDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [formNote, setFormNote] = useState<string>('');
  const [formLines, setFormLines] = useState<ReceiptLineInput[]>([
    { food_id: '', quantity: '', unit_price: '' }
  ]);

  // Trạng thái thao tác
  const [savingDraft, setSavingDraft] = useState<boolean>(false);
  const [posting, setPosting] = useState<boolean>(false);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  // Modal xác nhận chốt
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Chế độ mô phỏng fallback nếu API SF22 chưa được cài trên backend
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

  // 1. Tải danh mục Supplier & Food & Tồn kho
  const loadReferenceData = useCallback(async () => {
    try {
      const [resSuppliers, resFoods] = await Promise.all([
        fetchApi('/api/suppliers/'),
        fetchApi('/api/foods/')
      ]);

      if (resSuppliers.ok) {
        const supData = await resSuppliers.json();
        const list = Array.isArray(supData) ? supData : supData.results || [];
        setSuppliers(list.filter((s: Supplier) => s.is_active !== false));
      }

      if (resFoods.ok) {
        const foodsData = await resFoods.json();
        const list = Array.isArray(foodsData) ? foodsData : foodsData.results || [];
        setFoods(list);
      }
    } catch (err: any) {
      setRefError('Không thể tải danh mục tham chiếu: ' + (err.message || 'Lỗi mạng'));
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  // 2. Tải danh sách phiếu nhập
  const loadReceipts = useCallback(async () => {
    try {
      const res = await fetchApi('/api/receipts/');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.results || [];
        setReceiptsList(list);
        setIsMockMode(false);
      } else if (res.status === 404) {
        // Backend chưa có endpoint SF22 -> Dùng mock storage để TV3/TV5 kiểm thử UI
        setIsMockMode(true);
        const saved = localStorage.getItem(LOCAL_RECEIPTS_KEY);
        if (saved) {
          try {
            setReceiptsList(JSON.parse(saved));
          } catch {
            setReceiptsList([]);
          }
        }
      }
    } catch {
      // Lỗi mạng hoặc server chưa có route
      setIsMockMode(true);
      const saved = localStorage.getItem(LOCAL_RECEIPTS_KEY);
      if (saved) {
        try {
          setReceiptsList(JSON.parse(saved));
        } catch {
          setReceiptsList([]);
        }
      }
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
    loadReceipts();
  }, [loadReferenceData, loadReceipts]);

  // Kiểm tra danh sách food đã chọn trong form để cấm chọn trùng
  const selectedFoodIds = formLines
    .map(line => line.food_id)
    .filter(id => id !== '' && typeof id === 'number') as number[];

  const duplicateFoodIds = selectedFoodIds.filter(
    (id, index) => selectedFoodIds.indexOf(id) !== index
  );
  const hasDuplicateFood = duplicateFoodIds.length > 0;

  // Thêm dòng mới
  const handleAddLine = () => {
    setFormLines(prev => [...prev, { food_id: '', quantity: '', unit_price: '' }]);
  };

  // Xóa dòng
  const handleRemoveLine = (index: number) => {
    if (formLines.length === 1) {
      setFormLines([{ food_id: '', quantity: '', unit_price: '' }]);
      return;
    }
    setFormLines(prev => prev.filter((_, i) => i !== index));
  };

  // Cập nhật giá trị dòng
  const handleLineChange = (index: number, field: keyof ReceiptLineInput, value: string | number) => {
    setFormLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Reset form để tạo phiếu mới
  const handleNewReceipt = () => {
    setCurrentReceipt(null);
    setSelectedReceiptId(null);
    setFormSupplierId('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNote('');
    setFormLines([{ food_id: '', quantity: '', unit_price: '' }]);
    setErrorMessage(null);
    setSuccessMessage(null);
    setNetworkWarning(null);
  };

  // Chọn một phiếu từ danh sách để xem lại
  const handleSelectReceipt = (rc: Receipt) => {
    setCurrentReceipt(rc);
    setSelectedReceiptId(rc.id);
    setFormSupplierId(rc.supplier_id);
    setFormDate(rc.date);
    setFormNote(rc.note || '');
    setFormLines(
      rc.lines.map(l => ({
        food_id: l.food_id,
        quantity: l.quantity,
        unit_price: l.unit_price
      }))
    );
    setErrorMessage(null);
    setSuccessMessage(null);
    setNetworkWarning(null);
  };

  // Validate form trước khi lưu nháp
  const validateForm = (): string | null => {
    if (!formSupplierId) return 'Vui lòng chọn Nhà cung cấp.';
    if (!formDate) return 'Vui lòng chọn Ngày nhập.';
    if (formLines.length === 0) return 'Phiếu nhập phải có ít nhất 1 dòng hàng.';

    for (let i = 0; i < formLines.length; i++) {
      const line = formLines[i];
      if (!line.food_id) return `Dòng ${i + 1}: Vui lòng chọn Thực phẩm.`;

      const qty = parseFloat(line.quantity);
      if (isNaN(qty) || qty <= 0) return `Dòng ${i + 1}: Số lượng phải lớn hơn 0.`;

      const price = parseFloat(line.unit_price);
      if (isNaN(price) || price <= 0) return `Dòng ${i + 1}: Đơn giá phải lớn hơn 0.`;
    }

    if (hasDuplicateFood) {
      return 'Không được chọn trùng thực phẩm trong cùng một phiếu nhập.';
    }

    return null;
  };

  // =========================================================================
  // 1. TẠO / LƯU NHÁP (DRAFT)
  // =========================================================================
  const handleSaveDraft = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setNetworkWarning(null);

    const validationErr = validateForm();
    if (validationErr) {
      setErrorMessage(validationErr);
      return;
    }

    setSavingDraft(true);

    const payload = {
      supplier_id: Number(formSupplierId),
      date: formDate,
      note: formNote.trim(),
      lines: formLines.map(l => ({
        food_id: Number(l.food_id),
        quantity: l.quantity.toString().trim(),
        unit_price: l.unit_price.toString().trim()
      }))
    };

    try {
      const response = await fetchApi('/api/receipts/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const savedReceipt: Receipt = await response.json();
        setCurrentReceipt(savedReceipt);
        setSelectedReceiptId(savedReceipt.id);
        setSuccessMessage(`Đã lưu nháp phiếu nhập #RC-${savedReceipt.id} thành công! (Trạng thái: DRAFT - Tồn kho chưa đổi)`);
        loadReceipts();
      } else if (response.status === 404 && isMockMode) {
        // Fallback Mock khi backend chưa có API SF22
        handleSaveDraftMock(payload);
      } else {
        const errData = await response.json().catch(() => null);
        const msg = errData?.error || (errData ? JSON.stringify(errData) : `Lỗi ${response.status}`);
        setErrorMessage(`Lưu nháp thất bại: ${msg}`);
      }
    } catch (err: any) {
      if (isMockMode) {
        handleSaveDraftMock(payload);
      } else {
        setErrorMessage(`Lỗi mạng khi lưu nháp: ${err.message || 'Không thể kết nối máy chủ'}`);
      }
    } finally {
      setSavingDraft(false);
    }
  };

  // Mock lưu nháp theo chuẩn contract SF22
  const handleSaveDraftMock = (payload: any) => {
    const nextId = receiptsList.length > 0 ? Math.max(...receiptsList.map(r => r.id)) + 1 : 1;
    const sup = suppliers.find(s => s.id === payload.supplier_id);

    let totalDec = 0;
    const mappedLines: ReceiptLineServer[] = payload.lines.map((l: any, idx: number) => {
      const f = foods.find(food => food.id === l.food_id);
      const lineTotal = parseFloat(l.quantity) * parseFloat(l.unit_price);
      totalDec += lineTotal;
      return {
        id: idx + 1,
        food_id: l.food_id,
        food_code: f?.code || '',
        food_name: f?.name || `Thực phẩm #${l.food_id}`,
        food_unit: f?.unit || 'kg',
        quantity: l.quantity,
        unit_price: l.unit_price,
        total: lineTotal.toFixed(2)
      };
    });

    const newReceipt: Receipt = {
      id: nextId,
      supplier_id: payload.supplier_id,
      supplier_code: sup?.code || '',
      supplier_name: sup?.name || 'Nhà cung cấp',
      date: payload.date,
      note: payload.note,
      status: 'draft',
      total: totalDec.toFixed(2), // Server tính toán trả về
      lines: mappedLines,
      posted_at: null
    };

    const updatedList = [newReceipt, ...receiptsList];
    setReceiptsList(updatedList);
    localStorage.setItem(LOCAL_RECEIPTS_KEY, JSON.stringify(updatedList));

    setCurrentReceipt(newReceipt);
    setSelectedReceiptId(newReceipt.id);
    setSuccessMessage(`Đã lưu nháp phiếu nhập #RC-${newReceipt.id} thành công! (Mô phỏng UI - Tồn kho chưa đổi)`);
  };

  // =========================================================================
  // 2. CHỐT PHIẾU NHẬP (POST RECEIPT) VỚI XÁC NHẬN
  // =========================================================================
  const handlePostReceipt = async () => {
    if (!currentReceipt || currentReceipt.status !== 'draft') {
      setErrorMessage('Chỉ có thể chốt phiếu nhập ở trạng thái Nháp (DRAFT).');
      return;
    }

    setShowConfirmModal(false);
    setPosting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setNetworkWarning(null);

    const receiptId = currentReceipt.id;

    try {
      const response = await fetchApi(`/api/receipts/${receiptId}/post/`, {
        method: 'POST'
      });

      if (response.ok) {
        const postedReceipt: Receipt = await response.json();
        setCurrentReceipt(postedReceipt);
        setSuccessMessage(`✅ Chốt phiếu nhập #RC-${receiptId} thành công! Tồn kho và giá bình quân đã được cập nhật.`);
        await loadReferenceData(); // Reload lại tồn kho
        await loadReceipts();
      } else if (response.status === 409) {
        setErrorMessage('Xung đột: Phiếu này đã được chốt trước đó hoặc đang được xử lý bởi tiến trình khác (HTTP 409).');
        await checkReceiptStatus(receiptId);
      } else if (response.status === 404 && isMockMode) {
        // Mock chốt phiếu tính bình quân gia quyền theo chuẩn SF20
        handlePostReceiptMock(receiptId);
      } else {
        const errData = await response.json().catch(() => null);
        const msg = errData?.error || `Lỗi chốt phiếu (${response.status})`;
        setErrorMessage(`Lỗi từ máy chủ: ${msg}`);
      }
    } catch (networkErr: any) {
      // Yêu cầu đặc tả: "Lỗi mạng lúc chốt: đọc lại chi tiết phiếu để biết trạng thái; không tự tạo lại phiếu mới."
      setNetworkWarning(`⚠️ Mất kết nối mạng khi gửi lệnh chốt phiếu! Đang đọc lại chi tiết phiếu #RC-${receiptId} từ máy chủ để xác định trạng thái...`);
      await checkReceiptStatus(receiptId);
    } finally {
      setPosting(false);
    }
  };

  // Đọc lại chi tiết phiếu để biết trạng thái khi có sự cố mạng
  const checkReceiptStatus = async (receiptId: number) => {
    setCheckingStatus(true);
    try {
      const res = await fetchApi(`/api/receipts/${receiptId}/`);
      if (res.ok) {
        const detail: Receipt = await res.json();
        setCurrentReceipt(detail);
        if (detail.status === 'posted') {
          setSuccessMessage(`✅ Phiếu #RC-${receiptId} đã được chốt thành công trên máy chủ trước khi gián đoạn mạng.`);
          setNetworkWarning(null);
          loadReferenceData();
        } else {
          setNetworkWarning(`Phiếu #RC-${receiptId} hiện vẫn ở trạng thái Nháp (DRAFT). Bạn có thể bấm 'Chốt phiếu' lại sau khi kiểm tra mạng.`);
        }
      } else {
        setNetworkWarning(`Không thể đọc lại chi tiết phiếu: Máy chủ trả về mã ${res.status}. Vui lòng thử kiểm tra lại trạng thái.`);
      }
    } catch {
      setNetworkWarning(`Không thể kết nối máy chủ để đọc lại phiếu #RC-${receiptId}. Vui lòng bấm nút 'Kiểm tra trạng thái' bên dưới.`);
    } finally {
      setCheckingStatus(false);
    }
  };

  // Mock chốt phiếu cập nhật tồn và giá bình quân theo chuẩn SF20
  const handlePostReceiptMock = (receiptId: number) => {
    if (!currentReceipt) return;

    // Tính bình quân gia quyền cho từng food trong phiếu
    const updatedFoods = [...foods];
    currentReceipt.lines.forEach(line => {
      const foodIdx = updatedFoods.findIndex(f => f.id === line.food_id);
      if (foodIdx !== -1) {
        const currentQty = parseFloat(updatedFoods[foodIdx].quantity || '0');
        const currentAvg = parseFloat(updatedFoods[foodIdx].avg_cost || '0');
        const inQty = parseFloat(line.quantity);
        const inPrice = parseFloat(line.unit_price);

        const newQty = currentQty + inQty;
        const newAvg = ((currentQty * currentAvg) + (inQty * inPrice)) / newQty;

        updatedFoods[foodIdx] = {
          ...updatedFoods[foodIdx],
          quantity: newQty.toFixed(3),
          avg_cost: Math.round(newAvg).toFixed(2)
        };
      }
    });
    setFoods(updatedFoods);

    const postedReceipt: Receipt = {
      ...currentReceipt,
      status: 'posted',
      posted_at: new Date().toISOString()
    };

    const updatedList = receiptsList.map(r => r.id === receiptId ? postedReceipt : r);
    setReceiptsList(updatedList);
    localStorage.setItem(LOCAL_RECEIPTS_KEY, JSON.stringify(updatedList));

    setCurrentReceipt(postedReceipt);
    setSuccessMessage(`✅ Chốt phiếu nhập #RC-${receiptId} thành công! Tồn kho và giá bình quân đã được cập nhật (Mô phỏng UI).`);
  };

  const isFormLocked = currentReceipt?.status === 'posted';

  return (
    <div className="receipt-page">

      {/* Thông báo Thành công & Lỗi & Mạng */}
      {successMessage && (
        <div style={{
          backgroundColor: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#065f46',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px',
          fontWeight: 500
        }}>
          {successMessage}
        </div>
      )}

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
          {currentReceipt && (
            <button
              onClick={() => checkReceiptStatus(currentReceipt.id)}
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

      {refError && (
        <div className="state-box state-error">{refError}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
        {/* ========================================================================= */}
        {/* CỘT TRÁI: FORM LẬP VÀ XEM CHI TIẾT PHIẾU NHẬP */}
        {/* ========================================================================= */}
        <div className="card-container">
          <div className="card-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="card-title">
                  {currentReceipt ? `Phiếu nhập #RC-${currentReceipt.id}` : 'Lập phiếu nhập kho mới'}
                </h2>
                {currentReceipt && (
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: currentReceipt.status === 'posted' ? '#dcfce7' : '#fef3c7',
                    color: currentReceipt.status === 'posted' ? '#15803d' : '#b45309',
                    border: `1px solid ${currentReceipt.status === 'posted' ? '#86efac' : '#fcd34d'}`
                  }}>
                    {currentReceipt.status === 'posted' ? 'ĐÃ CHỐT (POSTED)' : 'BẢN NHÁP (DRAFT)'}
                  </span>
                )}
              </div>
              <p className="card-subtitle">
                {isFormLocked
                  ? '🔒 Phiếu này đã được chốt và ghi vào sổ cái kho. Toàn bộ thông tin chỉ đọc (Read-only).'
                  : currentReceipt
                  ? 'Phiếu đang ở trạng thái Nháp. Tồn kho chưa đổi. Bạn có thể chỉnh sửa rồi bấm Chốt.'
                  : 'Điền thông tin nhà cung cấp, ngày nhập và danh sách thực phẩm cần nhập.'}
              </p>
            </div>

            <button
              onClick={handleNewReceipt}
              className="btn-add"
              style={{ backgroundColor: '#475569' }}
            >
              + Tạo phiếu mới
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
              🔒 Tài khoản của bạn có vai trò <strong>Viewer (Chỉ xem)</strong>. Bạn chỉ có thể xem danh sách và chi tiết phiếu, không thể lưu nháp hay chốt phiếu.
            </div>
          )}

          {/* THÔNG TIN CHUNG: NHÀ CUNG CẤP & NGÀY NHẬP & GHI CHÚ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr',
            gap: '16px',
            marginBottom: '20px',
            backgroundColor: '#f8fafc',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Nhà cung cấp <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={formSupplierId}
                onChange={e => setFormSupplierId(e.target.value ? Number(e.target.value) : '')}
                disabled={isFormLocked || isViewer || savingDraft || posting}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: isFormLocked ? '#f1f5f9' : '#ffffff',
                  fontSize: '13px',
                  color: '#0f172a'
                }}
              >
                <option value="">-- Chọn Nhà cung cấp --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Ngày nhập <span style={{ color: '#dc2626' }}>*</span>
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

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Ghi chú phiếu nhập
              </label>
              <input
                type="text"
                placeholder="Ví dụ: Nhập thực phẩm đầu tuần, đợt 1..."
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

          {/* CẢNH BÁO CHỌN TRÙNG THỰC PHẨM TRÊN GIAO DIỆN (AC09 / RULE) */}
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
              <span>Có thực phẩm được chọn lặp lại ở nhiều dòng! Mỗi thực phẩm chỉ được xuất hiện 1 lần trong phiếu nhập.</span>
            </div>
          )}

          {/* BẢNG CÁC DÒNG HÀNG (RECEIPT LINES) */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                Danh sách mặt hàng nhập ({formLines.length} dòng)
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
                  + Thêm dòng thực phẩm
                </button>
              )}
            </div>

            <table className="custom-table" style={{ marginTop: '0' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9' }}>
                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                  <th>Thực phẩm / Nguyên liệu <span style={{ color: '#dc2626' }}>*</span></th>
                  <th style={{ width: '90px' }}>Đơn vị</th>
                  <th style={{ width: '130px' }}>Số lượng <span style={{ color: '#dc2626' }}>*</span></th>
                  <th style={{ width: '150px' }}>Đơn giá (VNĐ) <span style={{ color: '#dc2626' }}>*</span></th>
                  <th style={{ width: '150px', textAlign: 'right' }}>Thành tiền</th>
                  {!isFormLocked && !isViewer && <th style={{ width: '60px', textAlign: 'center' }}>Xóa</th>}
                </tr>
              </thead>
              <tbody>
                {formLines.map((line, idx) => {
                  const selectedFood = foods.find(f => f.id === line.food_id);
                  const isDuplicated = line.food_id !== '' && duplicateFoodIds.includes(line.food_id as number);
                  const qtyNum = parseFloat(line.quantity) || 0;
                  const priceNum = parseFloat(line.unit_price) || 0;
                  const lineTotal = qtyNum * priceNum;

                  return (
                    <tr key={idx} style={{ backgroundColor: isDuplicated ? '#fff1f2' : 'transparent' }}>
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
                            // Cấm chọn trùng: Nếu food đã được chọn ở dòng khác thì đánh dấu hoặc disable
                            const isChosenElsewhere = formLines.some(
                              (other, otherIdx) => otherIdx !== idx && other.food_id === f.id
                            );
                            return (
                              <option
                                key={f.id}
                                value={f.id}
                                disabled={isChosenElsewhere}
                              >
                                {f.code} - {f.name} {isChosenElsewhere ? '(Đã chọn ở dòng khác)' : `(Tồn: ${f.quantity || 0} ${f.unit})`}
                              </option>
                            );
                          })}
                        </select>
                        {isDuplicated && (
                          <div style={{ color: '#dc2626', fontSize: '11px', marginTop: '3px' }}>
                            ⚠️ Thực phẩm bị chọn trùng!
                          </div>
                        )}
                      </td>

                      {/* Đơn vị tính */}
                      <td style={{ color: '#475569', fontSize: '13px' }}>
                        {selectedFood?.unit || '-'}
                      </td>

                      {/* Số lượng */}
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
                            border: '1px solid #cbd5e1',
                            fontSize: '13px',
                            backgroundColor: isFormLocked ? '#f1f5f9' : '#ffffff'
                          }}
                        />
                      </td>

                      {/* Đơn giá nhập */}
                      <td>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          placeholder="0"
                          value={line.unit_price}
                          onChange={e => handleLineChange(idx, 'unit_price', e.target.value)}
                          disabled={isFormLocked || isViewer || savingDraft || posting}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            fontSize: '13px',
                            backgroundColor: isFormLocked ? '#f1f5f9' : '#ffffff'
                          }}
                        />
                      </td>

                      {/* Thành tiền */}
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                        {currentReceipt?.lines[idx]?.total
                          ? formatVND(currentReceipt.lines[idx].total)
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

          {/* TỔNG TIỀN PHIẾU NHẬP DO SERVER TRẢ (ĐIỀU KIỆN ĐẠT CỦA TASK) */}
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
                Tổng giá trị phiếu nhập:
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {currentReceipt
                  ? '(*) Giá trị chính thức do máy chủ phản hồi (Server-calculated total)'
                  : '(*) Tạm tính trên giao diện — Tổng chính thức sẽ do máy chủ xác nhận khi lưu nháp'}
              </div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669' }}>
              {currentReceipt?.total ? formatVND(currentReceipt.total) : formatVND(
                formLines.reduce((acc, l) => acc + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0)
              )}
            </div>
          </div>

          {/* CÁC NÚT HÀNH ĐỘNG: LƯU NHÁP & CHỐT PHIẾU */}
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
                {savingDraft ? '⏳ Đang lưu nháp...' : '💾 Lưu nháp (Create Draft)'}
              </button>
            )}

            {/* NÚT CHỐT CÓ XÁC NHẬN (POST RECEIPT) */}
            {!isViewer && currentReceipt && currentReceipt.status === 'draft' && (
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={posting || savingDraft}
                style={{
                  backgroundColor: posting ? '#9ca3af' : '#dc2626',
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
                {posting ? '🔒 Đang chốt phiếu...' : '🔒 Chốt phiếu nhập (Post Receipt)'}
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
                ✅ Phiếu đã chốt lúc: {currentReceipt?.posted_at ? new Date(currentReceipt.posted_at).toLocaleString('vi-VN') : 'Đã chốt'}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CỘT PHẢI: BẢN ĐÃ LƯU & DANH SÁCH LỊCH SỬ PHIẾU NHẬP */}
        {/* ========================================================================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* THẺ TỒN KHO THAM KHẢO NHANH */}
          <div className="card-container" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: '#0f172a' }}>
              📦 Tồn kho hiện tại (Foods)
            </h3>
            <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '12px' }}>
              {foods.map(f => (
                <div key={f.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid #f1f5f9'
                }}>
                  <span style={{ fontWeight: 500, color: '#334155' }}>{f.name}</span>
                  <span style={{ fontWeight: 700, color: '#059669' }}>
                    {formatQty(f.quantity, f.unit)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* DANH SÁCH PHIẾU NHẬP ĐÃ LẬP */}
          <div className="card-container" style={{ padding: '20px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                📋 Lịch sử phiếu nhập
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {receiptsList.length} phiếu
              </span>
            </div>

            {receiptsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '13px' }}>
                Chưa có phiếu nhập nào được lập.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '450px', overflowY: 'auto' }}>
                {receiptsList.map(rc => {
                  const isSelected = selectedReceiptId === rc.id;
                  const isPosted = rc.status === 'posted';

                  return (
                    <div
                      key={rc.id}
                      onClick={() => handleSelectReceipt(rc)}
                      style={{
                        padding: '12px',
                        borderRadius: '6px',
                        border: isSelected ? '2px solid #059669' : '1px solid #e2e8f0',
                        backgroundColor: isSelected ? '#f0fdf4' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                          #RC-{rc.id}
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
                        {rc.date} • {rc.supplier_name || `NCC #${rc.supplier_id}`}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: '#64748b' }}>{rc.lines.length} mặt hàng</span>
                        <span style={{ fontWeight: 700, color: '#059669' }}>
                          {formatVND(rc.total)}
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
      {/* MODAL XÁC NHẬN CHỐT PHIẾU NHẬP (CONFIRM MODAL) */}
      {/* ========================================================================= */}
      {showConfirmModal && currentReceipt && (
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
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                ⚠️
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                Xác nhận chốt phiếu nhập #RC-{currentReceipt.id}
              </h3>
            </div>

            <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6, marginBottom: '20px' }}>
              <p style={{ marginBottom: '8px' }}>
                Bạn có chắc chắn muốn chốt phiếu nhập này không?
              </p>
              <div style={{
                backgroundColor: '#f8fafc',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '13px',
                border: '1px solid #e2e8f0',
                marginBottom: '12px'
              }}>
                <div><strong>Ngày nhập:</strong> {currentReceipt.date}</div>
                <div><strong>Số lượng mặt hàng:</strong> {currentReceipt.lines.length} loại</div>
                <div><strong>Tổng tiền thanh toán:</strong> {formatVND(currentReceipt.total)}</div>
              </div>
              <p style={{ color: '#dc2626', fontWeight: 600 }}>
                ⚠️ Lưu ý quan trọng: Sau khi chốt:
              </p>
              <ul style={{ paddingLeft: '20px', color: '#64748b', fontSize: '13px' }}>
                <li>Số lượng tồn kho sẽ được cộng thêm ngay lập tức.</li>
                <li>Đơn giá bình quân gia quyền của thực phẩm sẽ được tính lại.</li>
                <li>Phiếu nhập sẽ bị KHÓA VĨNH VIỄN không thể chỉnh sửa hay hủy bỏ.</li>
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
                onClick={handlePostReceipt}
                disabled={posting}
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: posting ? 'not-allowed' : 'pointer'
                }}
              >
                {posting ? 'Đang chốt...' : 'Xác nhận Chốt phiếu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptPage;
