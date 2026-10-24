import type { ReactNode } from 'react'
import { cx } from '../lib/format'
import { IconChevronRight } from './Icons'

interface SectionProps {
  title: ReactNode
  eyebrow?: string
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function Section({ title, eyebrow, subtitle, action, children, className }: SectionProps) {
  return (
    <section className={cx('section', className)}>
      <div className="section__head">
        <div className="section__titles">
          {eyebrow && <div className="section__eyebrow">{eyebrow}</div>}
          <h2 className="section__title">{title}</h2>
          {subtitle && <div className="section__subtitle">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function SectionLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="section__link" onClick={onClick}>
      {label}
      <IconChevronRight size={13} style={{ marginLeft: 4, verticalAlign: '-2px' }} />
    </button>
  )
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon}
      <div className="empty-state__title">{title}</div>
      {text && <div className="empty-state__text">{text}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  )
}

export function CardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="card-grid">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card" style={{ pointerEvents: 'none' }}>
          <div className="skeleton card__art" />
          <div className="skeleton" style={{ height: 12, width: '76%', borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 10, width: '52%', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}

export function RowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="tracklist">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="track-row" style={{ pointerEvents: 'none' }}>
          <div className="track-row__index">
            <div className="skeleton" style={{ width: 14, height: 10, borderRadius: 3 }} />
          </div>
          <div className="track-row__main">
            <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 5 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton" style={{ height: 11, width: '48%', borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 9, width: '30%', borderRadius: 4 }} />
            </div>
          </div>
          <div className="skeleton" style={{ height: 10, width: '62%', borderRadius: 4 }} />
          <div />
          <div />
        </div>
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      title="Не удалось загрузить"
      text={message}
      action={
        <button className="btn btn--secondary btn--sm" onClick={onRetry}>
          Попробовать снова
        </button>
      }
    />
  )
}
