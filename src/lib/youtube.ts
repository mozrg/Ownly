/**
 * The catalogue.
 *
 * Search and stream resolution run in the main process through the bundled
 * yt-dlp binary: the renderer cannot spawn processes, and signed stream URLs
 * should not exist in the DOM before they are needed.
 */
import type { Album, Track } from './types'

export const YOUTUBE_PREFIX = 'yt:'

export interface YtResult {
  id: string
  title: string
  duration: number
  channel: string
  thumbnail: string
  url: string
}

export function youtubeAvailable(): boolean {
  return Boolean(window.ownly?.ytSearch)
}

/** Splits a credit line into separate artists: "A, B & C feat. D" → [A, B, C, D]. */
export function splitArtists(credit: string): string[] {
  if (!credit.trim()) return []
  return credit
    .replace(/\s+(?:feat\.?|ft\.?|при уч\.?|with)\s+/gi, ', ')
    .split(/\s*(?:,|&|\band\b|\bvs\.?\b|\bx\b|\/|\+|·)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !/^(?:official|topic|vevo|music|records)$/i.test(part))
}

/** Removes the decorations YouTube titles carry: "(Official Video)", "[Lyrics]". */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\((?:official\s*)?(?:music\s*)?(?:video|audio|lyric[s]?|visualizer|hd|hq|4k|remaster(?:ed)?)[^)]*\)/gi, ' ')
    .replace(/\[(?:official\s*)?(?:music\s*)?(?:video|audio|lyric[s]?|visualizer|hd|hq|4k|remaster(?:ed)?)[^\]]*\]/gi, ' ')
    .replace(/\b(?:official\s*)?(?:music\s*)?video\b/gi, ' ')
    .replace(/\b(?:official\s*)?audio\b/gi, ' ')
    .replace(/\blyrics?\b/gi, ' ')
    .replace(/\bfull\s*hd\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–—]\s*$/, '')
    .trim()
}

/** Longest plausible credit line; beyond this it is a title, not an artist. */
const MAX_CREDIT = 42

/**
 * Splits a YouTube title into artist and track.
 *
 * YouTube titles come in both orders — "Artist - Track" and "Track - Artist" —
 * and the channel is the most reliable hint about which side is the artist.
 * The query helps too: people usually type the artist first.
 */
function parseTitle(raw: string, channel: string, query: string): { title: string; artists: string[] } {
  const text = cleanTitle(raw)
  const channelKey = channel.toLowerCase().replace(/\s+/g, ' ').trim()
  const leadToken = query
    .toLowerCase()
    .split(/\s+/)
    .find((token) => token.length > 2) ?? ''

  const looksLikeArtist = (side: string) => {
    const key = side.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!key) return 0
    let score = 0
    if (channelKey && key.includes(channelKey)) score += 3
    if (channelKey && channelKey.includes(key)) score += 2
    if (leadToken && key.includes(leadToken)) score += 3
    return score
  }

  for (const separator of [' - ', ' – ', ' — ', ' | ']) {
    const index = text.indexOf(separator)
    if (index <= 0) continue
    const left = text.slice(0, index).trim()
    const right = text.slice(index + separator.length).trim()
    if (!left || right.length < 2) continue

    // Prefer the side that matches the channel or the query.
    const swap = looksLikeArtist(right) > looksLikeArtist(left)
    const artistText = swap ? right : left
    const titleText = swap ? left : right

    // "LONOWN, Asenssia | TikTok Version …" is a credit with extra words
    // tacked on; keep the credit and drop the tail.
    const head = artistText.split('|')[0].trim()
    const artists = splitArtists(head)
    const joined = artists.join(', ')
    if (artists.length > 0 && joined.length <= MAX_CREDIT) {
      return { title: titleText, artists }
    }
    // An over-long "artist" is really a title: fall back to the channel.
    return { title: text, artists: splitArtists(channel) }
  }

  return { title: text, artists: splitArtists(channel) }
}

