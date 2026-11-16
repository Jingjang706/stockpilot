import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setApiHandlers, tokenStore } from '../lib/api'
import type { LoginResponse, Role, UserSummary } from '../lib/types'

interface AuthState {
  user: UserSummary | null
  loading: boolean
  login: (username: string, password: string) => Promise<UserSummary>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null)
  const [loading, setLoading] = useState<boolean>(!!tokenStore.get())

  const clear = useCallback(() => { tokenStore.clear(); setUser(null) }, [])

  const refresh = useCallback(async () => {
    setUser(await api.get<UserSummary>('/api/auth/me'))
  }, [])

  useEffect(() => {
    setApiHandlers({
      onUnauthorized: clear,
      onPasswordChangeRequired: () => setUser(u => (u ? { ...u, mustChangePassword: true } : u)),
    })
    if (tokenStore.get()) {
      refresh().catch(clear).finally(() => setLoading(false))
    }
  }, [clear, refresh])

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<LoginResponse>('/api/auth/login', { username, password })
    tokenStore.set(res.token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout') } catch { /* token may already be invalid */ }
    clear()
  }, [clear])

  const value = useMemo<AuthState>(() => ({
    user, loading, login, logout, refresh,
    hasRole: (...roles) => !!user && roles.includes(user.role),
  }), [user, loading, login, logout, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
