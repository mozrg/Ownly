import { useCurrentTrack, usePlayer } from '../state/player'
import { useLibrary } from '../state/library'
import { useUI } from '../state/ui'
import { navigate } from '../lib/router'
import { useArtistCredits } from '../lib/credits'
import { toggleLike } from '../lib/actions'
import { Artwork } from './Artwork'
import { SeekSlider, Slider } from './Slider'
import {
  IconPlay,
  IconPause,
  IconSkipBack,
  IconSkipForward,
  IconShuffle,
  IconRepeat,
  IconRepeatOne,
  IconHeart,
  IconHeartFilled,
  IconMic,
  IconQueue,
  IconVolume,
  IconVolumeMute,
  IconMaximize,
  IconChevronUp,
  BrandMark,
} from './Icons'
import { formatTime } from '../lib/format'

/** Stable placeholder so the credits hook can run before a track exists. */
const NO_TRACK = { id: '', artist: '', title: '', duration: 0 }

export function PlayerBar() {
  const track = useCurrentTrack()
  const displayArtists = useArtistCredits(track ?? NO_TRACK)
  const isPlaying = usePlayer((state) => state.isPlaying)
  const isLoading = usePlayer((state) => state.isLoading)
  const position = usePlayer((state) => state.position)
  const duration = usePlayer((state) => state.duration)
  const volume = usePlayer((state) => state.volume)
  const muted = usePlayer((state) => state.muted)
  const shuffle = usePlayer((state) => state.shuffle)
  const repeat = usePlayer((state) => state.repeat)
  const error = usePlayer((state) => state.error)
  const liked = useLibrary((state) => (track ? Boolean(state.likedTracks[track.id]) : false))
  const rightPanel = useUI((state) => state.rightPanel)
  const toggleRightPanel = useUI((state) => state.toggleRightPanel)
  const toggleImmersive = useUI((state) => state.toggleImmersive)

  const player = usePlayer.getState()

  const progress = duration > 0 ? position / duration : 0

  return (
    <footer className="playerbar">
      <div className="playerbar__now">
        {track ? (
          <>
            <div className="playerbar__art" onClick={toggleImmersive} role="button" aria-label="Открыть плеер">
              <Artwork src={track.cover} alt={track.album} seed={track.albumId} loading="eager" />
              <div className="playerbar__art-overlay">
                <IconChevronUp size={18} />
              </div>
            </div>
            <div className="playerbar__meta">
              <button className="playerbar__title" onClick={toggleImmersive} title={track.title}>
                {track.title}
              </button>
              <span className="playerbar__artist-line">
                {displayArtists.map((name, index) => (
                  <span key={`${name}-${index}`}>
                    <button
                      className="playerbar__artist"
                      onClick={() => navigate(`/artist/${encodeURIComponent(name)}`)}
                      title={name}
                    >
                      {name}
                    </button>
                    {index < displayArtists.length - 1 ? <span className="playerbar__artist-sep">, </span> : null}
                  </span>
                ))}
              </span>
            </div>
            {/* Resolving a stream can take a while on a slow network — say so
                instead of leaving the player looking frozen. */}
            {isLoading ? (
              <span className="playerbar__status" role="status">
                Загружаем…
              </span>
            ) : null}
            <button
              className="icon-btn"
              onClick={() => toggleLike(track)}
              aria-label={liked ? 'Убрать из любимых' : 'В любимые'}
              style={{ color: liked ? 'var(--text)' : undefined }}
            >
              {liked ? <IconHeartFilled size={16} /> : <IconHeart size={16} />}
            </button>
          </>
        ) : (
          <>
            <div className="playerbar__art" style={{ display: 'grid', placeItems: 'center', cursor: 'default' }}>
              <BrandMark size={22} style={{ color: 'var(--text-3)' }} />
            </div>
            <div className="playerbar__meta">
              <div className="playerbar__title" style={{ color: 'var(--text-3)', fontWeight: 500 }}>
                Ничего не играет
              </div>
              <div className="playerbar__artist" style={{ cursor: 'default' }}>
                Найдите песню и включите её
              </div>
            </div>
          </>
        )}
      </div>

      <div className="playerbar__center">
        <div className="transport">
          <button
            className={`transport__btn${shuffle ? ' is-active' : ''}`}
            onClick={() => player.toggleShuffle()}
            aria-label="Перемешать"
            title="Перемешать"
          >
            <IconShuffle size={16} />
          </button>
          <button className="transport__btn" onClick={() => player.previous()} aria-label="Предыдущий" title="Предыдущий">
            <IconSkipBack size={17} />
          </button>
          <button
            className="play-btn"
            onClick={() => (track ? player.toggle() : navigate('/'))}
            aria-label={isPlaying ? 'Пауза' : 'Играть'}
          >
            {isLoading && track ? (
              <span className="spinner" />
            ) : isPlaying ? (
              <IconPause size={16} />
            ) : (
              <IconPlay size={16} style={{ marginLeft: 2 }} />
            )}
          </button>
          <button className="transport__btn" onClick={() => player.next()} aria-label="Следующий" title="Следующий">
            <IconSkipForward size={17} />
          </button>
          <button
            className={`transport__btn${repeat !== 'off' ? ' is-active' : ''}`}
            onClick={() => player.cycleRepeat()}
            aria-label={repeat === 'one' ? 'Повтор трека' : repeat === 'all' ? 'Повтор очереди' : 'Повтор выключен'}
            title={repeat === 'one' ? 'Повтор трека' : repeat === 'all' ? 'Повтор очереди' : 'Повтор выключен'}
          >
            {repeat === 'one' ? <IconRepeatOne size={16} /> : <IconRepeat size={16} />}
          </button>
        </div>

        <div className="progress-row">
          <span className="time">{formatTime(position)}</span>
          <SeekSlider
            value={progress}
            onCommit={(ratio) => player.seek(ratio * (duration || 0))}
            formatTooltip={(ratio) => formatTime(ratio * (duration || 0))}
            disabled={!track || duration === 0}
            ariaLabel="Позиция воспроизведения"
          />
          <span className="time time--end">{formatTime(duration)}</span>
        </div>
        {error && (
          <button className="player-error" onClick={() => player.retry()}>
            {error} · повторить
          </button>
        )}
      </div>

      <div className="playerbar__right">
        <button
          className={`transport__btn${rightPanel === 'lyrics' ? ' is-active' : ''}`}
          onClick={() => toggleRightPanel('lyrics')}
          aria-label="Текст песни"
          title="Текст песни"
          data-action="lyrics"
        >
          <IconMic size={16} />
        </button>
        <button
          className={`transport__btn${rightPanel === 'queue' ? ' is-active' : ''}`}
          onClick={() => toggleRightPanel('queue')}
          aria-label="Очередь"
          title="Очередь"
          data-action="queue"
        >
          <IconQueue size={16} />
        </button>
        <div className="volume">
          <button className="icon-btn" onClick={() => player.toggleMute()} aria-label={muted ? 'Включить звук' : 'Выключить звук'}>
            {muted || volume === 0 ? <IconVolumeMute size={16} /> : <IconVolume size={16} />}
          </button>
          <Slider
            value={muted ? 0 : volume}
            onCommit={(value) => player.setVolume(value)}
            onChange={(value) => player.setVolume(value)}
            compact
            ariaLabel="Громкость"
            step={0.05}
          />
        </div>
        <button className="transport__btn" onClick={toggleImmersive} aria-label="Полноэкранный плеер" title="Полноэкранный плеер" data-action="fullscreen">
          <IconMaximize size={16} />
        </button>
      </div>
    </footer>
  )
}
