import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import type { Role, UserSummary } from '../lib/types'

let currentUser: UserSummary | null = null
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: currentUser }) }))

const user = (role: Role, mustChangePassword = false): UserSummary => ({ id: 1, username: 'u', fullName: 'U', email: 'u@x', role, mustChangePassword })

function renderAt(path: string, roles?: Role[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/forbidden" element={<div>forbidden page</div>} />
        <Route path="/change-password" element={<div>change password page</div>} />
        <Route path="/pos" element={<div>pos page</div>} />
        <Route path="/admin" element={<ProtectedRoute roles={roles}><div>secret admin page</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('sends anonymous visitors to the login page', () => {
    currentUser = null
    renderAt('/admin', ['ADMIN'])
    expect(screen.getByText('login page')).toBeInTheDocument()
  })
  it('shows the page to a user with an allowed role', () => {
    currentUser = user('ADMIN')
    renderAt('/admin', ['ADMIN'])
    expect(screen.getByText('secret admin page')).toBeInTheDocument()
  })
  it('blocks a cashier from an admin-only page', () => {
    currentUser = user('CASHIER')
    renderAt('/admin', ['ADMIN'])
    expect(screen.getByText('forbidden page')).toBeInTheDocument()
    expect(screen.queryByText('secret admin page')).not.toBeInTheDocument()
  })
  it('forces users with a temporary password to change it first', () => {
    currentUser = user('ADMIN', true)
    renderAt('/admin', ['ADMIN'])
    expect(screen.getByText('change password page')).toBeInTheDocument()
  })
})
