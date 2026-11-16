import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ShieldCheck, Warehouse, ShoppingCart, BarChart3 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Form'
import { homeFor } from '../components/ProtectedRoute'

const DEMO = [
  { role: 'Admin', username: 'admin', password: 'Admin@12345' },
  { role: 'Manager', username: 'manager', password: 'Manager@12345' },
  { role: 'Cashier', username: 'cashier', password: 'Cashier@12345' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) { setError('Enter your username and password.'); return }
    setBusy(true)
    try {
      const user = await login(username.trim(), password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(user.mustChangePassword ? '/change-password' : from && from !== '/login' ? from : homeFor(user.role), { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in right now.')
    } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-side p-12 text-slate-300 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden><rect width="32" height="32" rx="8" fill="rgb(var(--accent))" /><path d="M9 21.5 16 8l7 13.5-7-3z" fill="rgb(var(--accent-ink))" /></svg>
          <span className="text-xl font-semibold tracking-tight text-white">StockPilot</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight text-white">Smarter inventory.<br />Better business decisions.</h2>
          <ul className="mt-8 space-y-4 text-sm">
            {[[Warehouse, 'Every unit accounted for: stock moves are recorded and auditable.'],
              [ShoppingCart, 'A fast point of sale that keeps stock and payments consistent.'],
              [BarChart3, 'Revenue, cost of goods and gross profit, kept separate and honest.'],
              [ShieldCheck, 'Role-based access with a full audit trail.']].map(([Icon, text], i) => {
              const I = Icon as typeof Warehouse
              return <li key={i} className="flex items-start gap-3"><I className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span>{text as string}</span></li>
            })}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Demo environment - sample data only.</p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Welcome back. Enter your credentials to continue.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {error && <div role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
            <Input label="Username" autoComplete="username" autoFocus value={username} onChange={e => setUsername(e.target.value)} />
            <div className="relative">
              <Input label="Password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-[34px] rounded p-1 text-muted hover:text-ink">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            <Button type="submit" variant="primary" loading={busy} className="w-full">Sign in</Button>
          </form>

          <div className="mt-8 rounded-xl border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Demo accounts</p>
            <ul className="mt-3 space-y-2">
              {DEMO.map(d => (
                <li key={d.username} className="flex items-center justify-between text-sm">
                  <span><span className="font-medium">{d.role}</span> <span className="font-mono text-xs text-muted">{d.username}</span></span>
                  <button type="button" className="text-accent hover:underline" onClick={() => { setUsername(d.username); setPassword(d.password); setError(null) }}>Fill</button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Only works when the backend was started with the demo seed data.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
