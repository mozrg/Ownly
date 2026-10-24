import { memo, useEffect, useState } from 'react'
import type { Track } from '../lib/types'
import { usePlayer } from '../state/player'
import { useLibrary } from '../state/library'
import { navigate } from '../lib/router'
import { addToQueue, playNext, playTracks, toggleLike } from '../lib/actions'
import { openMenuAtElement } from './Menu'
import { openPlaylistPicker } from './PlaylistPicker'
import { Artwork } from './Artwork'
import { IconHeart, IconHeartFilled, IconMore, IconPlay, IconExternal, IconQueue, IconDisc, IconUsers, IconPause, IconText } from './Icons'
import { cx, formatTime } from '../lib/format'
import { prefetchStream } from '../lib/youtube'
import { lyricsAvailability, onAvailabilityChange, requestLyricsProbe } from '../lib/lyrics'
import { trackVersion, versionLabel } from '../lib/version'
import { useArtistCredits } from '../lib/credits'

/** True when the "album" cell would just repeat the artist name. */
function isSameAsArtist(track: Track): boolean {
  const album = track.album.trim().toLowerCase()
  if (!album || album === 'youtube') return true
  const artists = (track.artists && track.artists.length > 0 ? track.artists : [track.artist]).map((name) =>
    name.trim().toLowerCase(),
  )
  return artists.some((name) => name === album)
}

interface TrackRowProps {
  track: Track
  index: number
  /** Full list, so playing a row continues through the list. */
  tracks: Track[]
  contextLabel?: string
  contextPath?: string
  showAlbum?: boolean
  showArt?: boolean
  onRemove?: () => void
  removeLabel?: string
}

