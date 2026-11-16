import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

/** Runs an async loader whenever deps change; ignores out-of-order responses. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = useCallback(() => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    loaderRef.current()
      .then(d => { if (id === seq.current) setData(d) })
      .catch(e => { if (id === seq.current) setError(e instanceof ApiError ? e.message : 'Something went wrong') })
      .finally(() => { if (id === seq.current) setLoading(false) })
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps)
  return { data, error, loading, reload: run }
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}
