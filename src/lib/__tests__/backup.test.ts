import { describe, expect, it } from 'vitest'
import { createLibraryBackup, parseLibraryBackup, type LibrarySnapshot } from '../backup'
import type { AlbumSummary, Artist, Playlist, Track } from '../types'

const track: Track = {
  id: 'yt:one', title: 'Song', artist: 'Artist', artists: ['Artist'], album: 'Album', albumId: 'album-1', trackNumber: 1,
  duration: 120, url: 'https://r3---sn.example.googlevideo.com/videoplayback?expire=999&sig=secret', cover: 'cover',
  source: 'youtube', youtubeId: 'one', sourceUrl: 'https://www.youtube.com/watch?v=one',
}
const album: AlbumSummary = { id: 'album-1', title: 'Album', artist: 'Artist', cover: 'cover', source: 'youtube' }
const artist: Artist = { id: 'artist-1', name: 'Artist', albumCount: 1, source: 'youtube' }
const playlist: Playlist = { id: 'playlist-1', name: 'Mix', trackIds: [track.id], createdAt: 1, updatedAt: 2 }
const snapshot: LibrarySnapshot = {
  likedTracks: { [track.id]: track }, likedOrder: [track.id], likedAlbums: { [album.id]: album }, playlists: [playlist],
  followedArtists: { [artist.id]: artist }, recentTracks: [{ track, at: 3 }], recentAlbums: [album], trackCache: { [track.id]: track },
}

function backup() { return JSON.stringify(createLibraryBackup(snapshot, new Date('2025-01-01T00:00:00.000Z'))) }

 describe('library backup', () => {
  it('roundtrips the complete schema and strips transient YouTube URLs', () => {
    const restored = parseLibraryBackup(backup())
    expect(restored.likedTracks[track.id].url).toBe('')
    expect(restored.likedTracks[track.id].sourceUrl).toContain('youtube.com/watch')
    expect(restored.recentTracks[0].track.youtubeId).toBe('one')
    expect(restored.playlists).toEqual([playlist])
    expect(restored.likedAlbums).toEqual({ [album.id]: album })
    expect(restored.followedArtists).toEqual({ [artist.id]: artist })
  })

  it('rejects malformed JSON, schema and version', () => {
    expect(() => parseLibraryBackup('{')).toThrow(/корректным JSON/)
    expect(() => parseLibraryBackup(backup().replace('ownly-library', 'other'))).toThrow(/не резервная копия/)
    expect(() => parseLibraryBackup(backup().replace('"version":1', '"version":99'))).toThrow(/не поддерживается/)
  })

  it('rejects corruption instead of silently dropping user data', () => {
    expect(() => parseLibraryBackup(backup().replace('["yt:one"]', '["missing"]'))).toThrow(/отсутствующие треки/)
    expect(() => parseLibraryBackup(backup().replace('"trackIds":["yt:one"]', '"trackIds":["missing"]'))).toThrow(/отсутствующий трек/)
    expect(() => parseLibraryBackup(backup().replace('"at":3', '"at":"bad"'))).toThrow(/at/)
  })

  it('rejects dangerous keys and prototype pollution payloads', () => {
    const payload = backup().replace('"likedTracks":{', '"likedTracks":{"__proto__":{},')
    expect(() => parseLibraryBackup(payload)).toThrow(/запрещённое поле/)
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('rejects oversized backups and unknown fields', () => {
    expect(() => parseLibraryBackup('x'.repeat(25 * 1024 * 1024 + 1))).toThrow(/слишком велика/)
    expect(() => parseLibraryBackup(backup().replace('"schema":"ownly-library"', '"schema":"ownly-library","extra":1'))).toThrow(/неизвестное поле/)
  })

  it('does not leak signed URLs when creating a backup', () => {
    const exported = JSON.stringify(createLibraryBackup(snapshot))
    expect(exported).not.toContain('googlevideo')
    expect(exported).not.toContain('sig=secret')
  })
})
