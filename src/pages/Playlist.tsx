import { useEffect, useRef, useState } from 'react'
import { useLibrary } from '../state/library'
import { usePlayer } from '../state/player'
import { navigate, useRoute } from '../lib/router'
import { playTracks } from '../lib/actions'
import { EmptyState } from '../components/Layout'
import { TrackRow } from '../components/TrackRow'
import { Modal } from '../components/Modal'
import { Artwork } from '../components/Artwork'
import { IconPlay, IconShuffle, IconPencil, IconTrash, IconPlus, IconList, IconDownload } from '../components/Icons'
import { fetchPlaylist, resolveEntries, ImportError } from '../lib/import'
import { formatTotalDuration, trackCountLabel } from '../lib/format'

export function PlaylistPage() {
  const route = useRoute()
  const id = route.segments[1] ?? ''
  const playlist = useLibrary((state) => state.playlists.find((entry) => entry.id === id))
  const cache = useLibrary((state) => state.trackCache)
  const rename = useLibrary((state) => state.renamePlaylist)
  const remove = useLibrary((state) => state.removeTrackFromPlaylist)
  const deletePlaylist = useLibrary((state) => state.deletePlaylist)
  const setDescription = useLibrary((state) => state.setPlaylistDescription)
  const addTracksToPlaylist = useLibrary((state) => state.addTracksToPlaylist)

  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [importing, setImporting] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importError, setImportError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'fetch' | 'spotify' | 'resolve'>('fetch')
  const [importDone, setImportDone] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [done, setDone] = useState<{ added: number; total: number; missing: number } | null>(null)
  const [canceling, setCanceling] = useState(false)
  const importAbort = useRef<AbortController | null>(null)
  const importRequestId = useRef('')

  const progress = importTotal > 0 ? Math.round((importDone / importTotal) * 100) : stage === 'fetch' ? 4 : 0

  useEffect(() => () => {
    importAbort.current?.abort()
    if (importRequestId.current) void window.ownly?.spotifyCancel(importRequestId.current)
  }, [])

  const startImport = async () => {
    if (busy) return
    const controller = new AbortController()
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    importAbort.current = controller
    importRequestId.current = requestId
    setCanceling(false)
    setBusy(true)
    setDone(null)
    setImportError('')
    setStage('fetch')
    setImportDone(0)
    setImportTotal(0)

    try {
      const parsed = await fetchPlaylist(importUrl, {
        signal: controller.signal,
        requestId,
        onProgress: (_stage, fetched, total) => {
          setStage('spotify')
          setImportDone(fetched)
          setImportTotal(total)
        },
      })
      if (controller.signal.aborted) {
        setDone({ added: 0, total: parsed.entries.length, missing: parsed.entries.length })
        setImportError('Чтение плейлиста остановлено. Неполный список не добавлен.')
        return
      }
      setStage('resolve')
      setImportTotal(parsed.entries.length)
      // A long playlist takes minutes to match, so keep what was found even
      // if the import is stopped part-way.
      const tracks = await resolveEntries(parsed, {
        signal: controller.signal,
        onProgress: (resolved, total) => {
          setImportDone(resolved)
          setImportTotal(total)
        },
      })
      if (tracks.length > 0 && playlist) addTracksToPlaylist(playlist.id, tracks)
      setDone({
        added: tracks.length,
        total: parsed.entries.length,
        missing: Math.max(0, parsed.entries.length - tracks.length),
      })
    } catch (error) {
      setImportError(error instanceof ImportError ? error.message : 'Не удалось импортировать плейлист.')
    } finally {
      importAbort.current = null
      importRequestId.current = ''
      setCanceling(false)
      setBusy(false)
    }
  }

  if (!playlist) {
    return (
      <div className="page">
        <EmptyState
          icon={<IconList size={30} />}
          title="Плейлист не найден"
          text="Возможно, он был удалён."
          action={
            <button className="btn btn--secondary btn--sm" onClick={() => navigate('/library')}>
              К коллекции
            </button>
          }
        />
      </div>
    )
  }

  const tracks = playlist.trackIds.map((trackId) => cache[trackId]).filter(Boolean)
  const totalDuration = tracks.reduce((sum, track) => sum + track.duration, 0)
  const covers = tracks.slice(0, 4).map((track) => track.cover)

  return (
    <div className="page">
      <div className="album-hero" style={{ ['--tone-a' as string]: 'hsl(220 26% 18%)', ['--tone-b' as string]: 'hsl(260 24% 7%)' }}>
        <div className="album-hero__bg" />
        <div className="album-hero__veil" />
        <div className="album-hero__art" style={{ display: 'grid', gridTemplateColumns: covers.length >= 4 ? '1fr 1fr' : '1fr', gap: 0 }}>
          {covers.length >= 4 ? (
            covers.map((cover, index) => <Artwork key={index} src={cover} alt="" seed={`${playlist.id}-${index}`} />)
          ) : covers.length > 0 ? (
            <Artwork src={covers[0]} alt={playlist.name} seed={playlist.id} />
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg,#22222a,#101014)' }}>
              <IconList size={64} style={{ color: 'rgba(255,255,255,0.55)' }} />
            </div>
          )}
        </div>
        <div className="album-hero__body">
          <div className="album-hero__type">Плейлист</div>
          <h1 className="album-hero__title">{playlist.name}</h1>
          <div className="album-hero__meta">
            <span>{trackCountLabel(tracks.length)}</span>
            {totalDuration > 0 && (
              <>
                <span className="dot" />
                <span>{formatTotalDuration(totalDuration)}</span>
              </>
            )}
          </div>
          {playlist.description && <p style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{playlist.description}</p>}
        </div>
      </div>

      <div className="album-toolbar">
        <button
          className="album-toolbar__play"
          onClick={() => playTracks(tracks, 0, playlist.name, `/playlist/${playlist.id}`)}
          disabled={tracks.length === 0}
          aria-label="Слушать плейлист"
        >
          <IconPlay size={20} style={{ marginLeft: 2 }} />
        </button>
        <button
          className="icon-btn"
          style={{ width: 38, height: 38 }}
          onClick={() => {
            const player = usePlayer.getState()
            if (!player.shuffle) player.toggleShuffle()
            playTracks(tracks, 0, playlist.name, `/playlist/${playlist.id}`)
          }}
          disabled={tracks.length === 0}
          aria-label="Перемешать"
        >
          <IconShuffle size={18} />
        </button>
        <button
          className="btn btn--secondary btn--sm"
          onClick={() => {
            setImportUrl('')
            setImportError('')
            setImporting(true)
          }}
          aria-label="Импортировать плейлист"
        >
          <IconDownload size={15} /> Импортировать
        </button>
        <button
          className="icon-btn"
          style={{ width: 38, height: 38 }}
          onClick={() => {
            setDraftName(playlist.name)
            setDraftDescription(playlist.description ?? '')
            setRenaming(true)
          }}
          aria-label="Переименовать"
        >
          <IconPencil size={17} />
        </button>
        <button className="icon-btn" style={{ width: 38, height: 38 }} onClick={() => setConfirmDelete(true)} aria-label="Удалить плейлист">
          <IconTrash size={17} />
        </button>
      </div>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<IconPlus size={28} />}
          title="Плейлист пуст"
          text="Добавляйте треки через меню «⋯» на любой строке или из карточки издания."
          action={
            <button className="btn btn--secondary btn--sm" onClick={() => navigate('/search')}>
              Найти музыку
            </button>
          }
        />
      ) : (
        <div className="tracklist">
          <div className="tracklist__head">
            <span>#</span>
            <span>Название</span>
            <span>Альбом</span>
            <span />
            <span style={{ textAlign: 'right' }}>Время</span>
          </div>
          {tracks.map((track, index) => (
            <TrackRow
              key={`${track.id}-${index}`}
              track={track}
              index={index}
              tracks={tracks}
              contextLabel={playlist.name}
              contextPath={`/playlist/${playlist.id}`}
              onRemove={() => remove(playlist.id, track.id)}
            />
          ))}
        </div>
      )}

      <Modal
        open={importing}
        onClose={() => {
          if (busy) return
          setImporting(false)
        }}
        title="Импортировать плейлист"
        description="Вставьте публичную ссылку — Ownly найдёт эти песни и добавит в этот плейлист."
        footer={
          <>
            <button
              className="btn btn--ghost"
              onClick={() => {
                if (busy) {
                  setCanceling(true)
                  importAbort.current?.abort()
                  if (importRequestId.current) void window.ownly?.spotifyCancel(importRequestId.current)
                } else {
                  setImporting(false)
                }
              }}
              disabled={canceling}
            >
              {busy ? (canceling ? 'Останавливаем…' : 'Остановить') : done ? 'Закрыть' : 'Отмена'}
            </button>
            <button className="btn btn--primary" onClick={() => void startImport()} disabled={busy || !importUrl.trim()}>
              {busy ? 'Импортируем…' : 'Импортировать'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea
            className="input import-input"
            autoFocus
            value={importUrl}
            onChange={(event) => {
              setImportUrl(event.target.value)
              setImportError('')
            }}
            placeholder="Ссылка на плейлист или список песен"
            spellCheck={false}
            disabled={busy}
            rows={importUrl.includes('\n') ? 6 : 1}
          />

          <div className="import-hint">
            <span className="import-hint__tag">Без настройки</span>
            <code>youtube.com/playlist?list=…</code> · <code>music.yandex.ru/playlists/…</code> ·{' '}
            <code>deezer.com/playlist/…</code> · <code>open.spotify.com/playlist/…</code>
          </div>
          <div className="import-hint">
            <span className="import-hint__tag is-muted">Список</span> вставьте строки вида
            «Исполнитель — Название», по одной на строку — Ownly найдёт каждую песню.
          </div>

          {busy ? (
            <div className="import-progress">
              <div className="import-progress__bar">
                <div className="import-progress__fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="import-progress__text">
                {stage === 'fetch' ? 'Читаем ссылку…' : stage === 'spotify' ? `Читаем Spotify: ${importDone} из ${importTotal || '…'}` : `Ищем треки: ${importDone} из ${importTotal}`}
              </div>
            </div>
          ) : null}

          {done ? (
            <div className="import-done">
              Готово: добавлено {done.added} из {done.total}.{done.missing > 0 ? ` Не нашлось: ${done.missing}.` : ''}
            </div>
          ) : null}

          {importError ? <div className="import-error">{importError}</div> : null}
        </div>
      </Modal>

      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Настроить плейлист"
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setRenaming(false)}>
              Отмена
            </button>
            <button
              className="btn btn--primary"
              onClick={() => {
                rename(playlist.id, draftName)
                setDescription(playlist.id, draftDescription)
                setRenaming(false)
              }}
            >
              Сохранить
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="input" autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Название" />
          <input
            className="input"
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            placeholder="Описание (необязательно)"
          />
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Удалить плейлист?"
        description={`«${playlist.name}» будет удалён. Треки останутся в каталоге.`}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>
              Отмена
            </button>
            <button
              className="btn btn--primary"
              onClick={() => {
                deletePlaylist(playlist.id)
                navigate('/library')
              }}
            >
              Удалить
            </button>
          </>
        }
      />
    </div>
  )
}
