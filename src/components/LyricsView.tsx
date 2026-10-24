import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayer } from '../state/player'
import { getLyrics } from '../lib/lyrics'
import type { Lyrics } from '../lib/types'
import { cx } from '../lib/format'
import { IconMic } from './Icons'

interface LyricsViewProps {
  artist: string
  title: string
  album?: string
  duration?: number
  /** Immersive variant: bigger type, no header. */
  variant?: 'panel' | 'immersive'
}

export function LyricsView({ artist, title, album, duration, variant = 'panel' }: LyricsViewProps) {
  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'none'>('loading')
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setLyrics(null)
    setActiveIndex(-1)

    getLyrics(artist, title, album, duration)
      .then((result) => {
        if (cancelled) return
        setLyrics(result)
        setStatus(result ? 'ready' : 'none')
      })
      .catch(() => {
        if (!cancelled) setStatus('none')
      })

    return () => {
      cancelled = true
    }
  }, [artist, title, album, duration])

  const times = useMemo(() => (lyrics?.synced ? lyrics.lines.map((line) => line.time) : []), [lyrics])

  useEffect(() => {
    if (!lyrics?.synced || times.length === 0) return
    let last = -2
    const compute = (position: number) => {
      let index = -1
      for (let i = 0; i < times.length; i++) {
        if (times[i] <= position + 0.15) index = i
        else break
      }
      if (index !== last) {
        last = index
        setActiveIndex(index)
      }
    }
    compute(usePlayer.getState().position)
    const unsubscribe = usePlayer.subscribe((state) => compute(state.position))
    return unsubscribe
  }, [lyrics, times])

  useEffect(() => {
    if (activeIndex < 0 || !containerRef.current) return
    const node = containerRef.current.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`)
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIndex])

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
        {[88, 72, 94, 64, 80, 56].map((width, index) => (
          <div key={index} className="skeleton" style={{ height: 14, width: `${width}%`, borderRadius: 5 }} />
        ))}
      </div>
    )
  }

  if (status === 'none' || !lyrics) {
    return (
      <div className="empty-state" style={{ padding: '44px 8px' }}>
        <IconMic size={30} />
        <div className="empty-state__title">Текста нет</div>
        <div className="empty-state__text">Для этой записи текст песни пока не найден.</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cx('lyrics', !lyrics.synced && 'is-plain', variant === 'immersive' && 'is-immersive')}>
      {lyrics.lines.map((line, index) => (
        <p
          key={`${line.time}-${index}`}
          data-line={index}
          className={cx(lyrics.synced && index === activeIndex && 'is-active', lyrics.synced && activeIndex >= 0 && index < activeIndex && 'is-past')}
          onClick={() => {
            if (lyrics.synced) usePlayer.getState().seek(line.time)
          }}
        >
          {line.text || '…'}
        </p>
      ))}
      {!lyrics.synced && <div className="lyrics__note">Текст без синхронизации — показан целиком.</div>}
      {lyrics.synced && lyrics.adjusted && (
        <div className="lyrics__note">Тайминги подстроены под эту версию — она длиннее или короче оригинала.</div>
      )}
    </div>
  )
}
