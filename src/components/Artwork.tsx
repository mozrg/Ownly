import { useState } from 'react'
import { cx, hashString, initials } from '../lib/format'
import { BrandMark } from './Icons'

interface ArtworkProps {
  src?: string
  alt: string
  /** Text used for the generated fallback tile. */
  seed?: string
  className?: string
  round?: boolean
  loading?: 'lazy' | 'eager'
}

/**
 * Cover image with a graceful, deterministic fallback: archive.org has items
 * without artwork, and a generated vinyl tile reads better than a grey hole.
 */
export function Artwork({ src, alt, seed, className, round, loading = 'lazy' }: ArtworkProps) {
  const [failed, setFailed] = useState(false)
  const label = seed ?? alt ?? '?'
  const hue = hashString(label) % 360

  if (!src || failed) {
    return (
      <div
        className={cx('art-fallback', className)}
        style={{
          ['--hue' as string]: hue,
          borderRadius: round ? '50%' : undefined,
        }}
        aria-label={alt}
        role="img"
      >
        <BrandMark className="art-fallback__mark" />
        <span className="art-fallback__label">{initials(label)}</span>
      </div>
    )
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      style={round ? { borderRadius: '50%' } : undefined}
    />
  )
}
