/** Time-synced lyrics from LRCLIB (open, no key required). Best-effort. */
import { getJson } from './http'
import type { Lyrics, LyricLine } from './types'

interface LrclibResult {
  id?: number
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
  instrumental?: boolean
}

function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const row of raw.split(/\r?\n/)) {
    const match = /^((?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+)(.*)$/.exec(row.trim())
    if (!match) continue
    const text = match[2].trim()
    const stamps = match[1].match(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g) ?? []
    for (const stamp of stamps) {
      const parts = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/.exec(stamp)
      if (!parts) continue
      const minutes = Number.parseInt(parts[1], 10)
      const seconds = Number.parseInt(parts[2], 10)
      const fraction = parts[3] ? Number.parseInt(parts[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0
      lines.push({ time: minutes * 60 + seconds + fraction, text })
    }
  }
  return lines
    .filter((line, index, all) => index === 0 || line.time !== all[index - 1].time || line.text !== all[index - 1].text)
    .sort((a, b) => a.time - b.time)
}

/**
 * Strips the decorations YouTube titles carry. LRCLIB indexes clean titles,
 * so "(Slowed + Reverb)" or "[Remix]" would never match as-is.
 */
export function cleanTitle(title: string): string {
  return title
    .replace(/\((?:slowed|reverb|sped\s*up|nightcore|8d|bass\s*boosted|remix|cover|live|acoustic)[^)]*\)/gi, ' ')
    .replace(/\[(?:slowed|reverb|sped\s*up|nightcore|8d|bass\s*boosted|remix|cover|live|acoustic)[^\]]*\]/gi, ' ')
    .replace(/\s*[-–—]\s*(?:slowed|reverb|sped\s*up|nightcore)[\s\S]*$/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/* ------------------------------------------------------------------ */
/* "Does this track have lyrics?" — a cheap, cached availability check  */
/* ------------------------------------------------------------------ */

const AVAILABILITY_KEY = 'ownly.lyrics.availability.v1'
const availability = new Map<string, boolean>()
let availabilityLoaded = false

function loadAvailability() {
  if (availabilityLoaded) return
  availabilityLoaded = true
  try {
    const raw = localStorage.getItem(AVAILABILITY_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, boolean>
    for (const [key, value] of Object.entries(parsed)) availability.set(key, Boolean(value))
  } catch {
    /* a corrupt cache just means a few extra requests */
  }
}

let saveTimer: number | undefined

function saveAvailability() {
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      const entries: Record<string, boolean> = {}
      // Keep the map from growing without bound.
      const keys = [...availability.keys()].slice(-800)
      for (const key of keys) entries[key] = availability.get(key) ?? false
      localStorage.setItem(AVAILABILITY_KEY, JSON.stringify(entries))
    } catch {
      /* quota — the in-memory map still works for this session */
    }
  }, 1200)
}

const probeQueue: Array<{ artist: string; title: string }> = []
const probing = new Set<string>()
let probeActive = 0
const PROBE_CONCURRENCY = 3
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/** Subscribes to availability updates; returns an unsubscribe function. */
export function onAvailabilityChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function probeKey(artist: string, title: string) {
  return `${artist}::${cleanTitle(title)}`.toLowerCase()
}

/** Known answer, or undefined while it is still being looked up. */
export function lyricsAvailability(artist: string, title: string): boolean | undefined {
  loadAvailability()
  return availability.get(probeKey(artist, title))
}

function drainProbes() {
  while (probeActive < PROBE_CONCURRENCY && probeQueue.length > 0) {
    const job = probeQueue.shift()
    if (!job) break
    const key = probeKey(job.artist, job.title)
    if (availability.has(key)) continue

    probeActive += 1
    probeLyrics(job.artist, job.title)
      .then((found) => {
        availability.set(key, found)
        saveAvailability()
        notify()
      })
      .catch(() => {
        /* leave it unknown so it can be retried later */
      })
      .finally(() => {
        probeActive -= 1
        probing.delete(key)
        drainProbes()
      })
  }
}

/** Queues an availability lookup. Cheap, deduplicated, and rate-limited. */
export function requestLyricsProbe(artist: string, title: string) {
  loadAvailability()
  const key = probeKey(artist, title)
  if (availability.has(key) || probing.has(key)) return
  probing.add(key)
  probeQueue.push({ artist, title })
  drainProbes()
}

