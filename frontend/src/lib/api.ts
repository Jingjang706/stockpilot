const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '')
const TOKEN_KEY = 'stockpilot-token'

export class ApiError extends Error {
  status: number
  code?: string
  fieldErrors?: Record<string, string>
  constructor(status: number, message: string, code?: string, fieldErrors?: Record<string, string>) {
    super(message)
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

// The token lives in sessionStorage: it disappears when the tab is closed.
export const tokenStore = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t) } catch { /* ignore */ } },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } },
}

type Handlers = { onUnauthorized?: () => void; onPasswordChangeRequired?: () => void }
const handlers: Handlers = {}
export const setApiHandlers = (h: Handlers) => Object.assign(handlers, h)

type Params = Record<string, string | number | boolean | null | undefined>

function buildUrl(path: string, params?: Params) {
  const url = new URL(BASE + path)
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  })
  return url.toString()
}

async function request<T>(method: string, path: string, opts: { body?: unknown; params?: Params } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.params), {
      method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
  }

  if (res.status === 204) return undefined as T
  let data: unknown = null
  try { data = await res.json() } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    const body = (data ?? {}) as { message?: string; error?: string; fieldErrors?: Record<string, string> }
    if (res.status === 401 && path !== '/api/auth/login') handlers.onUnauthorized?.()
    if (res.status === 403 && body.error === 'PASSWORD_CHANGE_REQUIRED') handlers.onPasswordChangeRequired?.()
    throw new ApiError(res.status, body.message ?? `Request failed (${res.status})`, body.error, body.fieldErrors)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>('GET', path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
  del: <T>(path: string) => request<T>('DELETE', path),
}