export function toTrack(result: YtResult, query = ''): Track {
  const channel = result.channel.replace(/\s*-\s*Topic$/i, '').trim()
  const parsed = parseTitle(result.title, channel, query)
  const artists = parsed.artists.length > 0 ? parsed.artists : splitArtists(channel)
  const artist = artists.length > 0 ? artists.join(', ') : channel || 'Неизвестный исполнитель'

  return {
    id: `${YOUTUBE_PREFIX}${result.id}`,
    title: parsed.title || result.title,
    artist,
    artists: artists.length > 0 ? artists : [artist],
    album: channel || 'Сингл',
    albumId: `${YOUTUBE_PREFIX}${result.id}`,
    trackNumber: 1,
    duration: result.duration || 0,
    url: '',
    cover: result.thumbnail,
    source: 'youtube',
    youtubeId: result.id,
    sourceUrl: `https://www.youtube.com/watch?v=${result.id}`,
  }
}

const searchCache = new Map<string, { at: number; value: Track[] }>()
const SEARCH_TTL = 15 * 60_000

/** Decorations that differ between uploads of the same song. */
const VERSION_NOISE = /\b(slowed|reverb|sped up|speed up|nightcore|8d|ultra|looped|loop|remix|version|edit|audio|lyrics?|best part|tiktok)\b/gi

function songKey(track: Track): string {
  const base = track.title
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(VERSION_NOISE, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return `${(track.artists?.[0] ?? track.artist).toLowerCase()}::${base}`
}

/**
 * YouTube uploads credit collaborators inconsistently: one upload says
 * "LONOWN — addiction", the next says "LONOWN, Asenssia — addiction". Pooling
 * the credits of every upload of the same song gives the full line-up instead
 * of whichever name the uploader happened to type.
 */
function enrichCredits(tracks: Track[]): Track[] {
  const pool = new Map<string, Set<string>>()

  for (const track of tracks) {
    const key = songKey(track)
    if (!key || key.endsWith('::')) continue
    const bucket = pool.get(key) ?? new Set<string>()
    for (const name of track.artists ?? [track.artist]) {
      if (name) bucket.add(name)
    }
    pool.set(key, bucket)
  }

  return tracks.map((track) => {
    const key = songKey(track)
    const known = pool.get(key)
    const current = track.artists ?? [track.artist]
    if (!known || known.size <= current.length) return track

    // Keep the credited artist first so the row still leads with what the
    // upload itself says.
    const ordered = [...current]
    for (const name of known) {
      if (!ordered.some((existing) => existing.toLowerCase() === name.toLowerCase())) ordered.push(name)
    }
    return { ...track, artists: ordered, artist: ordered.join(', ') }
  })
}

export async function youtubeSearch(query: string, limit = 30): Promise<Track[]> {
  const key = `${query.toLowerCase()}|${limit}`
  const cached = searchCache.get(key)
  if (cached && Date.now() - cached.at < SEARCH_TTL) return cached.value

  if (!window.ownly?.ytSearch) return []
  const results = (await window.ownly.ytSearch(query, limit)) as YtResult[]
  const mapped = results.map((item) => toTrack(item, query)).filter((track) => track.title.length > 0)
  const tracks = enrichCredits(mapped)
  searchCache.set(key, { at: Date.now(), value: tracks })

  return tracks
}

/** Replaces a cached query in place — used after the user edits and returns. */
export function forgetSearch(query: string) {
  const prefix = query.toLowerCase()
  for (const key of [...searchCache.keys()]) {
    if (key.startsWith(`${prefix}|`)) searchCache.delete(key)
  }
}

/** Resolves a playable audio URL. Signed URLs expire, so never cache for long. */
const streamCache = new Map<string, { at: number; url: string }>()
const inFlight = new Map<string, Promise<string>>()
const STREAM_TTL = 45 * 60_000

/* Stream URLs survive a restart, so repeat plays skip the slow resolve. */
const DISK_KEY = 'ownly.streams.v1'
const DISK_TTL = 3 * 60 * 60_000

function loadDiskCache() {
  try {
    const raw = localStorage.getItem(DISK_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, { at: number; url: string }>
    const now = Date.now()
    for (const [id, entry] of Object.entries(parsed)) {
      if (entry && typeof entry.url === 'string' && now - entry.at < DISK_TTL) {
        streamCache.set(id, entry)
      }
    }
  } catch {
    /* a corrupt cache is not worth failing over */
  }
}

let diskLoaded = false
let saveTimer: number | undefined

function saveDiskCache() {
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      const now = Date.now()
      const entries: Record<string, { at: number; url: string }> = {}
      for (const [id, entry] of streamCache) {
        if (now - entry.at < DISK_TTL) entries[id] = entry
      }
      localStorage.setItem(DISK_KEY, JSON.stringify(entries))
    } catch {
      /* quota or private mode — the in-memory cache still works */
    }
  }, 800)
}

