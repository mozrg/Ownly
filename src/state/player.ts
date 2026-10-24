/** Playback engine + queue state. Full tracks only — no previews, ever. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { audio, clearPrefetch, prefetchUrl, supportsMediaSession, volumeToGain } from './engine'
import { forgetStream, isStreamFresh, resolveYoutubeStream } from '../lib/youtube'
import type { QueueItem, RepeatMode } from '../lib/types'
import { shuffleArray } from '../lib/format'

export type PlaybackKind = 'catalog'

export interface PlayContext {
  label?: string
  path?: string
  kind?: PlaybackKind
}

interface PlayerState {
  queue: QueueItem[]
  /** Playback order — indices into `queue`. */
  order: number[]
  /** Position inside `order`. */
  cursor: number
  isPlaying: boolean
  isLoading: boolean
  error: string | null
  position: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  kind: PlaybackKind
  contextLabel: string
  contextPath: string

  playQueue: (tracks: QueueItem[], startIndex?: number, context?: PlayContext) => void
  playTrack: (track: QueueItem, context?: PlayContext) => void
  toggle: () => void
  play: () => void
  pause: () => void
  next: (auto?: boolean) => void
  previous: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  enqueueNext: (items: QueueItem | QueueItem[]) => void
  enqueue: (items: QueueItem | QueueItem[]) => void
  removeFromQueue: (queueIndex: number) => void
  clearQueue: () => void
  jumpToQueueIndex: (queueIndex: number) => void
  retry: () => void
}

function shuffledOrder(length: number, first: number): number[] {
  const rest = Array.from({ length }, (_, index) => index).filter((index) => index !== first)
  return [first, ...shuffleArray(rest)]
}

