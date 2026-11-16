import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'

type Kind = 'success' | 'error'
interface Toast { id: number; kind: Kind; message: string }
interface ToastApi { success: (m: string) => void; error: (m: string) => void }

const Ctx = createContext<ToastApi | null>(null)
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), [])
  const push = useCallback((kind: Kind, message: string) => {
    const id = nextId++
    setToasts(t => [...t, { id, kind, message }])
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500)
  }, [dismiss])
  const api = useMemo<ToastApi>(() => ({ success: m => push('success', m), error: m => push('error', m) }), [push])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex animate-fade-in items-start gap-3 rounded-lg border bg-surface p-3 shadow-lg">
            {t.kind === 'success'
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-good" />
              : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-bad" />}
            <p className="flex-1 text-sm">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
