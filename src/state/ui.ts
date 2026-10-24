/** Ephemeral UI state: panels, overlays, toasts. */
import { create } from 'zustand'

export type RightPanel = 'closed' | 'queue' | 'lyrics' | 'info'

export interface Toast {
  id: number
  message: string
  tone: 'default' | 'like' | 'danger'
}

interface UIState {
  rightPanel: RightPanel
  immersive: boolean
  sidebarCollapsed: boolean
  commandOpen: boolean
  toasts: Toast[]

  setRightPanel: (panel: RightPanel) => void
  toggleRightPanel: (panel: Exclude<RightPanel, 'closed'>) => void
  setImmersive: (value: boolean) => void
  toggleImmersive: () => void
  toggleSidebar: () => void
  setCommandOpen: (value: boolean) => void
  pushToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
}

let toastId = 0

export const useUI = create<UIState>((set, get) => ({
  rightPanel: 'closed',
  immersive: false,
  sidebarCollapsed: false,
  commandOpen: false,
  toasts: [],

  setRightPanel: (rightPanel) => set({ rightPanel }),

  toggleRightPanel: (panel) => set({ rightPanel: get().rightPanel === panel ? 'closed' : panel }),

  setImmersive: (immersive) => set({ immersive }),

  toggleImmersive: () => set({ immersive: !get().immersive }),

  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

  setCommandOpen: (commandOpen) => set({ commandOpen }),

  pushToast: (message, tone = 'default') => {
    const id = ++toastId
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone }] })
    setTimeout(() => {
      set({ toasts: get().toasts.filter((toast) => toast.id !== id) })
    }, 3200)
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}))

export const toast = (message: string, tone: Toast['tone'] = 'default') => useUI.getState().pushToast(message, tone)
