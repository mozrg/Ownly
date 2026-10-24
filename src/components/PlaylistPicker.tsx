import { useState } from 'react'
import { create } from 'zustand'
import type { Track } from '../lib/types'
import { useLibrary } from '../state/library'
import { toast } from '../state/ui'
import { Modal } from './Modal'
import { IconPlus, IconList, IconCheck } from './Icons'
import { trackCountLabel } from '../lib/format'

interface PickerStore {
  tracks: Track[] | null
  open: (tracks: Track[]) => void
  close: () => void
}

const usePicker = create<PickerStore>((set) => ({
  tracks: null,
  open: (tracks) => set({ tracks }),
  close: () => set({ tracks: null }),
}))

export function openPlaylistPicker(tracks: Track[]) {
  if (tracks.length === 0) return
  usePicker.getState().open(tracks)
}

export function PlaylistPickerHost() {
  const tracks = usePicker((state) => state.tracks)
  const close = usePicker((state) => state.close)
  const playlists = useLibrary((state) => state.playlists)
  const addTracksToPlaylist = useLibrary((state) => state.addTracksToPlaylist)
  const createPlaylist = useLibrary((state) => state.createPlaylist)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    createPlaylist(trimmed, tracks ?? [])
    toast(`Плейлист «${trimmed}» создан`)
    setCreating(false)
    setName('')
    close()
  }

  return (
    <Modal
      open={Boolean(tracks)}
      onClose={() => {
        close()
        setCreating(false)
        setName('')
      }}
      title="Добавить в плейлист"
      description={tracks ? trackCountLabel(tracks.length) : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }} className="scroll-area">
        {playlists.length === 0 && !creating && (
          <div style={{ padding: '18px 4px', color: 'var(--text-3)', fontSize: 13 }}>
            Пока нет плейлистов — создайте первый.
          </div>
        )}
        {playlists.map((playlist) => {
          const already = tracks?.every((track) => playlist.trackIds.includes(track.id))
          return (
            <button
              key={playlist.id}
              className="queue-item"
              onClick={() => {
                if (!tracks) return
                addTracksToPlaylist(playlist.id, tracks)
                toast(`Добавлено в «${playlist.name}»`)
                close()
              }}
            >
              <div className="queue-item__art" style={{ display: 'grid', placeItems: 'center' }}>
                <IconList size={16} />
              </div>
              <div className="queue-item__text">
                <div className="queue-item__title">{playlist.name}</div>
                <div className="queue-item__artist">{trackCountLabel(playlist.trackIds.length)}</div>
              </div>
              {already && <IconCheck size={16} />}
            </button>
          )
        })}
      </div>

      {creating ? (
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <input
            className="input"
            autoFocus
            placeholder="Название плейлиста"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleCreate()
              if (event.key === 'Escape') setCreating(false)
            }}
          />
          <button className="btn btn--primary" onClick={handleCreate} disabled={!name.trim()}>
            Создать
          </button>
        </div>
      ) : (
        <button className="btn btn--secondary" style={{ marginTop: 14, width: '100%' }} onClick={() => setCreating(true)}>
          <IconPlus size={15} /> Новый плейлист
        </button>
      )}
    </Modal>
  )
}
