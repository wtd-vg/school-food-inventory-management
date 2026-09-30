import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/layout/AppShell';
import { Skeleton } from './components/ui';
import { LoginPage } from './features/auth/LoginPage';
import { ComingSoon, NotFoundPage } from './features/common/Pages';
import { InventoryLayout } from './features/inventory/InventoryLayout';
import { LegacyFrame } from './legacy/LegacyFrame';
import { CategoryPage } from './CategoryPage';
import FoodPage from './FoodPage';
import { ReceiptPage } from './ReceiptPage';
import { IssuePage } from './IssuePage';
import { ReportPage } from './ReportPage';
import { ClassPage } from './ClassPage';
import { RecipePage } from './RecipePage';

// Trang kit chỉ có trong bản dev; bản build production loại bỏ hoàn toàn.
const KitPage = import.meta.env.DEV ? lazy(() => import('./features/dev/KitPage')) : null;

function CatalogLegacy() {
  return (
    <>
      <LegacyFrame page={CategoryPage} />
      <LegacyFrame page={FoodPage} />
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/kho" replace />} />
        <Route path="kho" element={<InventoryLayout />}>
          <Route index element={<LegacyFrame page={ReportPage} />} />
          <Route path="phieu-nhap" element={<LegacyFrame page={ReceiptPage} />} />
          <Route path="phieu-xuat" element={<LegacyFrame page={IssuePage} />} />
          <Route path="kiem-ke" element={<ComingSoon title="Kiểm kê" />} />
          <Route path="danh-muc" element={<CatalogLegacy />} />
        </Route>
        <Route path="mon-an" element={<LegacyFrame page={RecipePage} />} />
        <Route path="lop-hoc" element={<LegacyFrame page={ClassPage} />} />
        <Route path="nha-cung-cap/:id?" element={<ComingSoon title="Nhà cung cấp" />} />
        <Route path="bao-cao" element={<LegacyFrame page={ReportPage} />} />
        {KitPage ? (
          <Route
            path="_kit"
            element={
              <Suspense fallback={<Skeleton />}>
                <KitPage />
              </Suspense>
            }
          />
        ) : null}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
