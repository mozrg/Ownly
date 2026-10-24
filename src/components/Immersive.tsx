import { useEffect } from 'react'
import { useCurrentTrack, usePlayer } from '../state/player'
import { useUI } from '../state/ui'
import { useLibrary } from '../state/library'
import { navigate } from '../lib/router'
import { useArtistCredits } from '../lib/credits'
import { toggleLike } from '../lib/actions'
import { Artwork } from './Artwork'
import { SeekSlider, Slider } from './Slider'
import { LyricsView } from './LyricsView'
import { Visualizer } from './Visualizer'
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
  IconQueue,
  IconVolume,
  IconVolumeMute,
  IconMinimize,
  IconMic,
} from './Icons'
import { formatTime, toneFor } from '../lib/format'

/** Stable placeholder so the credits hook can run before a track exists. */
const NO_TRACK = { id: '', artist: '', title: '', duration: 0 }

export function Immersive() {
  const open = useUI((state) => state.immersive)
  const setImmersive = useUI((state) => state.setImmersive)
  const toggleRightPanel = useUI((state) => state.toggleRightPanel)
  const track = useCurrentTrack()
  const displayArtists = useArtistCredits(track ?? NO_TRACK)
  const isPlaying = usePlayer((state) => state.isPlaying)
  const isLoading = usePlayer((state) => state.isLoading)
  const position = usePlayer((state) => state.position)
  const duration = usePlayer((state) => state.duration)
  const shuffle = usePlayer((state) => state.shuffle)
  const repeat = usePlayer((state) => state.repeat)
  const volume = usePlayer((state) => state.volume)
  const muted = usePlayer((state) => state.muted)
  const liked = useLibrary((state) => (track ? Boolean(state.likedTracks[track.id]) : false))
  const nextTrack = usePlayer((state) => state.queue[state.order[state.cursor + 1]] ?? null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImmersive(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setImmersive])

  if (!open || !track) return null

  const player = usePlayer.getState()
  const [hueA, hueB] = toneFor(track.albumId)
  const progress = duration > 0 ? position / duration : 0

  return (
    <div className="immersive" style={{ ['--tone-a' as string]: `hsl(${hueA} 38% 24%)`, ['--tone-b' as string]: `hsl(${hueB} 40% 8%)` }}>
      <div className="immersive__backdrop">
        <img src={track.cover} alt="" />
      </div>
      <div className="immersive__veil" />

      <button className="immersive__close" onClick={() => setImmersive(false)} aria-label="Свернуть">
        <IconMinimize size={17} />
      </button>

      <div className="immersive__content">
        <div className="immersive__art">
          <Artwork src={track.cover} alt={track.album} seed={track.albumId} loading="eager" />
        </div>

        <div className="immersive__info">
          <div className="immersive__eyebrow">Сейчас играет · {track.album}</div>
          <h1 className="immersive__title">{track.title}</h1>
          <span className="immersive__artist-line">
            {displayArtists.map((name, index) => (
              <span key={`${name}-${index}`}>
                <button
                  className="immersive__artist"
                  onClick={() => {
                    setImmersive(false)
                    navigate(`/artist/${encodeURIComponent(name)}`)
                  }}
                  title={name}
                >
                  {name}
                </button>
                {index < displayArtists.length - 1 ? <span className="immersive__artist-sep">, </span> : null}
              </span>
            ))}
          </span>

          <Visualizer seed={track.id} bars={56} height={30} className="immersive__viz" />

          <div className="immersive__lyrics">
            <LyricsView artist={track.artist} title={track.title} album={track.album} duration={track.duration} variant="immersive" />
          </div>

          {nextTrack && (
            <button className="immersive__next" onClick={() => player.next()} aria-label="Следующий трек">
              <span className="immersive__next-art">
                <Artwork src={nextTrack.cover} alt={nextTrack.album} seed={nextTrack.albumId} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="immersive__next-label">Далее</span>
                <span className="immersive__next-title" style={{ display: 'block' }}>
                  {nextTrack.title}
                </span>
                <span className="immersive__next-artist" style={{ display: 'block' }}>
                  {nextTrack.artist}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="immersive__bottom">
        <div className="immersive__bar">
          <div className="progress-row">
            <span className="time">{formatTime(position)}</span>
            <SeekSlider value={progress} onCommit={(ratio) => player.seek(ratio * duration)} formatTooltip={(ratio) => formatTime(ratio * duration)} ariaLabel="Позиция" />
            <span className="time time--end">{formatTime(duration)}</span>
          </div>

          <div className="immersive__controls">
            <div className="immersive__controls-side">
              <button
                className="transport__btn"
                onClick={() => toggleLike(track)}
                aria-label={liked ? 'Убрать из любимых' : 'В любимые'}
                style={{ color: liked ? '#fff' : undefined }}
              >
                {liked ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
              </button>
              <button className="transport__btn" onClick={() => toggleRightPanel('lyrics')} aria-label="Текст">
                <IconMic size={18} />
              </button>
              <button className="transport__btn" onClick={() => toggleRightPanel('queue')} aria-label="Очередь">
                <IconQueue size={18} />
              </button>
            </div>

            <div className="transport">
              <button className={`transport__btn${shuffle ? ' is-active' : ''}`} onClick={() => player.toggleShuffle()} aria-label="Перемешать">
                <IconShuffle size={17} />
              </button>
              <button className="transport__btn" onClick={() => player.previous()} aria-label="Предыдущий">
                <IconSkipBack size={19} />
              </button>
              <button className="play-btn" style={{ width: 50, height: 50 }} onClick={() => player.toggle()} aria-label={isPlaying ? 'Пауза' : 'Играть'}>
                {isLoading ? <span className="spinner" /> : isPlaying ? <IconPause size={19} /> : <IconPlay size={19} style={{ marginLeft: 2 }} />}
              </button>
              <button className="transport__btn" onClick={() => player.next()} aria-label="Следующий">
                <IconSkipForward size={19} />
              </button>
              <button className={`transport__btn${repeat !== 'off' ? ' is-active' : ''}`} onClick={() => player.cycleRepeat()} aria-label="Повтор">
                {repeat === 'one' ? <IconRepeatOne size={17} /> : <IconRepeat size={17} />}
              </button>
            </div>

            <div className="immersive__volume">
              <button className="icon-btn" onClick={() => player.toggleMute()} aria-label="Звук" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {muted || volume === 0 ? <IconVolumeMute size={17} /> : <IconVolume size={17} />}
              </button>
              <Slider value={muted ? 0 : volume} onChange={(value) => player.setVolume(value)} compact ariaLabel="Громкость" step={0.05} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