function plainOrder(length: number): number[] {
  return Array.from({ length }, (_, index) => index)
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => {
      /* ------------------------------------------------------------ */
      /* internals                                                     */
      /* ------------------------------------------------------------ */

      const currentItem = (): QueueItem | null => {
        const { queue, order, cursor } = get()
        const queueIndex = order[cursor]
        return queueIndex === undefined ? null : (queue[queueIndex] ?? null)
      }

      const syncMediaSession = (item: QueueItem | null) => {
        if (!supportsMediaSession()) return
        if (!item) {
          navigator.mediaSession.metadata = null
          return
        }
        navigator.mediaSession.metadata = new MediaMetadata({
          title: item.title,
          artist: item.artist,
          album: item.album,
          artwork: [
            { src: item.cover, sizes: '512x512', type: 'image/jpeg' },
            { src: item.cover, sizes: '256x256', type: 'image/jpeg' },
          ],
        })
      }

      /** Guards against a slow stream resolve landing after the user skipped. */
      let loadToken = 0
      /** Video ids whose stream URL is already being fetched. */
      const prefetching = new Set<string>()
      /** The one track per playback we already re-resolved after a dead URL. */
      let retriedStreamFor = ''

      const load = async (autoplay = true) => {
        const item = currentItem()
        if (!item) {
          audio.pause()
          audio.removeAttribute('src')
          set({ isPlaying: false, position: 0, duration: 0 })
          return
        }

        const token = ++loadToken

        // Stop the previous track immediately: resolving a stream can take
        // seconds, and the old audio must not keep playing during that time.
        // Detaching the source is deliberately avoided — it forces a full
        // element reset and adds seconds of latency to every track change.
        audio.pause()

        set({ isLoading: true, error: null, position: 0, duration: item.duration || 0, kind: item.kind ?? 'catalog' })
        syncMediaSession(item)
        window.dispatchEvent(new CustomEvent('ownly:trackchange', { detail: item }))

        // Streaming sources need a signed URL fetched at play time. A URL the
        // queue kept from an earlier session has expired with it, so age
        // decides whether the cached value is worth trying at all.
        let url = item.url
        if (item.source === 'youtube') {
          const videoId = item.youtubeId ?? item.id.replace('yt:', '')
          if (url && !isStreamFresh(videoId)) url = ''
          if (!url) {
            try {
              url = await resolveYoutubeStream(videoId)
            } catch (error) {
              if (token !== loadToken) return
              // The raw failure is a process invocation dump — useful in the
              // console, useless (and alarming) in the player.
              console.warn('[ownly] stream resolve failed', error)
              // Some uploads simply refuse extraction. Moving on is friendlier
              // than a dead end the user has to clear by hand.
              const { order, cursor } = get()
              if (cursor + 1 < order.length) {
                set({ isLoading: false })
                window.dispatchEvent(new CustomEvent('ownly:trackfailed', { detail: item }))
                skipBroken()
                return
              }
              set({ isPlaying: false, isLoading: false, error: 'Это видео не удалось загрузить' })
              return
            }
          }
        }
        if (token !== loadToken) return

        if (url && url !== item.url) {
          // Cache the resolved URL on the queue item so replays are instant.
          const { queue, order, cursor } = get()
          const queueIndex = order[cursor]
          if (queueIndex !== undefined && queue[queueIndex]?.id === item.id) {
            const nextQueue = [...queue]
            nextQueue[queueIndex] = { ...nextQueue[queueIndex], url }
            set({ queue: nextQueue })
          }
        }

        if (!url) {
          set({ isPlaying: false, isLoading: false, error: 'Источник недоступен' })
          return
        }

        audio.src = url
        audio.load()
        audio.volume = volumeToGain(get().muted ? 0 : get().volume)

        if (autoplay) {
          const promise = audio.play()
          if (promise) {
            promise.catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error)
              if (/abort/i.test(message)) return
              // A rejected play() is usually a dead source.
              set({ isPlaying: false, isLoading: false, error: 'Не удалось начать воспроизведение' })
            })
          }
        }

        const upcoming = get().queue[get().order[get().cursor + 1] ?? -1]
        if (upcoming && (upcoming.kind ?? 'catalog') === 'catalog') {
          if (upcoming.source === 'youtube' && !upcoming.url) {
            // Resolving a YouTube stream can take tens of seconds. Start now,
            // while the current track plays, so the switch feels instant.
            prefetchYoutube(upcoming)
          } else if (upcoming.url) {
            prefetchUrl(upcoming.url)
          } else {
            clearPrefetch()
          }
        } else {
          clearPrefetch()
        }

        // Warm the next track only. Resolving several at once makes the
        // network-bound yt-dlp calls contend and slows every one of them.
        scheduleAhead(1)
      }

      /** Prefetches the next few YouTube tracks. */
      const scheduleAhead = (count: number) => {
        const { queue, order, cursor } = get()
        for (let offset = 1; offset <= count; offset++) {
          const item = queue[order[cursor + offset] ?? -1]
          if (!item || item.source !== 'youtube' || item.url) continue
          prefetchYoutube(item)
        }
      }

      /** Warms the stream URL for a future queue item without blocking. */
      const prefetchYoutube = (item: QueueItem) => {
        const videoId = item.youtubeId ?? item.id.replace('yt:', '')
        if (!videoId || prefetching.has(videoId)) return
        prefetching.add(videoId)
        resolveYoutubeStream(videoId)
          .then((url) => {
            const { queue } = get()
            const index = queue.findIndex((entry) => entry.id === item.id)
            if (index === -1) return
            const nextQueue = [...queue]
            nextQueue[index] = { ...nextQueue[index], url }
            set({ queue: nextQueue })
          })
          .catch(() => undefined)
          .finally(() => prefetching.delete(videoId))
      }

      /** Moves on to the following track, skipping ones that already failed. */
      const skipBroken = () => {
        const { order, cursor } = get()
        if (cursor + 1 >= order.length) {
          set({ isPlaying: false, isLoading: false })
          return
        }
        set({ cursor: cursor + 1 })
        load(true)
      }

      const advance = (direction: 1 | -1, auto = false) => {
        const { order, cursor, repeat } = get()
        if (order.length === 0) return

        if (auto && repeat === 'one') {
          audio.currentTime = 0
          void audio.play()
          return
        }

        const nextCursor = cursor + direction
        if (nextCursor >= order.length) {
          if (repeat === 'all' || !auto) {
            set({ cursor: 0 })
            load(true)
          } else {
            set({ isPlaying: false, position: 0 })
            audio.pause()
            audio.currentTime = 0
          }
          return
        }
        if (nextCursor < 0) {
          set({ cursor: 0 })
          load(true)
          return
        }
        set({ cursor: nextCursor })
        load(true)
      }

      /* ------------------------------------------------------------ */
      /* audio element wiring                                          */
      /* ------------------------------------------------------------ */

      audio.addEventListener('play', () => set({ isPlaying: true, error: null }))
      audio.addEventListener('playing', () => {
        retriedStreamFor = ''
        set({ isPlaying: true, isLoading: false, error: null })
      })
      audio.addEventListener('pause', () => set({ isPlaying: false }))
      audio.addEventListener('waiting', () => set({ isLoading: true }))
      audio.addEventListener('canplay', () => set({ isLoading: false }))
      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) set({ duration: audio.duration })
      })
      audio.addEventListener('ended', () => get().next(true))
      audio.addEventListener('error', () => {
        if (!audio.getAttribute('src')) return

        const item = currentItem()
        if (!item) return

        // A signed URL can die while the track sat paused in the queue. Try a
        // fresh resolve once before writing the song off as unavailable.
        if (item.source === 'youtube' && retriedStreamFor !== item.id) {
          retriedStreamFor = item.id
          const videoId = item.youtubeId ?? item.id.replace('yt:', '')
          forgetStream(videoId)
          const { queue } = get()
          const index = queue.findIndex((entry) => entry.id === item.id)
          if (index !== -1) {
            const nextQueue = [...queue]
            nextQueue[index] = { ...nextQueue[index], url: '' }
            set({ queue: nextQueue })
          }
          load(true)
          return
        }

        const { order, cursor } = get()
        const hasNext = cursor + 1 < order.length
        if (!hasNext) {
          set({ isPlaying: false, isLoading: false, error: 'Запись недоступна' })
          return
        }

        window.dispatchEvent(new CustomEvent('ownly:trackfailed', { detail: item }))
        set({ error: null })
        skipBroken()
      })

      let rafId = 0
      let lastEmit = 0
      const tick = () => {
        if (audio.paused) {
          rafId = 0
          return
        }
        const now = performance.now()
        if (now - lastEmit > 45) {
          lastEmit = now
          set({ position: audio.currentTime })
        }
        rafId = requestAnimationFrame(tick)
      }
      const startTick = () => {
        if (rafId === 0) rafId = requestAnimationFrame(tick)
      }
      audio.addEventListener('play', startTick)
      audio.addEventListener('playing', startTick)

      if (supportsMediaSession()) {
        const session = navigator.mediaSession
        session.setActionHandler('play', () => get().play())
        session.setActionHandler('pause', () => get().pause())
        session.setActionHandler('nexttrack', () => get().next())
        session.setActionHandler('previoustrack', () => get().previous())
        session.setActionHandler('seekto', (details) => {
          if (typeof details.seekTime === 'number') get().seek(details.seekTime)
        })
      }

      /* ------------------------------------------------------------ */
      /* public API                                                    */
      /* ------------------------------------------------------------ */

      return {
        queue: [],
        order: [],
        cursor: 0,
        isPlaying: false,
        isLoading: false,
        error: null,
        position: 0,
        duration: 0,
        volume: 0.78,
        muted: false,
        shuffle: false,
        repeat: 'off',
        kind: 'catalog',
        contextLabel: '',
        contextPath: '',

        playQueue: (tracks, startIndex = 0, context = {}) => {
          if (tracks.length === 0) return
          const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1))
          const shuffle = get().shuffle
          const order = shuffle ? shuffledOrder(tracks.length, safeIndex) : plainOrder(tracks.length)
          const cursor = shuffle ? 0 : safeIndex
          set({
            queue: tracks,
            order,
            cursor,
            contextLabel: context.label ?? '',
            contextPath: context.path ?? '',
            kind: context.kind ?? 'catalog',
          })
          load(true)
        },

        playTrack: (track, context = {}) => {
          get().playQueue([track], 0, context)
        },

        toggle: () => {
          if (!currentItem()) return
          if (audio.paused) get().play()
          else get().pause()
        },

        play: () => {
          if (!currentItem()) return
          if (!audio.src) {
            load(true)
            return
          }
          const promise = audio.play()
          if (promise) promise.catch(() => set({ isPlaying: false }))
        },

        pause: () => {
          audio.pause()
        },

        next: (auto = false) => advance(1, auto),

        previous: () => {
          if (audio.currentTime > 4) {
            audio.currentTime = 0
            set({ position: 0 })
            return
          }
          advance(-1, false)
        },

        seek: (seconds) => {
          if (!Number.isFinite(seconds)) return
          const duration = Number.isFinite(audio.duration) ? audio.duration : get().duration
          const target = Math.max(0, Math.min(seconds, duration || seconds))
          try {
            audio.currentTime = target
            set({ position: target })
          } catch {
            /* stream may not be seekable */
          }
        },

        setVolume: (volume) => {
          const value = Math.max(0, Math.min(1, volume))
          audio.volume = volumeToGain(value)
          audio.muted = value === 0
          set({ volume: value, muted: value === 0 })
        },

        toggleMute: () => {
          const muted = !get().muted
          audio.muted = muted
          audio.volume = volumeToGain(get().volume)
          set({ muted })
        },

        toggleShuffle: () => {
          const shuffle = !get().shuffle
          const { queue, order, cursor } = get()
          if (queue.length === 0) {
            set({ shuffle })
            return
          }
          const currentQueueIndex = order[cursor] ?? 0
          if (shuffle) {
            set({ shuffle, order: shuffledOrder(queue.length, currentQueueIndex), cursor: 0 })
          } else {
            set({ shuffle, order: plainOrder(queue.length), cursor: currentQueueIndex })
          }
        },

        cycleRepeat: () => {
          const order: RepeatMode[] = ['off', 'all', 'one']
          const nextMode = order[(order.indexOf(get().repeat) + 1) % order.length]
          set({ repeat: nextMode })
        },

        enqueueNext: (items) => {
          const list = Array.isArray(items) ? items : [items]
          if (list.length === 0) return
          const { queue, order, cursor } = get()
          if (queue.length === 0) {
            get().playQueue(list, 0, { label: 'Очередь' })
            return
          }
          const insertAt = cursor + 1
          const newQueue = [...queue]
          const newOrder = order.map((index) => (index >= insertAt ? index + list.length : index))
          newQueue.splice(insertAt, 0, ...list)
          const appended = list.map((_, offset) => insertAt + offset)
          newOrder.splice(cursor + 1, 0, ...appended)
          set({ queue: newQueue, order: newOrder })
        },

        enqueue: (items) => {
          const list = Array.isArray(items) ? items : [items]
          if (list.length === 0) return
          const { queue, order } = get()
          if (queue.length === 0) {
            get().playQueue(list, 0, { label: 'Очередь' })
            return
          }
          const startIndex = queue.length
          set({
            queue: [...queue, ...list],
            order: [...order, ...list.map((_, offset) => startIndex + offset)],
          })
        },

        removeFromQueue: (queueIndex) => {
          const { queue, order, cursor } = get()
          if (queueIndex < 0 || queueIndex >= queue.length) return
          const positionInOrder = order.indexOf(queueIndex)
          const isCurrent = positionInOrder === cursor

          const newQueue = queue.filter((_, index) => index !== queueIndex)
          const newOrder = order
            .filter((index) => index !== queueIndex)
            .map((index) => (index > queueIndex ? index - 1 : index))
          let newCursor = cursor
          if (positionInOrder !== -1) {
            if (positionInOrder < cursor) newCursor = cursor - 1
            if (isCurrent) newCursor = Math.min(cursor, newOrder.length - 1)
          }

          set({ queue: newQueue, order: newOrder, cursor: Math.max(0, newCursor) })
          if (isCurrent) {
            if (newQueue.length === 0) {
              audio.pause()
              audio.removeAttribute('src')
              set({ isPlaying: false, position: 0, duration: 0 })
            } else {
              load(true)
            }
          }
        },

        clearQueue: () => {
          audio.pause()
          audio.removeAttribute('src')
          set({ queue: [], order: [], cursor: 0, isPlaying: false, position: 0, duration: 0, error: null })
        },

        jumpToQueueIndex: (queueIndex) => {
          const { order } = get()
          const positionInOrder = order.indexOf(queueIndex)
          if (positionInOrder === -1) return
          set({ cursor: positionInOrder })
          load(true)
        },

        retry: () => {
          load(true)
        },
      }
    },
    {
      name: 'ownly.player',
      version: 1,
      migrate: (persisted) => {
        const previous = (persisted ?? {}) as Partial<PlayerState>
        return {
          volume: typeof previous.volume === 'number' ? previous.volume : 0.78,
          muted: Boolean(previous.muted),
          shuffle: Boolean(previous.shuffle),
          repeat: previous.repeat ?? 'off',
        } as PlayerState
      },
      partialize: (state) => ({ volume: state.volume, muted: state.muted, shuffle: state.shuffle, repeat: state.repeat }),
      onRehydrateStorage: () => (state) => {
        if (state) audio.volume = volumeToGain(state.muted ? 0 : state.volume)
      },
    },
  ),
)

