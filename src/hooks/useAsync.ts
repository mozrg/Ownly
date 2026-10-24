import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Runs an async task and tracks loading/error state, ignoring stale results.
 * `deps` behaves like a dependency array; `enabled: false` keeps it idle.
 */
export function useAsync<T>(
  task: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean; initial?: T | null } = {},
) {
  const { enabled = true, initial = null } = options
  const [state, setState] = useState<AsyncState<T>>({ data: initial, loading: enabled, error: null })
  const [nonce, setNonce] = useState(0)
  const taskRef = useRef(task)
  taskRef.current = task
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setState({ data: initial, loading: false, error: null })
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))

    taskRef
      .current(controller.signal)
      .then((data) => {
        if (cancelled) return
        setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Что-то пошло не так'
        setState((prev) => ({ data: prev.data, loading: false, error: message }))
      })

    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return { ...state, reload }
}

/** Debounces a value — used by the search field. */
export function useDebounced<T>(value: T, delay = 320): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
