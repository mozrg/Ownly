import { useCallback, useEffect, useRef, useState } from 'react'
import { clamp, cx } from '../lib/format'

interface SliderProps {
  value: number
  onChange?: (value: number) => void
  onCommit?: (value: number) => void
  formatTooltip?: (value: number) => string
  compact?: boolean
  disabled?: boolean
  ariaLabel: string
  step?: number
}

/** Pointer + keyboard accessible slider used for seek and volume. */
export function Slider({ value, onChange, onCommit, formatTooltip, compact, disabled, ariaLabel, step = 0.01 }: SliderProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [dragValue, setDragValue] = useState(0)
  const [hovering, setHovering] = useState(false)

  const shown = dragging ? dragValue : clamp(value, 0, 1)

  const valueFromEvent = useCallback((clientX: number) => {
    const rail = railRef.current
    if (!rail) return 0
    const rect = rail.getBoundingClientRect()
    return clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1)
  }, [])

  const handlePointerDown = (event: React.PointerEvent) => {
    if (disabled) return
    event.preventDefault()
    const next = valueFromEvent(event.clientX)
    setDragging(true)
    setDragValue(next)
    onChange?.(next)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragging) return
    const next = valueFromEvent(event.clientX)
    setDragValue(next)
    onChange?.(next)
  }

  const finish = (event: React.PointerEvent) => {
    if (!dragging) return
    const next = valueFromEvent(event.clientX)
    setDragging(false)
    onCommit?.(next)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return
    const current = clamp(value, 0, 1)
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + step
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - step
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = 1
    if (next === null) return
    event.preventDefault()
    const clamped = clamp(next, 0, 1)
    onChange?.(clamped)
    onCommit?.(clamped)
  }

  const tooltipValue = dragging ? dragValue : value

  return (
    <div
      className={cx('slider', compact && 'is-compact', dragging && 'is-dragging', disabled && 'is-disabled')}
      style={{ ['--fill' as string]: `${shown * 100}%` }}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onKeyDown={handleKeyDown}
    >
      <div className="slider__rail" ref={railRef}>
        <div className="slider__fill" />
        <div className="slider__thumb" />
      </div>
      {formatTooltip && (hovering || dragging) && <div className="slider__tooltip">{formatTooltip(tooltipValue)}</div>}
    </div>
  )
}

/** Slider whose drag state is committed on release — used for seeking. */
export function SeekSlider({ value, onCommit, formatTooltip, disabled }: Omit<SliderProps, 'onChange'>) {
  const [preview, setPreview] = useState<number | null>(null)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  useEffect(() => {
    if (preview === null) return
    const timer = setTimeout(() => setPreview(null), 400)
    return () => clearTimeout(timer)
  }, [preview])

  const display = preview ?? value

  return (
    <Slider
      value={display}
      onChange={setPreview}
      onCommit={(next) => {
        setPreview(null)
        commitRef.current?.(next)
      }}
      formatTooltip={formatTooltip}
      disabled={disabled}
      ariaLabel="Позиция воспроизведения"
      step={0.005}
    />
  )
}
