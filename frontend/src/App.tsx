import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout, { ForbiddenPage } from './layout/AppLayout'
import { ProtectedRoute, homeFor } from './components/ProtectedRoute'
import { Spinner } from './components/ui/Display'
const LoginPage = lazy(() => import('./pages/LoginPage'))
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const PosPage = lazy(() => import('./pages/PosPage'))
const SalesPage = lazy(() => import('./pages/SalesPage'))
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'))
const PurchasesPage = lazy(() => import('./pages/PurchasesPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'))
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'))

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner label="Starting StockPilot" />

  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <LoginPage />} />
      <Route path="/change-password" element={user ? <ChangePasswordPage /> : <Navigate to="/login" replace />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<ProtectedRoute roles={['ADMIN', 'MANAGER']} fallbackHome><DashboardPage /></ProtectedRoute>} />
          <Route path="/pos" element={<PosPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/inventory" element={<ProtectedRoute roles={['ADMIN', 'MANAGER']}><InventoryPage /></ProtectedRoute>} />
          <Route path="/suppliers" element={<ProtectedRoute roles={['ADMIN', 'MANAGER']}><SuppliersPage /></ProtectedRoute>} />
          <Route path="/purchases" element={<ProtectedRoute roles={['ADMIN', 'MANAGER']}><PurchasesPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute roles={['ADMIN', 'MANAGER']}><ReportsPage /></ProtectedRoute>} />
          <Route path="/employees" element={<ProtectedRoute roles={['ADMIN']}><EmployeesPage /></ProtectedRoute>} />
          <Route path="/audit-logs" element={<ProtectedRoute roles={['ADMIN']}><AuditLogsPage /></ProtectedRoute>} />
          <Route path="/forbidden" element={<ForbiddenPage />} />
          <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  )
}
