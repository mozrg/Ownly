/** User collection: likes, playlists, history, follows. Persisted locally. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LibrarySnapshot } from '../lib/backup'
import type { AlbumSummary, Artist, Playlist, Track } from '../lib/types'

interface RecentTrack {
  track: Track
  at: number
}

interface LibraryState {
  likedTracks: Record<string, Track>
  /** Insertion order of likes, newest last. */
  likedOrder: string[]
  likedAlbums: Record<string, AlbumSummary>
  playlists: Playlist[]
  followedArtists: Record<string, Artist>
  recentTracks: RecentTrack[]
  recentAlbums: AlbumSummary[]
  trackCache: Record<string, Track>

  toggleLike: (track: Track) => boolean
  toggleAlbumLike: (album: AlbumSummary) => boolean
  createPlaylist: (name: string, tracks?: Track[]) => string
  deletePlaylist: (id: string) => void
  renamePlaylist: (id: string, name: string) => void
  setPlaylistDescription: (id: string, description: string) => void
  addTracksToPlaylist: (id: string, tracks: Track[]) => void
  removeTrackFromPlaylist: (id: string, trackId: string) => void
  movePlaylistTrack: (id: string, from: number, to: number) => void
  toggleFollowArtist: (artist: Artist) => boolean
  recordPlay: (track: Track) => void
  recordAlbumView: (album: AlbumSummary) => void
  rememberTracks: (tracks: Track[]) => void
  clearHistory: () => void
  replaceSnapshot: (snapshot: LibrarySnapshot) => void
}