async function probeLyrics(artist: string, title: string): Promise<boolean> {
  const clean = cleanTitle(title)
  if (!clean) return false

  const lead = artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|\+)\s*/i)[0]?.trim() || artist
  const results = await getJson<LrclibResult[]>(
    'https://lrclib.net/api/search',
    { q: `${lead} ${clean}` },
    { ttl: 7 * 24 * 60 * 60_000, retries: 0, timeout: 7000 },
  )
  if (!Array.isArray(results) || results.length === 0) return false

  const needle = clean.toLowerCase()
  return results.some((row) => {
    const name = (row.trackName ?? '').toLowerCase()
    if (!name.includes(needle) && !needle.includes(name)) return false
    return Boolean(row.syncedLyrics?.trim() || row.plainLyrics?.trim())
  })
}

const cache = new Map<string, Lyrics | null>()

function keyOf(artist: string, title: string) {
  return `${artist}::${title}`.toLowerCase()
}

/**
 * Returns synced lyrics when the timings actually fit this recording,
 * otherwise plain text, otherwise null.
 */
export async function getLyrics(
  artist: string,
  title: string,
  album?: string,
  duration?: number,
): Promise<Lyrics | null> {
  const key = keyOf(artist, title) + `::${Math.round(duration ?? 0)}`
  if (cache.has(key)) return cache.get(key) ?? null

  const cleanTitleText = cleanTitle(title)
  // "A, B & C" never matches LRCLIB; the lead artist usually does.
  const artists = artist
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
  const candidates = artists.length > 0 ? artists.slice(0, 2) : [artist]

  const tries: Array<() => Promise<LrclibResult | null>> = []
  for (const name of candidates) {
    tries.push(() =>
      getJson<LrclibResult>(
        'https://lrclib.net/api/get',
        {
          artist_name: name,
          track_name: cleanTitleText,
          album_name: album,
          duration: duration && duration > 30 ? Math.round(duration) : undefined,
        },
        { ttl: 24 * 60 * 60_000, retries: 1, timeout: 12_000 },
      ),
    )
  }
  tries.push(() => searchOnce(candidates[0] ?? artist, cleanTitleText))

  let result: LrclibResult | null = null
  for (const attempt of tries) {
    try {
      result = await attempt()
    } catch {
      result = null
    }
    if (result) break
  }

  const lyrics = toLyrics(result, duration)
  cache.set(key, lyrics)
  return lyrics
}

async function searchOnce(artist: string, title: string): Promise<LrclibResult | null> {
  const results = await getJson<LrclibResult[]>(
    'https://lrclib.net/api/search',
    { q: `${artist} ${title}` },
    { ttl: 24 * 60 * 60_000, retries: 1, timeout: 12_000 },
  )
  if (!Array.isArray(results) || results.length === 0) return null

  const needle = title.toLowerCase()
  return (
    results.find((row) => (row.trackName ?? '').toLowerCase() === needle) ??
    results.find((row) => (row.trackName ?? '').toLowerCase().includes(needle)) ??
    results[0]
  )
}

/** Largest drift we accept before calling the timings wrong. */
const DRIFT_SECONDS = 4
const DRIFT_RATIO = 0.03

function toLyrics(result: LrclibResult | null | undefined, ourDuration?: number): Lyrics | null {
  if (!result) return null
  if (result.instrumental) {
    return { lines: [{ time: 0, text: 'Инструментальная композиция' }], synced: false, source: 'LRCLIB' }
  }

  if (result.syncedLyrics && result.syncedLyrics.trim()) {
    const lines = parseLrc(result.syncedLyrics)
    if (lines.length > 0) {
      const theirs = result.duration
      if (!theirs || !ourDuration || ourDuration <= 30) return { lines, synced: true, source: 'LRCLIB' }

      const drift = Math.abs(ourDuration - theirs)
      if (drift <= Math.max(DRIFT_SECONDS, ourDuration * DRIFT_RATIO)) {
        return { lines, synced: true, source: 'LRCLIB' }
      }

      // A slowed/sped-up upload is a uniform time-stretch, so the timings can
      // be scaled to fit. Beyond that range it is a different arrangement and
      // the safest thing is to show the text without pretending it is in sync.
      const ratio = ourDuration / theirs
      if (ratio > 0.55 && ratio < 1.85) {
        return {
          lines: lines.map((line) => ({ ...line, time: line.time * ratio })),
          synced: true,
          source: 'LRCLIB',
          adjusted: true,
        }
      }

      return {
        lines: lines.map((line) => ({ time: 0, text: line.text })),
        synced: false,
        source: 'LRCLIB',
      }
    }
  }

  if (result.plainLyrics && result.plainLyrics.trim()) {
    const lines = result.plainLyrics
      .split(/\r?\n/)
      .map((text) => ({ time: 0, text: text.trim() }))
      .filter((line) => line.text.length > 0)
    if (lines.length > 0) return { lines, synced: false, source: 'LRCLIB' }
  }

  return null
}
