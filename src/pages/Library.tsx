import { useState } from 'react'
import { useLibrary } from '../state/library'
import { usePlayer } from '../state/player'
import { navigate } from '../lib/router'
import { playTracks } from '../lib/actions'
import { Section, EmptyState } from '../components/Layout'
import { Modal } from '../components/Modal'
import { Artwork } from '../components/Artwork'
import { AlbumCard, ArtistCard } from '../components/Cards'
import { TrackRow } from '../components/TrackRow'
import { IconHeart, IconList, IconPlus, IconPlay, IconShuffle, IconClock } from '../components/Icons'
import { albumCountLabel, formatTotalDuration, plural, trackCountLabel } from '../lib/format'
import type { Track } from '../lib/types'

type Tab = 'playlists' | 'albums' | 'artists'

export function LibraryPage() {
  const [tab, setTab] = useState<Tab>('playlists')
  const playlists = useLibrary((state) => state.playlists)
  const likedAlbums = useLibrary((state) => state.likedAlbums)
  const followed = useLibrary((state) => state.followedArtists)
  const likedCount = useLibrary((state) => state.likedOrder.length)

  const albums = Object.values(likedAlbums)
  const artists = Object.values(followed)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="section__eyebrow">Ваше</div>
          <h1 className="page-head__title">Коллекция</h1>
          <div className="page-head__sub">
            {trackCountLabel(likedCount)} · {albumCountLabel(albums.length)} · {playlists.length} плейлистов
          </div>
        </div>
        <div className="page-head__actions">
          <button className="btn btn--primary" onClick={() => navigate('/liked')}>
            <IconHeart size={15} /> Любимые треки
          </button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab${tab === 'playlists' ? ' is-active' : ''}`} onClick={() => setTab('playlists')}>
          Плейлисты · {playlists.length}
        </button>
        <button className={`tab${tab === 'albums' ? ' is-active' : ''}`} onClick={() => setTab('albums')}>
          Альбомы · {albums.length}
        </button>
        <button className={`tab${tab === 'artists' ? ' is-active' : ''}`} onClick={() => setTab('artists')}>
          Исполнители · {artists.length}
        </button>
      </div>

      {tab === 'playlists' && <PlaylistShelf />}

      {tab === 'albums' &&
        (albums.length === 0 ? (
          <EmptyState icon={<IconHeart size={30} />} title="Нет сохранённых альбомов" text="Нажмите «В коллекцию» на странице издания." />
        ) : (
          <div className="card-grid">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        ))}

      {tab === 'artists' &&
        (artists.length === 0 ? (
          <EmptyState icon={<IconHeart size={30} />} title="Нет подписок" text="Подпишитесь на исполнителя, чтобы быстро возвращаться к нему." />
        ) : (
          <div className="card-grid">
            {artists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        ))}

      <Section title="Быстрые действия">
        <div className="chips">
          <button className="chip" onClick={() => navigate('/liked')}>
            <IconPlay size={12} /> Любимые треки
          </button>
          <button className="chip" onClick={() => navigate('/history')}>
            <IconClock size={12} /> Недавние
          </button>
          <button className="chip" onClick={() => navigate('/artists')}>
            Исполнители
          </button>
        </div>
      </Section>
    </div>
  )
}

/** Cover mosaic for a playlist, built from the first four artworks. */
function PlaylistCover({ covers, seed, size }: { covers: string[]; seed: string; size: number }) {
  const unique = covers.filter(Boolean).slice(0, 4)
  if (unique.length === 0) {
    return (
      <span className="shelf-card__empty" style={{ width: size, height: size }}>
        <IconList size={Math.round(size * 0.22)} />
      </span>
    )
  }
  if (unique.length < 4) {
    return (
      <span className="shelf-card__single" style={{ width: size, height: size }}>
        <Artwork src={unique[0]} alt="" seed={seed} />
      </span>
    )
  }
  return (
    <span className="shelf-card__mosaic" style={{ width: size, height: size }}>
      {unique.map((cover, index) => (
        <Artwork key={index} src={cover} alt="" seed={`${seed}-${index}`} />
      ))}
    </span>
  )
}

/**
 * Playlists as a shelf of covers, the way streaming apps present them: the
 * first tile creates a playlist, the rest open one.
 */
function PlaylistShelf() {
  const playlists = useLibrary((state) => state.playlists)
  const cache = useLibrary((state) => state.trackCache)
  const createPlaylist = useLibrary((state) => state.createPlaylist)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = createPlaylist(trimmed)
    setCreating(false)
    setName('')
    navigate(`/playlist/${id}`)
  }

  return (
    <>
      <div className="shelf">
        <button className="shelf-card shelf-card--new" onClick={() => setCreating(true)}>
          <span className="shelf-card__plus">
            <IconPlus size={30} />
          </span>
          <span className="shelf-card__title">Новый плейлист</span>
        </button>

        {playlists.map((playlist) => {
          const covers = playlist.trackIds
            .map((trackId) => cache[trackId]?.cover ?? '')
            .filter(Boolean)
            .slice(0, 4)
          return (
            <button key={playlist.id} className="shelf-card" onClick={() => navigate(`/playlist/${playlist.id}`)}>
              <PlaylistCover covers={covers} seed={playlist.id} size={184} />
              <span className="shelf-card__title">{playlist.name}</span>
              <span className="shelf-card__sub">{trackCountLabel(playlist.trackIds.length)}</span>
            </button>
          )
        })}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Новый плейлист"
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setCreating(false)}>
              Отмена
            </button>
            <button className="btn btn--primary" onClick={submit} disabled={!name.trim()}>
              Создать
            </button>
          </>
        }
      >
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          placeholder="Название плейлиста"
        />
      </Modal>
    </>
  )
}

export function LikedPage() {
  const likedTracks = useLibrary((state) => state.likedTracks)
  const order = useLibrary((state) => state.likedOrder)
  const tracks = [...order].reverse().map((id) => likedTracks[id]).filter((track): track is Track => Boolean(track))
  const totalDuration = tracks.reduce((sum, track) => sum + track.duration, 0)

  return (
    <div className="page">
      <div className="album-hero" style={{ ['--tone-a' as string]: 'hsl(340 30% 20%)', ['--tone-b' as string]: 'hsl(280 26% 8%)' }}>
        <div className="album-hero__bg" />
        <div className="album-hero__veil" />
        <div className="album-hero__art" style={{ display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg, #2a1f33, #120e17)' }}>
          <IconHeart size={72} style={{ color: 'rgba(255,255,255,0.9)' }} />
        </div>
        <div className="album-hero__body">
          <div className="album-hero__type">Плейлист</div>
          <h1 className="album-hero__title">Любимые треки</h1>
          <div className="album-hero__meta">
            <span>{trackCountLabel(tracks.length)}</span>
            {totalDuration > 0 && (
              <>
                <span className="dot" />
                <span>{formatTotalDuration(totalDuration)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {tracks.length === 0 ? (
        <EmptyState icon={<IconHeart size={30} />} title="Пока пусто" text="Ставьте сердечки на треках — они соберутся здесь." />
      ) : (
        <>
          <div className="album-toolbar">
            <button className="album-toolbar__play" onClick={() => playTracks(tracks, 0, 'Любимые треки', '/liked')} aria-label="Слушать">
              <IconPlay size={20} style={{ marginLeft: 2 }} />
            </button>
            <button
              className="icon-btn"
              onClick={() => {
                const player = usePlayerShuffle()
                player()
              }}
              aria-label="Перемешать"
              style={{ width: 38, height: 38 }}
            >
              <IconShuffle size={18} />
            </button>
          </div>

          <div className="tracklist">
            <div className="tracklist__head">
              <span>#</span>
              <span>Название</span>
              <span>Альбом</span>
              <span />
              <span style={{ textAlign: 'right' }}>Время</span>
            </div>
            {tracks.map((track, index) => (
              <TrackRow key={track.id} track={track} index={index} tracks={tracks} contextLabel="Любимые треки" contextPath="/liked" />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function usePlayerShuffle() {
  return () => {
    const player = usePlayer.getState()
    if (!player.shuffle) player.toggleShuffle()
  }
}

export function ArtistsPage() {
  const followed = useLibrary((state) => state.followedArtists)
  const artists = Object.values(followed)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="section__eyebrow">Подписки</div>
          <h1 className="page-head__title">Исполнители</h1>
          <div className="page-head__sub">
            {artists.length > 0 ? `${artists.length} ${plural(artists.length, 'исполнитель', 'исполнителя', 'исполнителей')}` : 'Вы пока ни на кого не подписаны'}
          </div>
        </div>
        <div className="page-head__actions">
          <button className="btn btn--secondary" onClick={() => navigate('/search')}>
            Найти исполнителя
          </button>
        </div>
      </div>

      {artists.length === 0 ? (
        <EmptyState
          icon={<IconHeart size={30} />}
          title="Нет подписок"
          text="Откройте страницу исполнителя и нажмите «Подписаться»."
          action={
            <button className="btn btn--secondary btn--sm" onClick={() => navigate('/search')}>
              Перейти к поиску
            </button>
          }
        />
      ) : (
        <div className="card-grid">
          {artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      )}
    </div>
  )
}

export function HistoryPage() {
  const recentTracks = useLibrary((state) => state.recentTracks)
  const recentAlbums = useLibrary((state) => state.recentAlbums)
  const clearHistory = useLibrary((state) => state.clearHistory)

  const tracks = recentTracks.map((entry) => entry.track)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="section__eyebrow">История</div>
          <h1 className="page-head__title">Недавние</h1>
          <div className="page-head__sub">Что вы слушали и открывали</div>
        </div>
        <div className="page-head__actions">
          <button className="btn btn--ghost btn--sm" onClick={clearHistory} disabled={recentTracks.length === 0}>
            Очистить
          </button>
        </div>
      </div>

      {recentAlbums.length > 0 && (
        <Section title="Недавние издания">
          <div className="card-grid">
            {recentAlbums.slice(0, 12).map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Недавние треки">
        {tracks.length === 0 ? (
          <EmptyState icon={<IconPlay size={28} />} title="История пуста" text="Начните слушать — здесь появятся треки." />
        ) : (
          <div className="tracklist">
            {tracks.slice(0, 40).map((track, index) => (
              <TrackRow key={`${track.id}-${index}`} track={track} index={index} tracks={tracks} contextLabel="История" />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
