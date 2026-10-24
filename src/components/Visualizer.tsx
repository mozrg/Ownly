import { useEffect, useRef } from 'react'
import { usePlayer } from '../state/player'
import { hashString } from '../lib/format'

interface VisualizerProps {
  seed: string
  bars?: number
  height?: number
  className?: string
}

/**
 * Decorative "spectrum" that reacts to play state and loudness.
 * It is intentionally not a real FFT: analysing cross-origin audio would
 * require CORS-clean streams for every station and can silence playback.
 */
export function Visualizer({ seed, bars = 44, height = 34, className }: VisualizerProps) {
  const isPlaying = usePlayer((state) => state.isPlaying)
  const volume = usePlayer((state) => state.volume)
  const muted = usePlayer((state) => state.muted)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const nodes = Array.from(root.children) as HTMLElement[]
    const base = hashString(seed)
    const amplitude = (muted ? 0 : volume) * 0.85 + 0.15

    if (!isPlaying) {
      for (const node of nodes) node.style.transform = 'scaleY(0.12)'
      return
    }

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / 1000
      for (let i = 0; i < nodes.length; i++) {
        const phase = ((base >> (i % 12)) & 7) / 7
        const speed = 1.4 + phase * 2.6
        const wave =
          Math.sin(t * speed + i * 0.42 + phase * 6.3) * 0.42 +
          Math.sin(t * speed * 0.53 + i * 0.19 + phase * 2.1) * 0.32 +
          Math.sin(t * 0.7 + i * 0.11) * 0.26
        const envelope = 0.55 + 0.45 * Math.sin((i / nodes.length) * Math.PI)
        const level = Math.max(0.1, Math.min(1, (0.5 + wave * 0.5) * envelope * amplitude * 1.5))
        nodes[i].style.transform = `scaleY(${level.toFixed(3)})`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying, volume, muted, seed])

  return (
    <div
      ref={ref}
      className={`visualizer${className ? ` ${className}` : ''}`}
      style={{ height }}
      aria-hidden="true"
    >
      {Array.from({ length: bars }).map((_, index) => (
        <span key={index} style={{ animationDelay: `${index * 30}ms` }} />
      ))}
    </div>
  )
}
