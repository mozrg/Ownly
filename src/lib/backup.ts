import type { Album, AlbumSummary, Artist, Playlist, Track } from './types'

export const LIBRARY_BACKUP_SCHEMA = 'ownly-library'
export const LIBRARY_BACKUP_VERSION = 1

const MAX_TEXT = 100_000
const MAX_TRACKS = 10_000
const MAX_ALBUMS = 2_000
const MAX_ARTISTS = 2_000
const MAX_PLAYLISTS = 500
const MAX_PLAYLIST_TRACKS = 10_000
const MAX_RECENT_TRACKS = 80
const MAX_RECENT_ALBUMS = 30
const MAX_BACKUP_BYTES = 25 * 1024 * 1024
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const TRACK_KEYS = new Set([
  'id', 'title', 'artist', 'artists', 'album', 'albumId', 'trackNumber', 'duration', 'url', 'cover', 'size', 'source',
  'youtubeId', 'license', 'sourceUrl',
])
const ALBUM_SUMMARY_KEYS = new Set(['id', 'title', 'artist', 'year', 'cover', 'downloads', 'subjects', 'source'])
const ARTIST_KEYS = new Set(['id', 'name', 'albumCount', 'source', 'trackCount', 'cover', 'albums'])
const PLAYLIST_KEYS = new Set(['id', 'name', 'description', 'trackIds', 'createdAt', 'updatedAt', 'cover'])

export interface LibrarySnapshot {
  likedTracks: Record<string, Track>
  likedOrder: string[]
  likedAlbums: Record<string, AlbumSummary>
  playlists: Playlist[]
  followedArtists: Record<string, Artist>
  recentTracks: Array<{ track: Track; at: number }>
  recentAlbums: AlbumSummary[]
  trackCache: Record<string, Track>
}

export interface LibraryBackup extends LibrarySnapshot {
  schema: typeof LIBRARY_BACKUP_SCHEMA
  version: typeof LIBRARY_BACKUP_VERSION
  exportedAt: string
}

function fail(message: string): never {
  throw new Error(`Резервная копия повреждена: ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function checkObject(value: unknown, label: string, keys: Set<string>): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} имеет неверный формат.`)
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) fail(`${label} содержит запрещённое поле.`)
    if (!keys.has(key)) fail(`${label} содержит неизвестное поле «${key}».`)
  }
}

