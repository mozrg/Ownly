/** Domain types shared across the app. */

export type ID = string

/** Which catalogue a track/album came from. */
export type Source = 'archive' | 'youtube'

export interface Artist {
  id: ID
  name: string
  albumCount: number
  source?: Source
  trackCount?: number
  cover?: string
  albums?: Album[]
}

export interface Track {
  /** Stable id: `${albumId}/${fileName}` */
  id: ID
  title: string
  artist: string
  /** Every credited artist, in billing order. `artist` is the joined form. */
  artists?: string[]
  album: string
  albumId: ID
  /** 1-based position inside the album. */
  trackNumber: number
  /** Duration in seconds (0 when unknown). */
  duration: number
  /** Direct, fully streamable audio url (no previews). */
  url: string
  /**
   * Every playable encode of this recording, best first. archive.org items
   * often ship mp3 + ogg + flac; when one derivative 404s the player rotates
   * to the next instead of dead-ending.
   */
  sources?: string[]
  cover: string
  /** Original file size in bytes, when reported. */
  size?: number
  /** Catalogue this recording came from. */
  source?: Source
  /** YouTube video id, when source is 'youtube'. */
  youtubeId?: string
  /** Licensing info from the source item. */
  license?: string
  /** Direct page on the source, used by "источник" links. */
  sourceUrl?: string
}

export interface Album {
  id: ID
  title: string
  artist: string
  year?: number
  cover: string
  tracks: Track[]
  downloads?: number
  subjects: string[]
  source?: Source
  license?: string
  description?: string
  sourceUrl: string
}

/** Lightweight album used in grids before the full tracklist is loaded. */
export interface AlbumSummary {
  id: ID
  title: string
  artist: string
  year?: number
  cover: string
  downloads?: number
  subjects?: string[]
  source?: Source
}

export interface Playlist {
  id: ID
  name: string
  description?: string
  trackIds: ID[]
  createdAt: number
  updatedAt: number
  /** Custom cover; when absent the first track's artwork is used. */
  cover?: string
}

export interface LyricLine {
  time: number
  text: string
}

export interface Lyrics {
  lines: LyricLine[]
  synced: boolean
  source: string
  /** True when timings were stretched to match a slowed/sped-up version. */
  adjusted?: boolean
}

export type RepeatMode = 'off' | 'all' | 'one'

export type PlaybackSourceKind = 'catalog'

export interface QueueItem extends Track {
  /** Where the queue came from, for labels like "Из альбома X". */
  contextId?: string
  contextLabel?: string
  kind?: PlaybackSourceKind
}