/* ------------------------------------------------------------------ */
/* selectors                                                           */
/* ------------------------------------------------------------------ */

if (typeof window !== 'undefined') window.__ownlyPlayer = usePlayer

export function useCurrentTrack(): QueueItem | null {  return usePlayer((state) => {
    const queueIndex = state.order[state.cursor]
    return queueIndex === undefined ? null : (state.queue[queueIndex] ?? null)
  })
}

export function useIsPlaying(): boolean {
  return usePlayer((state) => state.isPlaying)
}

export function useProgress(): number {
  return usePlayer((state) => (state.duration > 0 ? state.position / state.duration : 0))
}

/** Records a play once per track, 25s in or half-way through short tracks. */
let recordedFor = ''
export function initPlayTracking() {
  const maybeRecord = () => {
    const state = usePlayer.getState()
    const item = state.queue[state.order[state.cursor]]
    if (!item) return
    const threshold = Math.min(25, (state.duration || 60) * 0.5)
    if (state.position < threshold) return
    if (recordedFor === item.id) return
    recordedFor = item.id
    window.dispatchEvent(new CustomEvent('ownly:played', { detail: item }))
  }
  const unsubscribe = usePlayer.subscribe(maybeRecord)
  window.addEventListener('ownly:trackchange', () => {
    recordedFor = ''
  })
  return () => unsubscribe()
}