function text(value: unknown, label: string, required = true): string | undefined {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string' || value.length > MAX_TEXT) fail(`${label} имеет неверный формат.`)
  return value
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} имеет неверный формат.`)
  return value
}

function source(value: unknown, label: string): 'archive' | 'youtube' | undefined {
  if (value === undefined) return undefined
  if (value !== 'archive' && value !== 'youtube') fail(`${label} имеет неверный источник.`)
  return value
}

function validateTrack(value: unknown, label = 'трек'): Track {
  checkObject(value, label, TRACK_KEYS)
  const v = value as Record<string, unknown>
  const track = {
    id: text(v.id, `${label}.id`)!, title: text(v.title, `${label}.title`)!, artist: text(v.artist, `${label}.artist`)!,
    album: text(v.album, `${label}.album`)!, albumId: text(v.albumId, `${label}.albumId`)!,
    trackNumber: finiteNumber(v.trackNumber, `${label}.trackNumber`), duration: finiteNumber(v.duration, `${label}.duration`),
    url: text(v.url, `${label}.url`)!, cover: text(v.cover, `${label}.cover`)!,
    ...(v.artists === undefined ? {} : { artists: validateStringArray(v.artists, `${label}.artists`) }),
    ...(v.size === undefined ? {} : { size: finiteNumber(v.size, `${label}.size`) }),
    ...(v.source === undefined ? {} : { source: source(v.source, `${label}.source`) }),
    ...(v.youtubeId === undefined ? {} : { youtubeId: text(v.youtubeId, `${label}.youtubeId`) }),
    ...(v.license === undefined ? {} : { license: text(v.license, `${label}.license`) }),
    ...(v.sourceUrl === undefined ? {} : { sourceUrl: text(v.sourceUrl, `${label}.sourceUrl`) }),
  } as Track
  if (track.id.length === 0 || track.albumId.length === 0) fail(`${label} содержит пустой идентификатор.`)
  return track
}

function validateStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_PLAYLIST_TRACKS || value.some((item) => typeof item !== 'string' || item.length > MAX_TEXT)) {
    fail(`${label} имеет неверный формат.`)
  }
  return [...value] as string[]
}

function validateAlbum(value: unknown, label: string): Album {
  checkObject(value, label, new Set(['id', 'title', 'artist', 'year', 'cover', 'tracks', 'downloads', 'subjects', 'source', 'license', 'description', 'sourceUrl']))
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.tracks) || v.tracks.length > MAX_TRACKS) fail(`${label}.tracks имеет неверный формат.`)
  return {
    id: text(v.id, `${label}.id`)!, title: text(v.title, `${label}.title`)!, artist: text(v.artist, `${label}.artist`)!,
    cover: text(v.cover, `${label}.cover`)!, sourceUrl: text(v.sourceUrl, `${label}.sourceUrl`)!,
    tracks: v.tracks.map((track, i) => validateTrack(track, `${label}.tracks[${i}]`)),
    ...(v.year === undefined ? {} : { year: finiteNumber(v.year, `${label}.year`) }),
    ...(v.downloads === undefined ? {} : { downloads: finiteNumber(v.downloads, `${label}.downloads`) }),
    subjects: validateStringArray(v.subjects, `${label}.subjects`),
    ...(v.source === undefined ? {} : { source: source(v.source, `${label}.source`) }),
    ...(v.license === undefined ? {} : { license: text(v.license, `${label}.license`) }),
    ...(v.description === undefined ? {} : { description: text(v.description, `${label}.description`) }),
  }
}

function validateAlbumSummary(value: unknown, label: string): AlbumSummary {
  checkObject(value, label, ALBUM_SUMMARY_KEYS)
  const v = value as Record<string, unknown>
  return {
    id: text(v.id, `${label}.id`)!, title: text(v.title, `${label}.title`)!, artist: text(v.artist, `${label}.artist`)!, cover: text(v.cover, `${label}.cover`)!,
    ...(v.year === undefined ? {} : { year: finiteNumber(v.year, `${label}.year`) }),
    ...(v.downloads === undefined ? {} : { downloads: finiteNumber(v.downloads, `${label}.downloads`) }),
    ...(v.subjects === undefined ? {} : { subjects: validateStringArray(v.subjects, `${label}.subjects`) }),
    ...(v.source === undefined ? {} : { source: source(v.source, `${label}.source`) }),
  }
}

function validateArtist(value: unknown, label: string): Artist {
  checkObject(value, label, ARTIST_KEYS)
  const v = value as Record<string, unknown>
  return {
    id: text(v.id, `${label}.id`)!, name: text(v.name, `${label}.name`)!, albumCount: finiteNumber(v.albumCount, `${label}.albumCount`),
    ...(v.source === undefined ? {} : { source: source(v.source, `${label}.source`) }),
    ...(v.trackCount === undefined ? {} : { trackCount: finiteNumber(v.trackCount, `${label}.trackCount`) }),
    ...(v.cover === undefined ? {} : { cover: text(v.cover, `${label}.cover`) }),
    ...(v.albums === undefined ? {} : { albums: validateArray(v.albums, `${label}.albums`, MAX_ALBUMS, validateAlbum) }),
  }
}

function validateArray<T>(value: unknown, label: string, max: number, validator: (v: unknown, label: string) => T): T[] {
  if (!Array.isArray(value) || value.length > max) fail(`${label} имеет неверный формат.`)
  return value.map((item, index) => validator(item, `${label}[${index}]`))
}

function validateMap<T>(value: unknown, label: string, max: number, validator: (v: unknown, label: string) => T, idOf: (v: T) => string): Record<string, T> {
  if (!isRecord(value)) fail(`${label} имеет неверный формат.`)
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) fail(`${label} содержит запрещённое поле.`)
  }
  const entries = Object.entries(value)
  if (entries.length > max) fail(`${label} слишком велик.`)
  const result = Object.create(null) as Record<string, T>
  for (const [id, item] of entries) {
    if (!id || id.length > MAX_TEXT || DANGEROUS_KEYS.has(id)) fail(`${label} содержит неверный идентификатор.`)
    const parsed = validator(item, `${label}[${id}]`)
    if (idOf(parsed) !== id) fail(`${label}[${id}] не совпадает с идентификатором объекта.`)
    result[id] = parsed
  }
  return result
}

function sanitizeTrack(track: Track): Track {
  const signedStream = /(?:^|\.)googlevideo\.com(?:\/|$)/i.test(track.url)
  return track.source === 'youtube' || track.youtubeId !== undefined || signedStream ? { ...track, url: '' } : { ...track }
}

function sanitizeSnapshot(snapshot: LibrarySnapshot): LibrarySnapshot {
  return {
    likedTracks: Object.fromEntries(Object.entries(snapshot.likedTracks).map(([id, track]) => [id, sanitizeTrack(track)])),
    likedOrder: [...snapshot.likedOrder], likedAlbums: Object.fromEntries(Object.entries(snapshot.likedAlbums).map(([id, album]) => [id, { ...album }])),
    playlists: snapshot.playlists.map((playlist) => ({ ...playlist, trackIds: [...playlist.trackIds] })),
    followedArtists: Object.fromEntries(Object.entries(snapshot.followedArtists).map(([id, artist]) => [id, { ...artist }])),
    recentTracks: snapshot.recentTracks.map((entry) => ({ at: entry.at, track: sanitizeTrack(entry.track) })),
    recentAlbums: snapshot.recentAlbums.map((album) => ({ ...album })),
    trackCache: Object.fromEntries(Object.entries(snapshot.trackCache).map(([id, track]) => [id, sanitizeTrack(track)])),
  }
}

function validateSnapshot(raw: Record<string, unknown>): LibrarySnapshot {
  const likedTracks = validateMap(raw.likedTracks, 'likedTracks', MAX_TRACKS, validateTrack, (track) => track.id)
  const trackCache = validateMap(raw.trackCache, 'trackCache', MAX_TRACKS, validateTrack, (track) => track.id)
  const likedAlbums = validateMap(raw.likedAlbums, 'likedAlbums', MAX_ALBUMS, validateAlbumSummary, (album) => album.id)
  const followedArtists = validateMap(raw.followedArtists, 'followedArtists', MAX_ARTISTS, validateArtist, (artist) => artist.id)
  const likedOrder = validateStringArray(raw.likedOrder, 'likedOrder')
  if (new Set(likedOrder).size !== likedOrder.length || likedOrder.some((id) => !likedTracks[id])) fail('likedOrder содержит ссылки на отсутствующие треки.')
  const playlists = validateArray(raw.playlists, 'playlists', MAX_PLAYLISTS, (value, label) => {
    checkObject(value, label, PLAYLIST_KEYS)
    const v = value as Record<string, unknown>
    const trackIds = validateStringArray(v.trackIds, `${label}.trackIds`)
    return { id: text(v.id, `${label}.id`)!, name: text(v.name, `${label}.name`)!, trackIds,
      createdAt: finiteNumber(v.createdAt, `${label}.createdAt`), updatedAt: finiteNumber(v.updatedAt, `${label}.updatedAt`),
      ...(v.description === undefined ? {} : { description: text(v.description, `${label}.description`) }),
      ...(v.cover === undefined ? {} : { cover: text(v.cover, `${label}.cover`) }),
    } as Playlist
  })
  const playlistIds = new Set<string>()
  for (const playlist of playlists) {
    if (!playlist.id || playlistIds.has(playlist.id)) fail('Плейлисты содержат повторяющиеся идентификаторы.')
    playlistIds.add(playlist.id)
    if (new Set(playlist.trackIds).size !== playlist.trackIds.length || playlist.trackIds.some((id) => !trackCache[id] && !likedTracks[id])) fail(`Плейлист «${playlist.name}» содержит отсутствующий трек.`)
  }
  const recentTracks = validateArray(raw.recentTracks, 'recentTracks', MAX_RECENT_TRACKS, (value, label) => {
    checkObject(value, label, new Set(['track', 'at']))
    const v = value as Record<string, unknown>
    const track = validateTrack(v.track, `${label}.track`)
    finiteNumber(v.at, `${label}.at`)
    if (!trackCache[track.id] && !likedTracks[track.id]) fail(`${label} содержит трек, отсутствующий в библиотеке.`)
    return { track, at: v.at as number }
  })
  const recentAlbums = validateArray(raw.recentAlbums, 'recentAlbums', MAX_RECENT_ALBUMS, validateAlbumSummary)
  return { likedTracks, likedOrder, likedAlbums, playlists, followedArtists, recentTracks, recentAlbums, trackCache }
}

export function createLibraryBackup(snapshot: LibrarySnapshot, now = new Date()): LibraryBackup {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Дата резервной копии имеет неверный формат.')
  const sanitized = sanitizeSnapshot(validateSnapshot(snapshot as unknown as Record<string, unknown>))
  return { schema: LIBRARY_BACKUP_SCHEMA, version: LIBRARY_BACKUP_VERSION, exportedAt: now.toISOString(), ...sanitized }
}

export function parseLibraryBackup(textValue: string): LibrarySnapshot {
  if (typeof textValue !== 'string' || textValue.length > MAX_BACKUP_BYTES) throw new Error('Резервная копия слишком велика.')
  let raw: unknown
  try { raw = JSON.parse(textValue) } catch { throw new Error('Файл не является корректным JSON.') }
  if (!isRecord(raw)) throw new Error('Это не резервная копия Ownly.')
  checkObject(raw, 'резервная копия', new Set(['schema', 'version', 'exportedAt', 'likedTracks', 'likedOrder', 'likedAlbums', 'playlists', 'followedArtists', 'recentTracks', 'recentAlbums', 'trackCache']))
  if (raw.schema !== LIBRARY_BACKUP_SCHEMA) throw new Error('Это не резервная копия Ownly.')
  if (raw.version !== LIBRARY_BACKUP_VERSION) throw new Error(`Версия резервной копии не поддерживается: ${String(raw.version)}.`)
  if (typeof raw.exportedAt !== 'string' || !Number.isFinite(Date.parse(raw.exportedAt))) fail('Дата экспорта имеет неверный формат.')
  return sanitizeSnapshot(validateSnapshot(raw))
}
