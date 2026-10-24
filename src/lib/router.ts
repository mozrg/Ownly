/** Minimal hash router with its own back/forward stack. */
import { useEffect, useMemo, useSyncExternalStore } from 'react'

export interface Route {
  path: string
  segments: string[]
  query: URLSearchParams
  full: string
}

interface RouterState {
  current: string
  stack: string[]
  index: number
}

const listeners = new Set<() => void>()

const state: RouterState = {
  current: normalize(window.location.hash),
  stack: [normalize(window.location.hash)],
  index: 0,
}

function normalize(hash: string): string {
  const raw = hash.replace(/^#/, '')
  if (!raw || raw === '/') return '/'
  return raw.startsWith('/') ? raw : `/${raw}`
}

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot() {
  return `${state.current}|${state.index}|${state.stack.length}`
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const next = normalize(to)
  if (next === state.current) return

  if (options.replace) {
    state.stack[state.index] = next
  } else {
    state.stack = state.stack.slice(0, state.index + 1)
    state.stack.push(next)
    state.index = state.stack.length - 1
  }
  state.current = next
  window.location.hash = next === '/' ? '/' : next
  emit()
}

export function goBack() {
  if (state.index <= 0) return
  state.index -= 1
  state.current = state.stack[state.index]
  window.location.hash = state.current
  emit()
}

export function goForward() {
  if (state.index >= state.stack.length - 1) return
  state.index += 1
  state.current = state.stack[state.index]
  window.location.hash = state.current
  emit()
}

export function canGoBack() {
  return state.index > 0
}

export function canGoForward() {
  return state.index < state.stack.length - 1
}

window.addEventListener('hashchange', () => {
  const next = normalize(window.location.hash)
  if (next === state.current) return
  state.stack = state.stack.slice(0, state.index + 1)
  state.stack.push(next)
  state.index = state.stack.length - 1
  state.current = next
  emit()
})

function parse(full: string): Route {
  const [pathname, search = ''] = full.split('?')
  const segments = pathname.split('/').filter(Boolean)
  return {
    path: pathname,
    segments,
    query: new URLSearchParams(search),
    full,
  }
}

export function useRoute(): Route {
  const key = useSyncExternalStore(subscribe, snapshot, snapshot)
  return useMemo(() => parse(key.split('|')[0]), [key])
}

export function useHistoryState() {
  const key = useSyncExternalStore(subscribe, snapshot, snapshot)
  const index = Number(key.split('|')[1])
  const length = Number(key.split('|')[2])
  return { canBack: index > 0, canForward: index < length - 1 }
}

/** Scrolls the main pane to top on navigation. */
export function useScrollReset(key: string) {
  useEffect(() => {
    const pane = document.getElementById('main-scroll')
    if (pane) pane.scrollTo({ top: 0 })
  }, [key])
}

export function hrefFor(path: string): string {
  return `#${path}`
}