export async function resolveYoutubeStream(videoId: string): Promise<string> {
  // A direct request means someone is waiting: drop background warming so the
  // two do not compete for the same slow connection.
  prefetchQueue.length = 0
  return startResolve(videoId)
}

function startResolve(videoId: string): Promise<string> {
  if (!diskLoaded) {
    diskLoaded = true
    loadDiskCache()
  }

  const cached = streamCache.get(videoId)
  if (cached && Date.now() - cached.at < STREAM_TTL) return Promise.resolve(cached.url)

  // Two callers asking for the same track must share one process, not two.
  const existing = inFlight.get(videoId)
  if (existing) return existing

  if (!window.ownly?.ytStream) return Promise.reject(new Error('YouTube недоступен'))

  const task = window.ownly
    .ytStream(videoId)
    .then((url) => {
      streamCache.set(videoId, { at: Date.now(), url })
      saveDiskCache()
      return url
    })
    .finally(() => {
      inFlight.delete(videoId)
    })

  inFlight.set(videoId, task)
  return task
}

/**
 * Warms streams one at a time in the background.
 *
 * Resolving is a slow, network-bound process; running several at once makes
 * each of them slower. A queue means the first result is usually ready by the
 * time the user clicks it, without any of them competing.
 */
const prefetchQueue: string[] = []
let draining = false

function drainPrefetch() {
  if (draining) return
  draining = true
  const step = () => {
    const next = prefetchQueue.shift()
    if (!next) {
      draining = false
      return
    }
    if (streamCache.has(next)) {
      step()
      return
    }
    startResolve(next)
      .catch(() => undefined)
      .finally(() => window.setTimeout(step, 60))
  }
  step()
}

/** Warms a stream without caring about the outcome — used on row hover. */
export function prefetchStream(videoId: string | undefined) {
  if (!videoId) return
  if (streamCache.has(videoId)) return
  if (inFlight.has(videoId)) return
  if (prefetchQueue.includes(videoId)) return
  prefetchQueue.push(videoId)
  drainPrefetch()
}

/** Warms the first few results of a list, in order. */
export function prefetchTracks(tracks: Array<{ youtubeId?: string }>, count = 2) {
  for (const track of tracks.slice(0, count)) prefetchStream(track.youtubeId)
}

export function isYoutubeId(id: string): boolean {
  return id.startsWith(YOUTUBE_PREFIX)
}

export function youtubeVideoId(id: string): string {
  return id.replace(YOUTUBE_PREFIX, '')
}

/** A YouTube "release" is a single video; kept so old links still resolve. */
export async function youtubeAlbum(albumId: string): Promise<Album> {
  const videoId = youtubeVideoId(albumId)
  const tracks = await youtubeSearch(`https://www.youtube.com/watch?v=${videoId}`, 1)
  const track = tracks[0]
  return {
    id: albumId,
    title: track?.title ?? 'Трек',
    artist: track?.artist ?? '',
    cover: track?.cover ?? '',
    tracks: track ? [{ ...track, albumId }] : [],
    subjects: [],
    source: 'youtube',
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
  }
}
