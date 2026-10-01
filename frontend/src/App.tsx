import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequirePermission } from './auth/RequirePermission';
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
import { AuditPage } from './features/audit/AuditPage';
import { MealCountsPage } from './features/meals/MealCountsPage';
import { MenusPage } from './features/menus/MenusPage';
import { NotificationsPage } from './features/notifications/NotificationsPage';
import { UnsubscribePage } from './features/public/UnsubscribePage';
import { StudentsPage } from './features/students/StudentsPage';
import { UsersPage } from './features/users/UsersPage';
import { DemandPage } from './features/lunch/DemandPage';
import { KitchenIssuePage } from './features/lunch/KitchenIssuePage';
import { OrdersPage } from './features/lunch/OrdersPage';
import { ReceivePage } from './features/lunch/ReceivePage';
import { TodayPage } from './features/lunch/TodayPage';

// Trang kit chỉ có trong bản dev; bản build production loại bỏ hoàn toàn.
const KitPage = import.meta.env.DEV ? lazy(() => import('./features/dev/KitPage')) : null;

export function App() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<LoginPage />} />
      {/* Công khai: phụ huynh huỷ nhận email thực đơn (FE-07), không cần đăng nhập. */}
      <Route path="/huy-nhan/:token" element={<UnsubscribePage />} />
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
        {/* G2 (SF57–SF69): chuỗi một ngày ăn. */}
        <Route path="bua-trua" element={<TodayPage />} />
        <Route path="bua-trua/nhu-cau" element={<DemandPage />} />
        <Route path="bua-trua/don-dat" element={<OrdersPage />} />
        <Route path="bua-trua/nhan-hang" element={<ReceivePage />} />
        <Route path="bua-trua/xuat-bep" element={<KitchenIssuePage />} />
        <Route path="mon-an" element={<DishesPage />} />
        <Route path="mon-an/thuc-don" element={<MenusPage />} />
        <Route path="lop-hoc" element={<ClassesPage />} />
        <Route path="lop-hoc/so-suat" element={<MealCountsPage />} />
        <Route path="lop-hoc/hoc-sinh" element={<StudentsPage />} />
        <Route path="lop-hoc/thu-thuc-don" element={<NotificationsPage />} />
        <Route path="nha-cung-cap/:id?" element={<SuppliersPage />} />
        <Route path="bao-cao" element={<ReportsPage />} />
        <Route
          path="tai-khoan"
          element={
            <RequirePermission need="users">
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="nhat-ky"
          element={
            <RequirePermission need="audit">
              <AuditPage />
            </RequirePermission>
          }
        />
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
