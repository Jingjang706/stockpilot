import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, ClipboardList, History, LayoutDashboard, LogOut, Menu, Moon, PackageSearch, PanelLeftClose,
  PanelLeftOpen, ReceiptText, ShoppingCart, ShieldCheck, Sun, Truck, Users, Warehouse, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Badge } from '../components/ui/Display'
import type { Role } from '../lib/types'

interface NavItem { to: string; label: string; icon: LucideIcon; roles: Role[] }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER'] },
    { to: '/pos', label: 'Point of Sale', icon: ShoppingCart, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  ] },
  { group: 'Catalog', items: [
    { to: '/products', label: 'Products', icon: PackageSearch, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
    { to: '/inventory', label: 'Inventory', icon: Warehouse, roles: ['ADMIN', 'MANAGER'] },
  ] },
  { group: 'Commerce', items: [
    { to: '/sales', label: 'Sales', icon: ReceiptText, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
    { to: '/purchases', label: 'Purchase Orders', icon: ClipboardList, roles: ['ADMIN', 'MANAGER'] },
    { to: '/suppliers', label: 'Suppliers', icon: Truck, roles: ['ADMIN', 'MANAGER'] },
    { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['ADMIN', 'MANAGER'] },
  ] },
  { group: 'Administration', items: [
    { to: '/employees', label: 'Employees', icon: Users, roles: ['ADMIN'] },
    { to: '/audit-logs', label: 'Audit Log', icon: History, roles: ['ADMIN'] },
  ] },
]

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="rgb(var(--accent))" />
        <path d="M9 21.5 16 8l7 13.5-7-3z" fill="rgb(var(--accent-ink))" />
      </svg>
      {!compact && <span className="text-lg font-semibold tracking-tight text-white">StockPilot</span>}
    </div>
  )
}

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('stockpilot-sidebar') === 'collapsed')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  useEffect(() => { localStorage.setItem('stockpilot-sidebar', collapsed ? 'collapsed' : 'open') }, [collapsed])

  const sidebar = (compact: boolean) => (
    <div className="flex h-full flex-col bg-side text-slate-300">
      <div className={`flex h-16 items-center ${compact ? 'justify-center' : 'px-5'}`}><Logo compact={compact} /></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2" aria-label="Main">
        {NAV.map(g => {
          const items = g.items.filter(i => hasRole(...i.roles))
          if (!items.length) return null
          return (
            <div key={g.group}>
              {!compact && <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.group}</p>}
              <ul className="space-y-0.5">
                {items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} end={to === '/'} title={compact ? label : undefined}
                      className={({ isActive }) => `group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition ${compact ? 'justify-center' : ''} ${isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'}`}>
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                      {!compact && <span>{label}</span>}
                      {compact && <span className="sr-only">{label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white lg:flex">
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <><PanelLeftClose className="h-[18px] w-[18px]" /> Collapse</>}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <aside className={`no-print hidden shrink-0 transition-[width] duration-200 lg:block ${collapsed ? 'w-[68px]' : 'w-64'}`}>{sidebar(collapsed)}</aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 animate-fade-in">{sidebar(false)}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-surface px-4 sm:px-6">
          <button className="rounded-lg p-2 text-muted hover:bg-raised lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="hidden text-sm text-muted sm:block">Smarter inventory. Better business decisions.</div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-3 border-l pl-3">
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-medium">{user?.fullName}</p>
                <div className="mt-0.5"><Badge tone="accent">{user?.role}</Badge></div>
              </div>
              <button onClick={async () => { await logout(); navigate('/login') }} aria-label="Sign out"
                className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink"><LogOut className="h-5 w-5" /></button>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] animate-fade-in px-4 py-6 sm:px-6"><Outlet /></div>
        </main>
      </div>
    </div>
  )
}

export function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="mb-4 rounded-full bg-bad/10 p-4 text-bad"><ShieldCheck className="h-8 w-8" /></div>
      <h1 className="text-xl font-semibold">You don't have access to this page</h1>
      <p className="mt-1 text-sm text-muted">Ask an administrator if you need a different role.</p>
    </div>
  )
}
