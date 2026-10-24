import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import type { ReactNode } from 'react'

export interface MenuItem {
  id: string
  label?: string
  icon?: ReactNode
  onSelect?: () => void
  danger?: boolean
  checked?: boolean
  separator?: boolean
  heading?: boolean
}

interface MenuStore {
  anchor: { x: number; y: number } | null
  items: MenuItem[]
  openAt: (x: number, y: number, items: MenuItem[]) => void
  close: () => void
}

const useMenuStore = create<MenuStore>((set) => ({
  anchor: null,
  items: [],
  openAt: (x, y, items) => set({ anchor: { x, y }, items }),
  close: () => set({ anchor: null, items: [] }),
}))

export function openMenu(event: { clientX: number; clientY: number }, items: MenuItem[]) {
  useMenuStore.getState().openAt(event.clientX, event.clientY, items)
}

export function closeMenu() {
  useMenuStore.getState().close()
}

export function MenuHost() {
  const anchor = useMenuStore((state) => state.anchor)
  const items = useMenuStore((state) => state.items)
  const close = useMenuStore((state) => state.close)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!anchor) return
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const x = Math.min(anchor.x, window.innerWidth - rect.width - 10)
    const y = Math.min(anchor.y, window.innerHeight - rect.height - 10)
    setPosition({ x: Math.max(10, x), y: Math.max(10, y) })
  }, [anchor])

  useEffect(() => {
    if (!anchor) return
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [anchor, close])

  if (!anchor) return null

  return createPortal(
    <div className="menu" ref={ref} style={{ left: position.x, top: position.y }} role="menu">
      {items.map((item) => {
        if (item.separator) return <div key={item.id} className="menu__sep" />
        if (item.heading) return <div key={item.id} className="menu__label">{item.label}</div>
        return (
          <button
            key={item.id}
            role="menuitem"
            className={`menu__item${item.danger ? ' is-danger' : ''}${item.checked ? ' is-checked' : ''}`}
            onClick={() => {
              close()
              item.onSelect?.()
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

/** Convenience: turns a button's click into a menu anchored under it. */
export function openMenuAtElement(element: HTMLElement, items: MenuItem[], align: 'left' | 'right' = 'left') {
  const rect = element.getBoundingClientRect()
  const x = align === 'right' ? rect.right - 216 : rect.left
  useMenuStore.getState().openAt(x, rect.bottom + 6, items)
}
