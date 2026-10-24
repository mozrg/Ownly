import { useEffect } from 'react'
import { useAsync } from '../hooks/useAsync'
import { youtubeSearch } from '../lib/youtube'
import { navigate, useRoute } from '../lib/router'
import { useLibrary } from '../state/library'
import { playTracks } from '../lib/actions'
import { Section, RowSkeleton } from '../components/Layout'
import { TrackRow } from '../components/TrackRow'
import { Artwork } from '../components/Artwork'
import { IconPlay, IconPlus, IconCheck, IconSearch } from '../components/Icons'

export function ArtistPage() {
  const route = useRoute()
  const name = decodeURIComponent(route.segments[1] ?? '')

  const { data, loading, error, reload } = useAsync(() => youtubeSearch(name, 30), [name], {
    enabled: Boolean(name),
  })

  const followed = useLibrary((state) => Boolean(state.followedArtists[name]))
  const toggleFollow = useLibrary((state) => state.toggleFollowArtist)
  const rememberTracks = useLibrary((state) => state.rememberTracks)

  const tracks = data ?? []
  const cover = tracks.find((track) => track.cover)?.cover ?? ''

  useEffect(() => {
    if (tracks.length === 0) return
    rememberTracks(tracks)
  }, [tracks, rememberTracks])

  const playAll = () => {
    if (tracks.length > 0) playTracks(tracks, 0, `Исполнитель ${name}`, `/artist/${encodeURIComponent(name)}`)
  }

  return (
    <div className="page">
      <div className="artist-hero">
        <div className="artist-hero__art">
          <Artwork src={cover} alt={name} seed={name} round loading="eager" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="section__eyebrow">Исполнитель</div>
          <h1 className="artist-hero__name">{name}</h1>
          <div className="hero__meta" style={{ marginBottom: 18 }}>
            {loading ? <span>Загружаем…</span> : <span>{tracks.length} треков</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" disabled={tracks.length === 0} onClick={playAll}>
              <IconPlay size={15} /> Слушать
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => toggleFollow({ id: name, name, albumCount: 0, cover })}
            >
              {followed ? <IconCheck size={15} /> : <IconPlus size={15} />}
              {followed ? 'Вы подписаны' : 'Подписаться'}
            </button>
            <button className="btn btn--ghost" onClick={() => navigate(`/search?q=${encodeURIComponent(name)}`)}>
              <IconSearch size={14} /> Найти ещё
            </button>
          </div>
        </div>
      </div>

      <Section title="Треки" subtitle={tracks.length > 0 ? 'Полные версии' : undefined}>
        {loading && tracks.length === 0 ? (
          <RowSkeleton count={8} />
        ) : error && tracks.length === 0 ? (
          <div className="empty">
            <div className="empty__title">Не удалось загрузить</div>
            <div className="empty__text">{error}</div>
            <button className="btn btn--secondary btn--sm" style={{ marginTop: 12 }} onClick={reload}>
              Повторить
            </button>
          </div>
        ) : tracks.length > 0 ? (
          <div className="tracklist">
            {tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                tracks={tracks}
                contextLabel={`Исполнитель ${name}`}
                contextPath={`/artist/${encodeURIComponent(name)}`}
                showAlbum={false}
              />
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty__title">Треков не нашлось</div>
            <div className="empty__text">
              Попробуйте поискать по названию — иногда исполнитель записан иначе.
            </div>
          </div>
        )}
      </Section>

      <div className="divider" />
      <button className="link-quiet" onClick={() => navigate('/artists')}>
        Все исполнители
      </button>
    </div>
  )
}
