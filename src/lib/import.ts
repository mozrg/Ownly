/**
 * Importing a playlist from another service by pasting its public link.
 *
 * Every source needs nothing but the link — no account, no API key, no app
 * registration:
 *   • YouTube / YouTube Music — the catalogue Ownly already plays from
 *   • Яндекс Музыка — public JSON API
 *   • Deezer — public JSON API
 *   • Spotify — its own web client reads public playlists anonymously, so the
 *     embed state (or, failing that, an anonymous player token) is enough
 *   • a pasted list of songs, for everything else
 */
import { toTrack, youtubeSearch } from './youtube'
import type { Track } from './types'

export type ImportSource = 'yandex' | 'spotify' | 'deezer' | 'youtube' | 'text'

export interface ImportedEntry {
  title: string
  artists: string[]
  duration: number
  /** Already-known catalogue id, when the source is the catalogue itself. */
  videoId?: string
  cover?: string
}

export interface ImportedPlaylist {
  source: ImportSource
  name: string
  entries: ImportedEntry[]
  cover?: string
  url: string
}

export class ImportError extends Error {
  code: 'unsupported' | 'not-found' | 'blocked' | 'empty' | 'network' | 'private' | 'canceled'
  constructor(code: ImportError['code'], message: string) {
    super(message)
    this.code = code
    this.name = 'ImportError'
  }
}

const YANDEX_HOSTS = /(^|\.)(music\.yandex\.[a-z.]+|yandex\.(ru|com|by|kz|uz))$/i
const SPOTIFY_HOSTS = /(^|\.)spotify\.com$/i
const DEEZER_HOSTS = /(^|\.)deezer\.com$/i
const YOUTUBE_HOSTS = /^(www\.|m\.|music\.)?youtube\.com$/i

