import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../lib/types'

export const homeFor = (role: Role) => (role === 'CASHIER' ? '/pos' : '/')

interface Props { roles?: Role[]; children?: ReactNode; fallbackHome?: boolean }

/**
 * Route guard. Without `roles` it only requires a signed-in user (used as the layout route).
 * This is a usability layer: the backend independently enforces every permission.
 */
export function ProtectedRoute({ roles, children, fallbackHome }: Props) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (user.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />
  if (roles && !roles.includes(user.role)) {
    return fallbackHome ? <Navigate to={homeFor(user.role)} replace /> : <Navigate to="/forbidden" replace />
  }
  return children ? <>{children}</> : <Outlet />
}