export const TrackRow = memo(function TrackRow({
  track,
  index,
  tracks,
  contextLabel,
  contextPath,
  showAlbum = true,
  showArt = true,
  onRemove,
  removeLabel = 'Убрать из плейлиста',
}: TrackRowProps) {
  const currentId = usePlayer((state) => state.queue[state.order[state.cursor]]?.id)
  const isPlaying = usePlayer((state) => state.isPlaying)
  const toggle = usePlayer((state) => state.toggle)
  const liked = useLibrary((state) => Boolean(state.likedTracks[track.id]))

  const isActive = currentId === track.id

  // YouTube titles credit whoever uploaded them, so a song by two artists often
  // shows one. The hook renders the upload's names at once and adds the
  // collaborators the catalogue knows about when the lookup answers.
  const displayArtists = useArtistCredits(track)

  // "Is there a lyric sheet for this?" is answered lazily in the background
  // and cached, so a list does not fire one request per row on every render.
  const [hasLyrics, setHasLyrics] = useState(() => lyricsAvailability(track.artist, track.title))

  useEffect(() => {
    if (hasLyrics !== undefined) return
    requestLyricsProbe(track.artist, track.title)
  }, [hasLyrics, track.artist, track.title])

  useEffect(() => {
    if (hasLyrics !== undefined) return
    return onAvailabilityChange(() => {
      const known = lyricsAvailability(track.artist, track.title)
      if (known !== undefined) setHasLyrics(known)
    })
  }, [hasLyrics, track.artist, track.title])

  const version = trackVersion(track.title)
  const badges: Array<{ key: string; label: string; tone: string; hint: string; icon?: React.ReactNode }> = []
  // Only deviations from the original get a badge: marking the common case
  // would put a chip on almost every row and pull the eye away from the title.
  if (version !== 'original') {
    badges.push({
      key: 'version',
      label: versionLabel(version),
      tone: 'version',
      hint: `Это не оригинал: ${versionLabel(version).toLowerCase()}`,
    })
  }
  if (hasLyrics) {
    badges.push({
      key: 'lyrics',
      label: '',
      tone: 'lyrics',
      hint: 'Есть текст песни — откроется в панели справа',
      icon: <IconText size={11} />,
    })
  }

  // Resolving a stream is the slow part of playing. Start it as soon as the
  // user shows intent, so the click itself feels instant.
  const warm = () => {
    if (track.source === 'youtube' && !track.url) prefetchStream(track.youtubeId)
  }

  const handlePlay = () => {
    if (isActive) {
      toggle()
      return
    }
    playTracks(tracks, index, contextLabel, contextPath)
  }

  const openTrackMenu = (element: HTMLElement) => {
    openMenuAtElement(element, [
      {
        id: 'play',
        label: isActive && isPlaying ? 'Пауза' : 'Слушать',
        icon: <IconPlay size={15} />,
        onSelect: handlePlay,
      },
      { id: 'next', label: 'Играть следующим', icon: <IconQueue size={15} />, onSelect: () => playNext(track) },
      { id: 'queue', label: 'Добавить в очередь', icon: <IconQueue size={15} />, onSelect: () => addToQueue([track]) },
      {
        id: 'like',
        label: liked ? 'Убрать из любимых' : 'В любимые',
        icon: liked ? <IconHeartFilled size={15} /> : <IconHeart size={15} />,
        onSelect: () => toggleLike(track),
      },
      {
        id: 'playlist',
        label: 'Добавить в плейлист',
        icon: <IconDisc size={15} />,
        onSelect: () => openPlaylistPicker([track]),
      },
      { id: 'sep1', separator: true },
      track.source === 'youtube'
        ? {
            id: 'album',
            label: 'Открыть на YouTube',
            icon: <IconExternal size={15} />,
            onSelect: () => void window.ownly?.openExternal(track.sourceUrl ?? ''),
          }
        : {
            id: 'album',
            label: 'Перейти к альбому',
            icon: <IconDisc size={15} />,
            onSelect: () => navigate(`/album/${track.albumId}`),
          },
      {
        id: 'artist',
        label: 'Перейти к исполнителю',
        icon: <IconUsers size={15} />,
        onSelect: () => navigate(`/artist/${encodeURIComponent(track.artist)}`),
      },
      ...(track.sourceUrl
        ? [
            {
              id: 'source',
              label: 'Открыть страницу',
              icon: <IconExternal size={15} />,
              onSelect: () => window.ownly?.openExternal(track.sourceUrl as string),
            },
          ]
        : []),
      ...(onRemove ? [{ id: 'sep2', separator: true }, { id: 'remove', label: removeLabel, danger: true, onSelect: onRemove }] : []),
    ])
  }

  return (
    <div
      className={cx('track-row', isActive && 'is-active')}
      data-track-row
      data-source={track.source ?? 'archive'}
      onMouseEnter={warm}
      onFocus={warm}
      onDoubleClick={handlePlay}
      role="row"
    >
      <div className="track-row__index">
        {isActive && isPlaying ? (
          <div className="eq" aria-label="Играет">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : (
          <span className="track-row__index-num">{index + 1}</span>
        )}
        <button
          className="track-row__index-play"
          data-play
          onClick={handlePlay}
          aria-label={isActive && isPlaying ? `Пауза ${track.title}` : `Слушать ${track.title}`}
        >
          {isActive && isPlaying ? <IconPause size={13} /> : <IconPlay size={13} />}
        </button>
      </div>

      <div className="track-row__main">
        {showArt && (
          <div className="track-row__art">
            <Artwork src={track.cover} alt={track.album} seed={track.albumId} />
          </div>
        )}
        <div className="track-row__text">
          <div className="track-row__titleline">
            <button className="track-row__title" onClick={handlePlay} title={track.title}>
              {track.title}
            </button>
            {badges.length > 0 ? (
              <span className="badges">
                {badges.map((badge) => (
                  <span
                    key={badge.key}
                    className={`badge badge--${badge.tone}`}
                    title={badge.hint}
                  >
                    {badge.icon}
                    {badge.label}
                  </span>
                ))}
              </span>
            ) : null}
          </div>
          <div className="track-row__artists">
            {displayArtists.map((name, position, all) => (
              <span key={`${name}-${position}`}>
                <button
                  className="track-row__artist"
                  onClick={(event) => {
                    event.stopPropagation()
                    navigate(`/artist/${encodeURIComponent(name)}`)
                  }}
                  title={name}
                >
                  {name}
                </button>
                {position < all.length - 1 ? <span className="track-row__artist-sep">, </span> : null}
              </span>
            ))}
          </div>
        </div>
      </div>

      {showAlbum ? (
        // A YouTube result has no album page; the channel is the closest
        // meaningful thing, but repeating the artist adds nothing.
        track.source === 'youtube' ? (
          isSameAsArtist(track) ? (
            <span />
          ) : (
            <button
              className="track-row__album"
              onClick={() => void window.ownly?.openExternal(track.sourceUrl ?? '')}
              title={`Открыть на YouTube${track.album ? ` · ${track.album}` : ''}`}
            >
              {track.album}
            </button>
          )
        ) : (
          <button className="track-row__album" onClick={() => navigate(`/album/${track.albumId}`)}>
            {track.album}
          </button>
        )
      ) : (
        <span />
      )}

      <button
        className={cx('icon-btn track-row__like', liked && 'is-liked')}
        onClick={() => toggleLike(track)}
        aria-label={liked ? 'Убрать из любимых' : 'В любимые'}
        style={{ width: 28, height: 28 }}
      >
        {liked ? <IconHeartFilled size={15} /> : <IconHeart size={15} />}
      </button>

      <div className="track-row__right">
        <span className="track-row__duration">{formatTime(track.duration)}</span>
        <button
          className="icon-btn track-row__more"
          onClick={(event) => openTrackMenu(event.currentTarget)}
          aria-label="Ещё"
          style={{ width: 28, height: 28 }}
        >
          <IconMore size={15} />
        </button>      </div>
    </div>
  )
})