export function detectSource(raw: string): ImportSource | null {
  const text = raw.trim()
  if (!text) return null
  // Anything without a scheme is treated as a pasted list of songs.
  if (!/^https?:\/\//i.test(text)) return 'text'

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (SPOTIFY_HOSTS.test(url.hostname)) return 'spotify'
  if (YANDEX_HOSTS.test(url.hostname)) return 'yandex'
  if (DEEZER_HOSTS.test(url.hostname)) return 'deezer'
  if (YOUTUBE_HOSTS.test(url.hostname)) return 'youtube'
  return null
}

/** Pulls the playlist id out of whatever link shape the service uses. */
function yandexPlaylistId(url: URL): string | null {
  const byUuid = /\/playlists\/([A-Za-z0-9-]+)/.exec(url.pathname)
  if (byUuid) return byUuid[1]
  const byUser = /\/users\/([^/]+)\/playlists\/(\d+)/.exec(url.pathname)
  if (byUser) return `${byUser[1]}/${byUser[2]}`
  return null
}

function spotifyPlaylistId(url: URL): string | null {
  const match = /\/(?:playlist|album)\/([A-Za-z0-9]+)/.exec(url.pathname)
  return match ? match[1] : null
}

export interface PlaylistFetchOptions {
  signal?: AbortSignal
  requestId?: string
  onProgress?: (stage: 'fetch', done: number, total: number) => void
}

export async function fetchPlaylist(raw: string, options: PlaylistFetchOptions = {}): Promise<ImportedPlaylist> {
  if (options.signal?.aborted) throw new ImportError('canceled', 'Импорт остановлен.')
  const source = detectSource(raw)
  if (!source) {
    throw new ImportError('unsupported', 'Не понял ссылку. Поддерживаются Яндекс Музыка, Deezer, YouTube и Spotify.')
  }

  if (source === 'text') return fetchText(raw)

  const url = new URL(raw.trim())
  if (source === 'spotify') {
    const id = spotifyPlaylistId(url)
    if (!id) throw new ImportError('unsupported', 'В ссылке нет идентификатора плейлиста.')
    return fetchSpotify(id, raw, options.requestId, options.onProgress)
  }
  if (source === 'youtube') return fetchYoutube(raw)
  if (source === 'deezer') return fetchDeezer(url, raw)

  const id = yandexPlaylistId(url)
  if (!id) throw new ImportError('unsupported', 'В ссылке нет идентификатора плейлиста.')
  return fetchYandex(id, raw)
}

/* ------------------------------------------------------------------ */
/* YouTube                                                             */
/* ------------------------------------------------------------------ */

async function fetchYoutube(raw: string): Promise<ImportedPlaylist> {
  const result = await window.ownly!.ytPlaylist(raw)
  if (!result.ok) {
    if (result.error === 'no-playlist') {
      throw new ImportError('unsupported', 'В ссылке нет идентификатора плейлиста YouTube.')
    }
    throw new ImportError('network', 'Не удалось прочитать плейлист YouTube.')
  }

  const entries: ImportedEntry[] = (result.entries ?? []).map((entry) => ({
    title: entry.title,
    artists: entry.channel ? [entry.channel.replace(/\s*-\s*Topic$/i, '').trim()] : [],
    duration: entry.duration,
    videoId: entry.id,
  }))

  if (entries.length === 0) throw new ImportError('empty', 'В плейлисте нет треков.')

  return { source: 'youtube', name: result.name ?? 'Плейлист YouTube', entries, url: raw }
}

/* ------------------------------------------------------------------ */
/* Deezer                                                              */
/* ------------------------------------------------------------------ */

interface DeezerTrack {
  title?: string
  duration?: number
  artist?: { name?: string }
  contributors?: Array<{ name?: string }>
  album?: { title?: string; cover_medium?: string }
}

async function fetchDeezer(url: URL, raw: string): Promise<ImportedPlaylist> {
  const id = /\/playlist\/(\d+)/.exec(url.pathname)?.[1]
  if (!id) throw new ImportError('unsupported', 'В ссылке нет идентификатора плейлиста Deezer.')

  const response = await window.ownly!.netJson(`https://api.deezer.com/playlist/${id}`)
  if (!response.ok || !response.body) throw new ImportError('network', 'Deezer не ответил.')

  let payload: {
    title?: string
    picture_medium?: string
    tracks?: { data?: DeezerTrack[] }
    error?: { message?: string }
  }
  try {
    payload = JSON.parse(response.body)
  } catch {
    throw new ImportError('network', 'Deezer вернул неожиданный ответ.')
  }
  if (payload.error) throw new ImportError('not-found', payload.error.message ?? 'Плейлист не найден.')

  const rows = payload.tracks?.data ?? []
  const entries: ImportedEntry[] = []
  for (const row of rows) {
    const title = row.title?.trim()
    if (!title) continue
    const artists = (row.contributors ?? [])
      .map((contributor) => contributor.name?.trim() ?? '')
      .filter(Boolean)
    if (artists.length === 0 && row.artist?.name) artists.push(row.artist.name)
    entries.push({
      title,
      artists,
      duration: Math.round(Number(row.duration ?? 0)),
      cover: row.album?.cover_medium,
    })
  }

  if (entries.length === 0) throw new ImportError('empty', 'В плейлисте нет треков.')

  return {
    source: 'deezer',
    name: payload.title ?? 'Плейлист Deezer',
    entries,
    cover: payload.picture_medium,
    url: raw,
  }
}

/* ------------------------------------------------------------------ */
/* Yandex Music                                                        */
/* ------------------------------------------------------------------ */

interface YandexTrack {
  title?: string
  durationMs?: number
  artists?: Array<{ name?: string }>
  albums?: Array<{ title?: string; coverUri?: string }>
  ogImage?: string
}

interface YandexPlaylist {
  title?: string
  ogImage?: string
  cover?: { uri?: string }
  trackCount?: number
  tracks?: Array<{ track?: YandexTrack } | YandexTrack>
}

async function fetchYandex(id: string, originalUrl: string): Promise<ImportedPlaylist> {
  const endpoint = id.includes('/')
    ? `https://api.music.yandex.net/users/${id.split('/')[0]}/playlists/${id.split('/')[1]}`
    : `https://api.music.yandex.net/playlist/${id}`

  let payload: { result?: YandexPlaylist & { playlistUuid?: string } }
  try {
    // Yandex sends no CORS headers, so the request goes through the main
    // process rather than the renderer.
    if (!window.ownly?.netJson) throw new ImportError('network', 'Импорт доступен только в приложении.')
    const response = await window.ownly.netJson(endpoint)
    if (response.status === 404) throw new ImportError('not-found', 'Плейлист не найден — возможно, он удалён.')
    if (!response.ok || !response.body) throw new ImportError('network', `Яндекс ответил ${response.status || 'ошибкой'}.`)
    payload = JSON.parse(response.body)
  } catch (error) {
    if (error instanceof ImportError) throw error
    throw new ImportError('network', 'Не удалось связаться с Яндекс Музыкой.')
  }

  const playlist = payload.result
  if (!playlist) throw new ImportError('not-found', 'Плейлист не найден.')

  const entries: ImportedEntry[] = []
  for (const row of playlist.tracks ?? []) {
    const track = 'track' in row && row.track ? row.track : (row as YandexTrack)
    const title = track.title?.trim()
    if (!title) continue
    const artists = (track.artists ?? []).map((artist) => artist.name?.trim() ?? '').filter(Boolean)
    entries.push({
      title,
      artists,
      duration: Math.round((track.durationMs ?? 0) / 1000),
    })
  }

  if (entries.length === 0) {
    throw new ImportError('private', 'В плейлисте нет доступных треков — возможно, он скрыт.')
  }

  const coverUri = playlist.cover?.uri ?? playlist.ogImage
  const cover = coverUri ? `https://${coverUri.replace('%%', '400x400')}` : undefined

  return {
    source: 'yandex',
    name: playlist.title?.trim() || 'Импортированный плейлист',
    entries,
    cover,
    url: originalUrl,
  }
}

/* ------------------------------------------------------------------ */
/* Spotify — link only, no account and no keys                         */
/* ------------------------------------------------------------------ */

async function fetchSpotify(
  id: string,
  originalUrl: string,
  requestId?: string,
  onProgress?: PlaylistFetchOptions['onProgress'], 
): Promise<ImportedPlaylist> {
  onProgress?.('fetch', 0, 0)
  const result = await window.ownly!.spotifyPlaylist({ playlistId: id, requestId: requestId ?? '' }, (progress) => {
    if (progress.phase === 'tracks') onProgress?.('fetch', progress.done, progress.total)
  })

  if (!result.ok) {
    switch (result.error) {
      case 'region':
        throw new ImportError(
          'blocked',
          'Spotify не отдал плейлист: он ограничивает вашу сеть, а бесплатные обходные сервисы ' +
            'сейчас заняты. Попробуйте ещё раз через минуту — токен сохранится, и дальше чтение ' +
            'будет мгновенным. Или возьмите плейлист из Deezer, YouTube или Яндекс Музыки.',
        )
      case 'not-found':
        throw new ImportError('not-found', 'Плейлист не найден или закрыт — доступны только публичные.')
      case 'empty':
        throw new ImportError('empty', 'В плейлисте нет треков.')
      case 'bad-playlist':
        throw new ImportError('unsupported', 'В ссылке нет идентификатора плейлиста.')
      case 'canceled':
        throw new ImportError('canceled', 'Импорт остановлен.')
      default:
        throw new ImportError('network', `Spotify не ответил как ожидалось: ${result.error ?? 'неизвестно'}.`)
    }
  }

  const entries = (result.entries ?? []).filter((entry) => entry.title)
  if (entries.length === 0) throw new ImportError('empty', 'В плейлисте нет треков.')

  return {
    source: 'spotify',
    name: result.name ?? 'Плейлист Spotify',
    entries,
    cover: result.cover ?? undefined,
    url: originalUrl,
  }
}

/* ------------------------------------------------------------------ */
/* Pasted list                                                         */
/* ------------------------------------------------------------------ */

/**
 * A list of songs typed or copied from anywhere, or a JSON export produced by
 * a backup tool.
 *
 * Pasting text needs nothing from anyone, so it stays the universal fallback
 * for any service that has no public link to read.
 */
function fetchText(raw: string): ImportedPlaylist {
  const trimmed = raw.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const fromJson = parseJsonExport(trimmed)
    if (fromJson) return fromJson
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    // Backup tools write headers such as "Playlists:" that are not songs.
    .filter((line) => line.length > 1 && !/^playlists?:$/i.test(line))

  if (lines.length === 0) throw new ImportError('empty', 'Не нашёл ни одной строки с песней.')

  const entries: ImportedEntry[] = lines.slice(0, 500).map((line) => ({
    title: line,
    artists: [],
    duration: 0,
  }))

  return { source: 'text', name: 'Импортированный список', entries, url: '' }
}

interface BackupTrack {
  name?: string
  title?: string
  artists?: Array<{ name?: string } | string>
  artist?: string
  duration_ms?: number
}

/** Reads the shapes that playlist backup tools produce. */
function parseJsonExport(text: string): ImportedPlaylist | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }

  const collected: BackupTrack[] = []
  let name = 'Импортированный плейлист'

  const takeTracks = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const row of list) {
      // spotify-backup wraps every row as { track: {...} }.
      const candidate = (row as { track?: BackupTrack })?.track ?? (row as BackupTrack)
      if (candidate && typeof candidate === 'object') collected.push(candidate)
    }
  }

  if (Array.isArray(data)) {
    takeTracks(data)
  } else if (data && typeof data === 'object') {
    const root = data as Record<string, unknown>
    if (Array.isArray(root.playlists)) {
      // Several playlists in one file: merge them, keep the first real name.
      for (const playlist of root.playlists) {
        const entry = playlist as { name?: string; tracks?: unknown }
        if (typeof entry.name === 'string' && name === 'Импортированный плейлист') name = entry.name
        takeTracks(entry.tracks)
      }
    }
    if (Array.isArray(root.tracks)) takeTracks(root.tracks)
    if (Array.isArray(root.items)) takeTracks(root.items)
    if (typeof root.name === 'string' && collected.length > 0) name = root.name
  }

  const entries: ImportedEntry[] = []
  for (const row of collected) {
    const title = (row.name ?? row.title ?? '').trim()
    if (!title) continue
    const artists = (row.artists ?? [])
      .map((artist) => (typeof artist === 'string' ? artist : artist?.name ?? '').trim())
      .filter(Boolean)
    if (artists.length === 0 && row.artist) artists.push(String(row.artist).trim())
    entries.push({
      title,
      artists,
      duration: Math.round(Number(row.duration_ms ?? 0) / 1000),
    })
  }

  if (entries.length === 0) return null
  return { source: 'text', name, entries, url: '' }
}

