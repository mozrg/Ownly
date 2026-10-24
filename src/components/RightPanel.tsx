import { useCurrentTrack, usePlayer } from '../state/player'
import { useUI, type RightPanel as PanelKind } from '../state/ui'
import { navigate } from '../lib/router'
import { Artwork } from './Artwork'
import { LyricsView } from './LyricsView'
import { IconClose, IconMore, IconTrash, IconExternal, IconDisc, IconClock } from './Icons'
import { openMenuAtElement } from './Menu'
import { formatTime } from '../lib/format'
import { EmptyState } from './Layout'

const TABS: Array<{ id: PanelKind; label: string }> = [
  { id: 'queue', label: 'Очередь' },
  { id: 'lyrics', label: 'Текст' },
  { id: 'info', label: 'Инфо' },
]

export function RightPanel() {
  const panel = useUI((state) => state.rightPanel)
  const setPanel = useUI((state) => state.setRightPanel)
  const track = useCurrentTrack()

  if (panel === 'closed') return null

  return (
    <aside className="right-panel">
      <div className="right-panel__head">
        <div className="right-panel__tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`right-panel__tab${panel === tab.id ? ' is-active' : ''}`}
              onClick={() => setPanel(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={() => setPanel('closed')} aria-label="Закрыть панель">
          <IconClose size={15} />
        </button>
      </div>

      <div className="right-panel__body scroll-area">
        {panel === 'queue' && <QueueView />}
        {panel === 'lyrics' &&
          (track ? (
            <LyricsView artist={track.artist} title={track.title} album={track.album} duration={track.duration} />
          ) : (
            <EmptyState icon={<IconClock size={30} />} title="Нет трека" text="Включите музыку, чтобы увидеть текст." />
          ))}
        {panel === 'info' && <InfoView />}
      </div>
    </aside>
  )
}

function QueueView() {
  const queue = usePlayer((state) => state.queue)
  const order = usePlayer((state) => state.order)
  const cursor = usePlayer((state) => state.cursor)
  const jumpTo = usePlayer((state) => state.jumpToQueueIndex)
  const removeFromQueue = usePlayer((state) => state.removeFromQueue)
  const clearQueue = usePlayer((state) => state.clearQueue)
  const contextLabel = usePlayer((state) => state.contextLabel)

  if (queue.length === 0) {
    return <EmptyState icon={<IconClock size={30} />} title="Очередь пуста" text="Выберите альбом, плейлист или включите радио." />
  }

  const upNext = order.slice(cursor + 1)
  const current = order[cursor]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
          {contextLabel || 'Очередь'}
        </div>
        <button className="section__link" onClick={clearQueue}>
          Очистить
        </button>
      </div>

      {current !== undefined && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '4px 0 6px' }}>
            Сейчас
          </div>
          <QueueRow index={current} isCurrent onJump={jumpTo} onRemove={removeFromQueue} />
        </>
      )}

      {upNext.length > 0 && (
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '16px 0 6px' }}>
          Далее · {upNext.length}
        </div>
      )}
      <div className="queue-list">
        {upNext.map((index) => (
          <QueueRow key={`${index}-${queue[index]?.id}`} index={index} onJump={jumpTo} onRemove={removeFromQueue} />
        ))}
      </div>
    </div>
  )
}

function QueueRow({
  index,
  isCurrent,
  onJump,
  onRemove,
}: {
  index: number
  isCurrent?: boolean
  onJump: (index: number) => void
  onRemove: (index: number) => void
}) {
  const item = usePlayer((state) => state.queue[index])
  if (!item) return null

  return (
    <div className={`queue-item${isCurrent ? ' is-current' : ''}`} onDoubleClick={() => onJump(index)}>
      <button className="queue-item__art" onClick={() => onJump(index)} aria-label={`Слушать ${item.title}`}>
        <Artwork src={item.cover} alt={item.album} seed={item.albumId} />
      </button>
      <button className="queue-item__text" onClick={() => onJump(index)} style={{ textAlign: 'left' }}>
        <div className="queue-item__title">{item.title}</div>
        <div className="queue-item__artist">{item.artist}</div>
      </button>
      <button
        className="icon-btn"
        style={{ width: 24, height: 24 }}
        onClick={(event) =>
          openMenuAtElement(event.currentTarget, [
            { id: 'jump', label: 'Перейти к треку', onSelect: () => onJump(index) },
            { id: 'album', label: 'Перейти к альбому', icon: <IconDisc size={15} />, onSelect: () => navigate(`/album/${item.albumId}`) },
            { id: 'sep', separator: true },
            { id: 'remove', label: 'Убрать из очереди', icon: <IconTrash size={15} />, danger: true, onSelect: () => onRemove(index) },
          ])
        }
        aria-label="Действия"
      >
        <IconMore size={14} />
      </button>
    </div>
  )
}

function InfoView() {
  const track = useCurrentTrack()
  const kind = usePlayer((state) => state.kind)

  if (!track) {
    return <EmptyState icon={<IconClock size={30} />} title="Нет трека" text="Информация появится во время воспроизведения." />
  }

  const rows: Array<[string, string]> = [
    ['Название', track.title],
    ['Исполнитель', track.artist],
    ['Издание', track.album],
    ['Трек', `${track.trackNumber} из альбома`],
    ['Длительность', formatTime(track.duration)],
  ]

  if (track.size) rows.push(['Размер файла', `${(track.size / 1024 / 1024).toFixed(1)} МБ`])
  if (track.license) rows.push(['Лицензия', track.license.replace(/^https?:\/\//, '')])

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
        <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', flex: 'none' }}>
          <Artwork src={track.cover} alt={track.album} seed={track.albumId} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{track.artist}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12.5 }}>
            <span style={{ color: 'var(--text-3)', flex: 'none' }}>{label}</span>
            <span style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
          </div>
        ))}
      </div>

      <div className="divider" />

      {track.sourceUrl && (
        <button className="btn btn--secondary btn--sm" style={{ marginTop: 14 }} onClick={() => window.ownly?.openExternal(track.sourceUrl as string)}>
          <IconExternal size={14} /> Открыть на YouTube
        </button>
      )}

      {track.albumId && kind === 'catalog' && (
        <button className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={() => navigate(`/album/${track.albumId}`)}>
          <IconDisc size={14} /> Перейти к изданию
        </button>
      )}
    </div>
  )
}
