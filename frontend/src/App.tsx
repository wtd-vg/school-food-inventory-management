import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/layout/AppShell';
import { Skeleton } from './components/ui';
import { LoginPage } from './features/auth/LoginPage';
import { NotFoundPage } from './features/common/Pages';
import { InventoryLayout } from './features/inventory/InventoryLayout';
import { CatalogPage } from './features/inventory/CatalogPage';
import { IssuesPage } from './features/inventory/IssuesPage';
import { ReceiptsPage } from './features/inventory/ReceiptsPage';
import { StockPage } from './features/inventory/StockPage';
import { StocktakePage } from './features/inventory/StocktakePage';
import { ReportsPage } from './features/reports/ReportsPage';
import { ClassesPage } from './features/classes/ClassesPage';
import { DishesPage } from './features/dishes/DishesPage';
import { SuppliersPage } from './features/suppliers/SuppliersPage';

// Trang kit chỉ có trong bản dev; bản build production loại bỏ hoàn toàn.
const KitPage = import.meta.env.DEV ? lazy(() => import('./features/dev/KitPage')) : null;

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
          <Route index element={<StockPage />} />
          <Route path="phieu-nhap" element={<ReceiptsPage />} />
          <Route path="phieu-xuat" element={<IssuesPage />} />
          <Route path="kiem-ke" element={<StocktakePage />} />
          <Route path="danh-muc" element={<CatalogPage />} />
        </Route>
        <Route path="mon-an" element={<DishesPage />} />
        <Route path="lop-hoc" element={<ClassesPage />} />
        <Route path="nha-cung-cap/:id?" element={<SuppliersPage />} />
        <Route path="bao-cao" element={<ReportsPage />} />
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
