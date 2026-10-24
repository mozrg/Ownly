/**
 * Artist credits from a real catalogue.
 *
 * A YouTube upload is titled by whoever uploaded it, so a song by two artists
 * is routinely credited to one. Deezer's public API carries the real credit
 * list (`contributors`) and needs no account, so it is the authority here:
 * YouTube gives us the recording, Deezer gives us the names.
 */
import { useEffect, useMemo, useState } from 'react'
import { cleanTitle } from './lyrics'
import type { Track } from './types'

interface DeezerTrack {
  id?: number
  title?: string
  duration?: number
  contributors?: Array<{ name?: string }>
}

interface DeezerSearch {
  data?: DeezerTrack[]
  error?: { message?: string }
}

const CREDITS_KEY = 'ownly.credits.v1'
const CREDITS_TTL = 30 * 24 * 60 * 60_000

const cache = new Map<string, { at: number; names: string[] }>()
const inFlight = new Map<string, Promise<string[] | null>>()
const listeners = new Set<() => void>()
let loaded = false

function keyOf(artist: string, title: string) {
  return `${artist}::${cleanTitle(title)}`.toLowerCase()
}

function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(CREDITS_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, { at: number; names: string[] }>
    const now = Date.now()
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && Array.isArray(entry.names) && now - entry.at < CREDITS_TTL) cache.set(key, entry)
    }
  } catch {
    /* a corrupt cache only costs a few requests */
  }
}

let saveTimer: number | undefined

function save() {
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      const entries: Record<string, { at: number; names: string[] }> = {}
      // Keep the file bounded; recent entries matter most.
      for (const key of [...cache.keys()].slice(-500)) {
        const entry = cache.get(key)
        if (entry) entries[key] = entry
      }
      localStorage.setItem(CREDITS_KEY, JSON.stringify(entries))
    } catch {
      /* quota — the in-memory map still works for this session */
    }
  }, 1500)
}

function notify() {
  for (const listener of listeners) listener()
}

export function onCreditsChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Cached credit list, or undefined while it has not been looked up yet. */
export function cachedCredits(artist: string, title: string): string[] | undefined {
  load()
  return cache.get(keyOf(artist, title))?.names
}

/**
 * Looks up the full credit list. Resolves to null when the song is not in the
 * catalogue or the credits would not add anything.
 */
export function requestCredits(track: Pick<Track, 'id' | 'artist' | 'artists' | 'title' | 'duration'>): Promise<string[] | null> {
  load()
  const key = keyOf(track.artist, track.title)
  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached.names)

  const running = inFlight.get(key)
  if (running) return running

  const job = lookup(track)
    .then((names) => {
      if (names) {
        cache.set(key, { at: Date.now(), names })
        save()
        notify()
      }
      return names
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, job)
  return job
}

async function lookup(track: Pick<Track, 'id' | 'artist' | 'artists' | 'title' | 'duration'>): Promise<string[] | null> {
  if (!window.ownly?.netJson) return null
  const lead = track.artists?.[0] ?? track.artist
  const title = cleanTitle(track.title)
  if (!lead || !title) return null

  const query = `${lead} ${title}`
  const search = await window.ownly.netJson(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=12`,
  )
  if (!search.ok || !search.body) return null

  let payload: DeezerSearch
  try {
    payload = JSON.parse(search.body)
  } catch {
    return null
  }
  if (!Array.isArray(payload.data) || payload.data.length === 0) return null

  const best = pickCandidate(payload.data, title, track.duration)
  if (!best?.id) return null

  const detail = await window.ownly.netJson(`https://api.deezer.com/track/${best.id}`)
  if (!detail.ok || !detail.body) return null

  let full: DeezerTrack
  try {
    full = JSON.parse(detail.body)
  } catch {
    return null
  }

  const names = (full.contributors ?? [])
    .map((contributor) => contributor.name?.trim() ?? '')
    .filter(Boolean)

  // Deezer sometimes lists the same act twice ("LONOWN", "Lonown").
  const unique: string[] = []
  for (const name of names) {
    if (!unique.some((existing) => existing.toLowerCase() === name.toLowerCase())) unique.push(name)
  }

  return unique.length > 0 ? unique : null
}

/** Picks the catalogue entry that is actually this recording. */
function pickCandidate(rows: DeezerTrack[], title: string, duration: number): DeezerTrack | null {
  const needle = title.toLowerCase()
  let best: DeezerTrack | null = null
  let bestScore = 0

  for (const row of rows) {
    const candidate = (row.title ?? '').toLowerCase()
    let score = 0
    if (candidate === needle) score += 6
    else if (candidate.includes(needle) || needle.includes(candidate)) score += 3
    else continue

    if (duration > 0 && row.duration) {
      const delta = Math.abs(row.duration - duration)
      if (delta <= 3) score += 5
      else if (delta <= 8) score += 3
      else if (delta <= 20) score += 1
      // A wildly different length is a different recording.
      else score -= 4
    }

    if (score > bestScore) {
      bestScore = score
      best = row
    }
  }

  return bestScore >= 6 ? best : null
}

/**
 * The artist list to show for a track: the upload's own names, extended with
 * any collaborator only the catalogue knows about.
 */
export function useArtistCredits(track: {
  id: string
  artist: string
  artists?: string[]
  title: string
  duration: number
}): string[] {
  const own = track.artists && track.artists.length > 0 ? track.artists : [track.artist]
  const [names, setNames] = useState<string[] | null>(() => cachedCredits(track.artist, track.title) ?? null)

  useEffect(() => {
    if (names && names.length > 1) return
    let alive = true
    void requestCredits(track).then((found) => {
      if (alive && found && found.length > 0) setNames(found)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id])

  return useMemo(() => {
    if (!names || names.length <= own.length) return own
    // Keep every name the upload gave us and add the ones only the catalogue has.
    const merged = [...own]
    for (const name of names) {
      if (!merged.some((existing) => existing.toLowerCase() === name.toLowerCase())) merged.push(name)
    }
    return merged
  }, [own, names])
}

