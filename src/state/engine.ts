/** Single shared audio element + lightweight helpers around it. */

export const audio = new Audio()

audio.preload = 'auto'
audio.crossOrigin = null

// The element lives outside the DOM, so expose it for debugging and for the
// playback audit harness.
declare global {
  interface Window {
    __ownlyAudio?: HTMLAudioElement
  }
}
if (typeof window !== 'undefined') window.__ownlyAudio = audio

/**
 * One element is enough for warming: it is reused for every track, so hunting
 * through a list does not leave a trail of detached media elements holding
 * connections open.
 */
let prefetch: HTMLAudioElement | null = null

function prefetchElement(): HTMLAudioElement {
  if (!prefetch) {
    prefetch = new Audio()
    prefetch.preload = 'metadata'
  }
  return prefetch
}

/** Warms the connection for the next track so the transition feels instant. */
export function prefetchUrl(url: string) {
  if (!url) return
  try {
    const element = prefetchElement()
    if (element.src === url) return
    element.pause()
    element.src = url
    element.load()
  } catch {
    /* not critical */
  }
}

export function clearPrefetch() {
  if (!prefetch) return
  prefetch.removeAttribute('src')
  prefetch.load()
}

export function supportsMediaSession(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

/** Rough loudness curve for a perceptually linear volume slider. */
export function volumeToGain(volume: number): number {
  return Math.pow(Math.max(0, Math.min(1, volume)), 1.7)
}
