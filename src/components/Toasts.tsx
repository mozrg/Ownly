import { useUI } from '../state/ui'
import { IconHeartFilled, IconInfo } from './Icons'

export function Toasts() {
  const toasts = useUI((state) => state.toasts)
  const dismiss = useUI((state) => state.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast${toast.tone === 'like' ? ' is-like' : ''}`} onClick={() => dismiss(toast.id)}>
          {toast.tone === 'like' ? <IconHeartFilled size={15} /> : <IconInfo size={15} />}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
