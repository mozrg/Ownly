/** Imperative playback helpers shared by cards, rows and pages. */
import { usePlayer } from '../state/player'
import { useLibrary } from '../state/library'
import { toast } from '../state/ui'
import type { Album, QueueItem, Track } from './types'

export function toQueueItem(track: Track, contextLabel?: string, contextId?: string): QueueItem {
  return { ...track, contextLabel, contextId, kind: 'catalog' }
}

export function playTrack(track: Track, contextLabel?: string, contextId?: string) {
  usePlayer.getState().playQueue([toQueueItem(track, contextLabel, contextId)], 0, {
    label: contextLabel,
    path: contextId ? `/album/${contextId}` : undefined,
  })
}

export function playTracks(tracks: Track[], startIndex = 0, contextLabel?: string, contextPath?: string) {
  if (tracks.length === 0) return
  const items = tracks.map((track) => toQueueItem(track, contextLabel))
  usePlayer.getState().playQueue(items, startIndex, { label: contextLabel, path: contextPath })
}

export function playAlbum(album: Album, startIndex = 0) {
  useLibrary.getState().recordAlbumView({
    id: album.id,
    title: album.title,
    artist: album.artist,
    year: album.year,
    cover: album.cover,
    downloads: album.downloads,
    subjects: album.subjects,
  })
  playTracks(album.tracks, startIndex, `Альбом «${album.title}»`, `/album/${album.id}`)
}

export function shuffleAlbum(album: Album) {
  const player = usePlayer.getState()
  const wasShuffle = player.shuffle
  if (!wasShuffle) player.toggleShuffle()
  playAlbum(album, 0)
}

export function playNext(track: Track) {
  usePlayer.getState().enqueueNext(toQueueItem(track))
  toast(`«${track.title}» — следующим`)
}

export function addToQueue(tracks: Track[]) {
  if (tracks.length === 0) return
  usePlayer.getState().enqueue(tracks.map((track) => toQueueItem(track)))
  toast(tracks.length === 1 ? `«${tracks[0].title}» в очереди` : `${tracks.length} треков в очереди`)
}

export function toggleLike(track: Track) {
  const liked = useLibrary.getState().toggleLike(track)
  toast(liked ? `В любимых: ${track.title}` : `Убрано из любимых`, liked ? 'like' : 'default')
  return liked
}

export function isLiked(trackId: string): boolean {
  return Boolean(useLibrary.getState().likedTracks[trackId])
}

export function albumLabel(album: { title: string; artist: string }) {
  return `${album.artist} — ${album.title}`
}

/** Resolves the "add to playlist" flow for a batch of tracks. */
export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Ссылка скопирована')
  } catch {
    toast('Не удалось скопировать', 'danger')
  }
}
