import React, { useState, useEffect, useMemo } from 'react';
import { fetchApi } from './utils/api';

export interface StockItem {
  id: number;
  code: string;
  name: string;
  category_name?: string;
  unit: string;
  quantity: string;
  avg_cost: string;
  stock_value: string; // Kết quả tiền do backend tính sẵn
  transaction_count: number;
}

export interface LedgerItem {
  id: number;
  food_id: number;
  transaction_type: string;
  quantity_change: string; // quantity_delta
  cost: string;
  reference: string;
  created_at: string;
}

interface ReportPageProps {
  isViewer?: boolean;
}

export const ReportPage: React.FC<ReportPageProps> = ({ isViewer = false }) => {
  // State Báo cáo tồn kho (Stock)
  const [stockList, setStockList] = useState<StockItem[]>([]);
  const [loadingStock, setLoadingStock] = useState<boolean>(true);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockSearch, setStockSearch] = useState<string>('');

  // State Lịch sử giao dịch kho (Ledger)
  const [ledgerList, setLedgerList] = useState<LedgerItem[]>([]);
  const [loadingLedger, setLoadingLedger] = useState<boolean>(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // Bộ lọc Ledger
  const [selectedFood, setSelectedFood] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Map food_id sang { name, code, unit } để hiển thị đẹp trong ledger
  const foodMap = useMemo(() => {
    const map = new Map<number, { name: string; code: string; unit: string }>();
    stockList.forEach((item) => {
      map.set(item.id, { name: item.name, code: item.code, unit: item.unit });
    });
    return map;
  }, [stockList]);

  // Format số tiền VND sử dụng kết quả backend tính (không tự tính toán phép nhân ở frontend)
  const formatCurrency = (val: string | number) => {
    const num = Number(val);
    if (isNaN(num)) return val?.toString() || '0 đ';
    return num.toLocaleString('vi-VN') + ' đ';
  };

  // Format số lượng
  const formatQuantity = (val: string | number, unit?: string) => {
    const num = Number(val);
    if (isNaN(num)) return `${val} ${unit || ''}`.trim();
    // Giữ định dạng gọn nếu là số nguyên hoặc thập phân
    const str = num.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
    return unit ? `${str} ${unit}` : str;
  };

  // Format ngày giờ
  const formatDateTime = (isoString: string) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Badge loại giao dịch
  const renderTransactionBadge = (type: string) => {
    const upper = type.toUpperCase();
    if (upper === 'IN' || upper === 'IMPORT' || upper.includes('NHẬP')) {
      return (
        <span style={{
          backgroundColor: '#dcfce7',
          color: '#15803d',
          padding: '3px 8px',
          borderRadius: '4px',
          fontWeight: 600,
          fontSize: '12px',
        }}>
          📥 {type} (Nhập kho)
        </span>
      );
    }
    if (upper === 'OUT' || upper === 'EXPORT' || upper.includes('XUẤT')) {
      return (
        <span style={{
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          padding: '3px 8px',
          borderRadius: '4px',
          fontWeight: 600,
          fontSize: '12px',
        }}>
          📤 {type} (Xuất kho)
        </span>
      );
    }
    if (upper === 'ADJUST' || upper === 'STOCKTAKE' || upper.includes('KIỂM') || upper.includes('ĐIỀU CHỈNH')) {
      return (
        <span style={{
          backgroundColor: '#e0e7ff',
          color: '#4338ca',
          padding: '3px 8px',
          borderRadius: '4px',
          fontWeight: 600,
          fontSize: '12px',
        }}>
          ⚖️ {type} (Kiểm kê)
        </span>
      );
    }
    return (
      <span style={{
        backgroundColor: '#f1f5f9',
        color: '#475569',
        padding: '3px 8px',
        borderRadius: '4px',
        fontWeight: 600,
        fontSize: '12px',
      }}>
        {type}
      </span>
    );
  };

  // 1. Tải dữ liệu Báo cáo Tồn Kho
  const fetchStockReport = async () => {
    setLoadingStock(true);
    setStockError(null);
    try {
      const res = await fetchApi('/api/reports/stock/');
      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi mã lỗi ${res.status}`);
      }
      const data = await res.json();
      setStockList(data.results || []);
    } catch (err: any) {
      setStockError(err.message || 'Không thể tải báo cáo tồn kho');
    } finally {
      setLoadingStock(false);
    }
  };

  // 2. Tải dữ liệu Sổ giao dịch (Ledger) với bộ lọc
  const fetchLedgerReport = async (overrideFood?: string, overrideFrom?: string, overrideTo?: string) => {
    setLoadingLedger(true);
    setLedgerError(null);

    const f = overrideFood !== undefined ? overrideFood : selectedFood;
    const from = overrideFrom !== undefined ? overrideFrom : fromDate;
    const to = overrideTo !== undefined ? overrideTo : toDate;

    const params = new URLSearchParams();
    if (f) params.append('food', f);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    const queryString = params.toString() ? `?${params.toString()}` : '';

    try {
      const res = await fetchApi(`/api/reports/transactions/${queryString}`);
      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi mã lỗi ${res.status}`);
      }
      const data = await res.json();
      setLedgerList(data.results || []);
    } catch (err: any) {
      setLedgerError(err.message || 'Không thể tải dữ liệu sổ giao dịch');
    } finally {
      setLoadingLedger(false);
    }
  };

  useEffect(() => {
    fetchStockReport();
    fetchLedgerReport('', '', '');
  }, []);

  // Xử lý nộp form lọc
  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLedgerReport();
  };

  // Đặt lại bộ lọc
  const handleResetFilter = () => {
    setSelectedFood('');
    setFromDate('');
    setToDate('');
    fetchLedgerReport('', '', '');
  };

  // Lọc nhanh từ danh sách tồn sang ledger
  const handleQuickViewLedger = (foodId: number) => {
    const idStr = foodId.toString();
    setSelectedFood(idStr);
    fetchLedgerReport(idStr, fromDate, toDate);
    // Cuộn xuống khu vực ledger
    const ledgerEl = document.getElementById('ledger-section');
    if (ledgerEl) {
      ledgerEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Tính tổng hợp thống kê từ kết quả backend
  const stockSummary = useMemo(() => {
    const totalItems = stockList.length;
    // Dùng trực tiếp giá trị backend tính cho stock_value
    const totalValue = stockList.reduce((sum, item) => sum + (Number(item.stock_value) || 0), 0);
    const totalQuantity = stockList.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    return { totalItems, totalValue, totalQuantity };
  }, [stockList]);

  // Lọc tìm kiếm theo tên hoặc mã ở bảng stock
  const filteredStockList = useMemo(() => {
    if (!stockSearch.trim()) return stockList;
    const term = stockSearch.toLowerCase().trim();
    return stockList.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.code.toLowerCase().includes(term) ||
        (item.category_name && item.category_name.toLowerCase().includes(term))
    );
  }, [stockList, stockSearch]);

  return (
    <div className="report-page">
      {/* Phân quyền: Cả Admin và Viewer đều xem được báo cáo */}
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
          <span>Bạn đang xem báo cáo với quyền <strong>Viewer (Người xem)</strong>. Dữ liệu đối soát khớp thời gian thực.</span>
        </div>
      )}

      {/* KHỐI 1: BÁO CÁO TỒN KHO HIỆN TẠI */}
      <div className="card-container" style={{ marginBottom: '32px' }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">📊 Báo cáo Tồn kho Thực phẩm</h2>
            <p className="card-subtitle">
              Tổng hợp số lượng tồn, giá vốn bình quân và tổng giá trị kho hàng từ hệ thống kế toán kho
            </p>
          </div>
          <button
            onClick={fetchStockReport}
            disabled={loadingStock}
            style={{
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#334155',
              padding: '8px 14px',
              borderRadius: '6px',
              cursor: loadingStock ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {loadingStock ? '🔄 Đang tải...' : '🔄 Làm mới'}
          </button>
        </div>

        {/* THỐNG KÊ TỔNG QUAN */}
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Tổng số mặt hàng</span>
            <span className="stat-value text-dark">{stockSummary.totalItems}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Tổng khối lượng / Số lượng tồn</span>
            <span className="stat-value text-green">{stockSummary.totalQuantity.toLocaleString('vi-VN')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Tổng giá trị tồn kho (Backend tính)</span>
            <span className="stat-value" style={{ color: '#0284c7' }}>
              {formatCurrency(stockSummary.totalValue)}
            </span>
          </div>
        </div>

        {/* THANH TÌM KIẾM TỒN KHO */}
        <div className="filter-bar">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Tìm theo tên thực phẩm, mã hoặc danh mục..."
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
            />
          </div>
        </div>

        {/* TRẠNG THÁI: LOADING / ERROR / EMPTY / DATA */}
        {loadingStock ? (
          <div className="state-box state-loading">
            ⏳ Đang tải dữ liệu tồn kho từ máy chủ...
          </div>
        ) : stockError ? (
          <div className="state-box state-error">
            <p><strong>Lỗi tải báo cáo tồn kho:</strong> {stockError}</p>
            <button className="btn-retry" onClick={fetchStockReport}>Thử lại</button>
          </div>
        ) : filteredStockList.length === 0 ? (
          <div className="state-box state-empty">
            {stockList.length === 0 ? 'Chưa có thực phẩm nào trong kho.' : 'Không tìm thấy thực phẩm nào khớp với tìm kiếm.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table" id="stock-report-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>MÃ</th>
                  <th>THỰC PHẨM</th>
                  <th>DANH MỤC</th>
                  <th>ĐƠN VỊ</th>
                  <th style={{ textAlign: 'right' }}>SỐ LƯỢNG TỒN</th>
                  <th style={{ textAlign: 'right' }}>GIÁ VỐN BQ</th>
                  <th style={{ textAlign: 'right' }}>GIÁ TRỊ TỒN (BACKEND)</th>
                  <th style={{ textAlign: 'center' }}>SỐ GD</th>
                  <th style={{ textAlign: 'center' }}>THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {filteredStockList.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="code-badge">{item.code}</span>
                    </td>
                    <td>
                      <strong className="cat-name">{item.name}</strong>
                    </td>
                    <td style={{ color: '#64748b' }}>{item.category_name || '-'}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: '#f1f5f9',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}>
                        {item.unit}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                      {formatQuantity(item.quantity, item.unit)}
                    </td>
                    <td style={{ textAlign: 'right', color: '#475569' }}>
                      {formatCurrency(item.avg_cost)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                      {/* Hiển thị trực tiếp stock_value do backend tính */}
                      {formatCurrency(item.stock_value)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        backgroundColor: item.transaction_count > 0 ? '#e0f2fe' : '#f1f5f9',
                        color: item.transaction_count > 0 ? '#0369a1' : '#94a3b8',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600
                      }}>
                        {item.transaction_count}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleQuickViewLedger(item.id)}
                        style={{
                          background: 'none',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          color: '#2563eb',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                        title="Xem lịch sử biến động sổ kho của thực phẩm này"
                      >
                        🔎 Xem sổ kho
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KHỐI 2: SỔ GIAO DỊCH VÀ TRUY VẾT CHỨNG TỪ (LEDGER) */}
      <div className="card-container" id="ledger-section">
        <div className="card-header">
          <div>
            <h2 className="card-title">📜 Sổ Giao Dịch & Truy Vết Chứng Từ (Ledger)</h2>
            <p className="card-subtitle">
              Truy vết chi tiết mọi biến động nhập, xuất, điều chỉnh kiểm kê và mã chứng từ đi kèm
            </p>
          </div>
          <button
            onClick={() => fetchLedgerReport()}
            disabled={loadingLedger}
            style={{
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#334155',
              padding: '8px 14px',
              borderRadius: '6px',
              cursor: loadingLedger ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {loadingLedger ? '🔄 Đang lọc...' : '🔄 Tải lại sổ'}
          </button>
        </div>

        {/* BỘ LỌC SỔ KHO (FOOD + FROM + TO) */}
        <form onSubmit={handleApplyFilter} style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'flex-end',
        }}>
          {/* Lọc theo Thực phẩm */}
          <div style={{ flex: '1 1 220px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
              Mặt hàng thực phẩm:
            </label>
            <select
              value={selectedFood}
              onChange={(e) => setSelectedFood(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                backgroundColor: '#ffffff',
                color: '#1e293b'
              }}
            >
              <option value="">-- Tất cả mặt hàng --</option>
              {stockList.map((f) => (
                <option key={f.id} value={f.id}>
                  [{f.code}] {f.name} ({f.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Lọc Từ ngày (from) */}
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
              Từ ngày (From):
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                backgroundColor: '#ffffff',
                color: '#1e293b'
              }}
            />
          </div>

          {/* Lọc Đến ngày (to) */}
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
              Đến ngày (To):
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                backgroundColor: '#ffffff',
                color: '#1e293b'
              }}
            />
          </div>

          {/* Nút hành động lọc */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              disabled={loadingLedger}
              style={{
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                padding: '9px 18px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: loadingLedger ? 'not-allowed' : 'pointer',
              }}
            >
              🔎 Áp dụng lọc
            </button>
            <button
              type="button"
              onClick={handleResetFilter}
              style={{
                backgroundColor: '#ffffff',
                color: '#475569',
                border: '1px solid #cbd5e1',
                padding: '9px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Đặt lại
            </button>
          </div>
        </form>

        {/* THÔNG TIN BỘ LỌC ĐANG ÁP DỤNG */}
        {(selectedFood || fromDate || toDate) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            fontSize: '12px',
            color: '#64748b'
          }}>
            <span>Đang lọc theo:</span>
            {selectedFood && (
              <span style={{ backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', color: '#1e293b' }}>
                Mặt hàng: <strong>{foodMap.get(Number(selectedFood))?.name || `ID ${selectedFood}`}</strong>
              </span>
            )}
            {fromDate && (
              <span style={{ backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', color: '#1e293b' }}>
                Từ ngày: <strong>{fromDate}</strong>
              </span>
            )}
            {toDate && (
              <span style={{ backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', color: '#1e293b' }}>
                Đến ngày: <strong>{toDate}</strong>
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#0f172a' }}>
              Tìm thấy: {ledgerList.length} giao dịch
            </span>
          </div>
        )}

        {/* TRẠNG THÁI: LOADING / ERROR / EMPTY / DATA */}
        {loadingLedger ? (
          <div className="state-box state-loading">
            ⏳ Đang tải dữ liệu sổ giao dịch...
          </div>
        ) : ledgerError ? (
          <div className="state-box state-error">
            <p><strong>Lỗi tải sổ giao dịch:</strong> {ledgerError}</p>
            <button className="btn-retry" onClick={() => fetchLedgerReport()}>Thử lại</button>
          </div>
        ) : ledgerList.length === 0 ? (
          <div className="state-box state-empty">
            Không tìm thấy bản ghi giao dịch nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table" id="ledger-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>ID</th>
                  <th>THỜI GIAN</th>
                  <th>MẶT HÀNG</th>
                  <th>LOẠI GIAO DỊCH</th>
                  <th style={{ textAlign: 'right' }}>BIẾN ĐỘNG (DELTA)</th>
                  <th style={{ textAlign: 'right' }}>ĐƠN GIÁ</th>
                  <th>MÃ CHỨNG TỪ</th>
                </tr>
              </thead>
              <tbody>
                {ledgerList.map((entry) => {
                  const foodInfo = foodMap.get(entry.food_id);
                  const deltaNum = Number(entry.quantity_change);
                  const isPositive = deltaNum > 0;
                  const isNegative = deltaNum < 0;

                  return (
                    <tr key={entry.id}>
                      <td style={{ color: '#94a3b8', fontSize: '12px' }}>#{entry.id}</td>
                      <td style={{ whiteSpace: 'nowrap', color: '#475569' }}>
                        {formatDateTime(entry.created_at)}
                      </td>
                      <td>
                        {foodInfo ? (
                          <div>
                            <strong className="cat-name">{foodInfo.name}</strong>{' '}
                            <span className="code-badge" style={{ fontSize: '10px' }}>{foodInfo.code}</span>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Mặt hàng #{entry.food_id}</span>
                        )}
                      </td>
                      <td>
                        {renderTransactionBadge(entry.transaction_type)}
                      </td>
                      <td style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: isPositive ? '#16a34a' : isNegative ? '#dc2626' : '#475569'
                      }}>
                        {isPositive ? `+${formatQuantity(entry.quantity_change, foodInfo?.unit)}` : formatQuantity(entry.quantity_change, foodInfo?.unit)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#475569' }}>
                        {formatCurrency(entry.cost)}
                      </td>
                      <td>
                        {entry.reference ? (
                          <span style={{
                            backgroundColor: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#334155'
                          }}>
                            🏷️ {entry.reference}
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>Không có</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPage;
