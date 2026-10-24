import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './Icons'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  width?: number
}

export function Modal({ open, onClose, title, description, children, footer, width }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="modal-veil" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div className="modal__title">{title}</div>
            {description && <div className="modal__text">{description}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <IconClose size={16} />
          </button>
        </div>
        {children}
        {footer && <div className="modal__actions">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