/* ------------------------------------------------------------------ */
/* Resolving entries against the catalogue                             */
/* ------------------------------------------------------------------ */

/**
 * Turns playlist entries into something Ownly can play. Entries that already
 * carry a catalogue id skip the search entirely, and everything else resolves
 * in small parallel batches so a long import does not take forever.
 */
export interface ResolveOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

export async function resolveEntries(
  playlist: ImportedPlaylist,
  options: ResolveOptions | ((done: number, total: number) => void) = {},
): Promise<Track[]> {
  const { onProgress, signal } = typeof options === 'function' ? { onProgress: options, signal: undefined } : options
  const isCanceled = () => Boolean(signal?.aborted)

  if (isCanceled()) return []
  const unique: ImportedEntry[] = []
  const seen = new Set<string>()
  for (const entry of playlist.entries) {
    const key = entry.videoId ?? `${entry.artists[0] ?? ''}::${entry.title}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(entry)
  }

  const out: Track[] = []
  const BATCH = 6
  for (let start = 0; start < unique.length; start += BATCH) {
    if (isCanceled()) break
    const batch = unique.slice(start, start + BATCH)
    const resolved = await Promise.all(
      batch.map(async (entry) => {
        // A YouTube playlist already tells us exactly which video it means, so
        // there is nothing to search for — just build the track.
        if (entry.videoId) return fromVideoId(entry)

        const artist = entry.artists[0] ?? ''
        const query = `${artist} ${entry.title}`.trim()
        try {
          const results = await youtubeSearch(query, 6)
          return pickBest(results, entry)
        } catch {
          return null
        }
      }),
    )
    for (const track of resolved) if (track) out.push(track)
    onProgress?.(Math.min(start + BATCH, unique.length), unique.length)
  }

  return out
}

/** Builds a playable track straight from a known catalogue id. */
function fromVideoId(entry: ImportedEntry): Track {
  const channel = (entry.artists[0] ?? '').trim()
  const parsed = toTrack(
    {
      id: entry.videoId!,
      title: entry.title,
      duration: entry.duration,
      channel,
      thumbnail: `https://i.ytimg.com/vi/${entry.videoId}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${entry.videoId}`,
    },
    channel,
  )
  return parsed
}

/** Prefers a result whose duration is close, which usually means the real song. */
function pickBest(results: Track[], entry: ImportedEntry): Track | null {
  if (results.length === 0) return null
  if (entry.videoId) {
    const exact = results.find((track) => track.youtubeId === entry.videoId)
    if (exact) return exact
  }

  const title = entry.title.toLowerCase()
  let best = results[0]
  let bestScore = -1

  for (const track of results) {
    let score = 0
    const candidate = track.title.toLowerCase()
    if (candidate === title) score += 5
    else if (candidate.startsWith(title) || title.startsWith(candidate)) score += 3
    if (entry.artists.some((name) => track.artist.toLowerCase().includes(name.toLowerCase()))) score += 3
    if (entry.duration > 0 && track.duration > 0) {
      const delta = Math.abs(track.duration - entry.duration)
      if (delta <= 4) score += 4
      else if (delta <= 12) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      best = track
    }
  }
  return best
}