const MAX_RECENT_TRACKS = 80
const MAX_RECENT_ALBUMS = 30
const MAX_TRACK_CACHE = 4000

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      likedTracks: {},
      likedOrder: [],
      likedAlbums: {},
      playlists: [],
      followedArtists: {},
      recentTracks: [],
      recentAlbums: [],
      trackCache: {},

      toggleLike: (track) => {
        const existing = get().likedTracks[track.id]
        const next = { ...get().likedTracks }
        if (existing) delete next[track.id]
        else next[track.id] = track
        const likedOrder = existing ? get().likedOrder.filter((id) => id !== track.id) : [...get().likedOrder, track.id]
        set({ likedTracks: next, likedOrder })
        return !existing
      },

      toggleAlbumLike: (album) => {
        const existing = get().likedAlbums[album.id]
        const next = { ...get().likedAlbums }
        if (existing) delete next[album.id]
        else next[album.id] = album
        set({ likedAlbums: next })
        return !existing
      },

      createPlaylist: (name, tracks = []) => {
        const now = Date.now()
        const playlist: Playlist = {
          id: uid('pl'),
          name: name.trim() || 'Новый плейлист',
          trackIds: tracks.map((track) => track.id),
          createdAt: now,
          updatedAt: now,
        }
        const cache = { ...get().trackCache }
        for (const track of tracks) cache[track.id] = track
        set({ playlists: [playlist, ...get().playlists], trackCache: cache })
        return playlist.id
      },

      deletePlaylist: (id) => set({ playlists: get().playlists.filter((playlist) => playlist.id !== id) }),

      renamePlaylist: (id, name) =>
        set({
          playlists: get().playlists.map((playlist) =>
            playlist.id === id ? { ...playlist, name: name.trim() || playlist.name, updatedAt: Date.now() } : playlist,
          ),
        }),

      setPlaylistDescription: (id, description) =>
        set({
          playlists: get().playlists.map((playlist) =>
            playlist.id === id ? { ...playlist, description, updatedAt: Date.now() } : playlist,
          ),
        }),

      addTracksToPlaylist: (id, tracks) => {
        const cache = { ...get().trackCache }
        for (const track of tracks) cache[track.id] = track
        set({
          trackCache: cache,
          playlists: get().playlists.map((playlist) => {
            if (playlist.id !== id) return playlist
            const existing = new Set(playlist.trackIds)
            const additions = tracks.map((track) => track.id).filter((trackId) => !existing.has(trackId))
            return { ...playlist, trackIds: [...playlist.trackIds, ...additions], updatedAt: Date.now() }
          }),
        })
      },

      removeTrackFromPlaylist: (id, trackId) =>
        set({
          playlists: get().playlists.map((playlist) =>
            playlist.id === id
              ? { ...playlist, trackIds: playlist.trackIds.filter((entry) => entry !== trackId), updatedAt: Date.now() }
              : playlist,
          ),
        }),

      movePlaylistTrack: (id, from, to) =>
        set({
          playlists: get().playlists.map((playlist) => {
            if (playlist.id !== id) return playlist
            const trackIds = [...playlist.trackIds]
            if (from < 0 || from >= trackIds.length || to < 0 || to >= trackIds.length) return playlist
            const [moved] = trackIds.splice(from, 1)
            trackIds.splice(to, 0, moved)
            return { ...playlist, trackIds, updatedAt: Date.now() }
          }),
        }),

      toggleFollowArtist: (artist) => {
        const next = { ...get().followedArtists }
        const existing = next[artist.id]
        if (existing) delete next[artist.id]
        else next[artist.id] = artist
        set({ followedArtists: next })
        return !existing
      },

      recordPlay: (track) => {
        const recentTracks = [{ track, at: Date.now() }, ...get().recentTracks.filter((entry) => entry.track.id !== track.id)].slice(
          0,
          MAX_RECENT_TRACKS,
        )
        set({ recentTracks, trackCache: { ...get().trackCache, [track.id]: track } })
      },

      recordAlbumView: (album) => {
        const recentAlbums = [album, ...get().recentAlbums.filter((entry) => entry.id !== album.id)].slice(0, MAX_RECENT_ALBUMS)
        set({ recentAlbums })
      },

      rememberTracks: (tracks) => {
        if (tracks.length === 0) return
        const cache = { ...get().trackCache }
        for (const track of tracks) cache[track.id] = track
        const keys = Object.keys(cache)
        if (keys.length > MAX_TRACK_CACHE) {
          for (const key of keys.slice(0, keys.length - MAX_TRACK_CACHE)) delete cache[key]
        }
        set({ trackCache: cache })
      },

      clearHistory: () => set({ recentTracks: [], recentAlbums: [] }),

      replaceSnapshot: (snapshot) => set(snapshot),
    }),
    {
      name: 'ownly.library',
      version: 1,
      /**
       * Anything stored by an older build is folded into the current shape
       * instead of being thrown away: a library is the one thing in the app
       * the user cannot get back.
       */
      migrate: (persisted, from) => {
        const previous = (persisted ?? {}) as Partial<LibraryState>
        const next = { ...previous } as Partial<LibraryState>

        // A list of ids with no matching track map would render empty rows.
        const tracks = previous.likedTracks ?? {}
        const order = Array.isArray(previous.likedOrder) ? previous.likedOrder : []
        next.likedTracks = tracks
        next.likedOrder = order.filter((id) => Boolean(tracks[id]))
        next.playlists = Array.isArray(previous.playlists) ? previous.playlists : []
        next.likedAlbums = previous.likedAlbums ?? {}
        next.followedArtists = previous.followedArtists ?? {}
        next.recentTracks = Array.isArray(previous.recentTracks) ? previous.recentTracks : []
        next.recentAlbums = Array.isArray(previous.recentAlbums) ? previous.recentAlbums : []
        next.trackCache = previous.trackCache ?? {}

        if (from !== 1) {
          // Nothing to convert between v0 and v1 yet — this is the hook that
          // makes the next schema change a one-line addition.
        }
        return next as LibraryState
      },
      partialize: (state) => ({
        likedTracks: state.likedTracks,
        likedOrder: state.likedOrder,
        likedAlbums: state.likedAlbums,
        playlists: state.playlists,
        followedArtists: state.followedArtists,
        recentTracks: state.recentTracks,
        recentAlbums: state.recentAlbums,
        trackCache: state.trackCache,
      }),
    },
  ),
)

/* ------------------------------------------------------------------ */
/* selectors                                                           */
/* ------------------------------------------------------------------ */

export function useIsLiked(trackId: string | undefined): boolean {
  return useLibrary((state) => (trackId ? Boolean(state.likedTracks[trackId]) : false))
}

export function useLikedTracks(): Track[] {
  const liked = useLibrary((state) => state.likedTracks)
  const order = useLibrary((state) => state.likedOrder)
  return [...order].reverse().map((id) => liked[id]).filter((track): track is Track => Boolean(track))
}

export function usePlaylistTracks(playlist: Playlist | undefined): Track[] {
  const cache = useLibrary((state) => state.trackCache)
  if (!playlist) return []
  return playlist.trackIds.map((id) => cache[id]).filter((track): track is Track => Boolean(track))
}

export function resolvePlaylistTracks(playlist: Playlist | undefined, cache: Record<string, Track>): Track[] {
  if (!playlist) return []
  return playlist.trackIds.map((id) => cache[id]).filter((track): track is Track => Boolean(track))
}

export function findPlaylist(id: string | undefined): Playlist | undefined {
  return useLibrary.getState().playlists.find((playlist) => playlist.id === id)
}
