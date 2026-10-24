import { describe, expect, it } from 'vitest'
import { detectSource, resolveEntries, type ImportedPlaylist } from '../import'

describe('playlist import detection', () => {
  it('detects supported public links', () => {
    expect(detectSource('https://open.spotify.com/playlist/abc')).toBe('spotify')
    expect(detectSource('https://music.yandex.ru/users/user/playlists/12')).toBe('yandex')
    expect(detectSource('https://www.deezer.com/playlist/123')).toBe('deezer')
    expect(detectSource('https://www.youtube.com/playlist?list=abc')).toBe('youtube')
  })

  it('treats pasted lines as text, but rejects unknown URLs', () => {
    expect(detectSource('Artist - Song\nArtist - Other')).toBe('text')
    expect(detectSource('https://example.com/playlist/1')).toBeNull()
    expect(detectSource('')).toBeNull()
  })
})

describe('playlist entry resolution', () => {
  it('builds tracks directly when a YouTube playlist already has video ids', async () => {
    const playlist: ImportedPlaylist = {
      source: 'youtube',
      name: 'Known videos',
      url: 'https://www.youtube.com/playlist?list=x',
      entries: [
        { title: 'Video one', artists: ['Artist'], duration: 120, videoId: 'abc123' },
        { title: 'Video two', artists: ['Artist'], duration: 90, videoId: 'def456' },
      ],
    }
    const progress: Array<[number, number]> = []
    const tracks = await resolveEntries(playlist, (done, total) => progress.push([done, total]))
    expect(tracks.map((track) => track.youtubeId)).toEqual(['abc123', 'def456'])
    expect(progress.at(-1)).toEqual([2, 2])
  })

  it('keeps completed tracks and stops before the next batch', async () => {
    const controller = new AbortController()
    const playlist: ImportedPlaylist = {
      source: 'youtube',
      name: 'Cancelable',
      url: '',
      entries: Array.from({ length: 14 }, (_, index) => ({
        title: `Video ${index}`,
        artists: ['Artist'],
        duration: 60,
        videoId: `video-${index}`,
      })),
    }
    const tracks = await resolveEntries(playlist, {
      signal: controller.signal,
      onProgress: (done) => {
        if (done >= 6) controller.abort()
      },
    })
    expect(tracks).toHaveLength(6)
  })
})
