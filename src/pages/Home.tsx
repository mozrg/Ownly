import { navigate } from '../lib/router'
import { usePlayer } from '../state/player'
import { useLibrary } from '../state/library'
import { useUI } from '../state/ui'
import { Section } from '../components/Layout'
import { TrackRow } from '../components/TrackRow'
import { Artwork } from '../components/Artwork'
import { IconPlay, IconHeart, IconClock, IconUsers, IconSearch } from '../components/Icons'
import { trackCountLabel } from '../lib/format'
import type { Track } from '../lib/types'

export function HomePage() {
  const recentTracks = useLibrary((state) => state.recentTracks)
  const likedTracks = useLibrary((state) => state.likedTracks)
  const likedOrder = useLibrary((state) => state.likedOrder)
  const playlists = useLibrary((state) => state.playlists)
  const followed = useLibrary((state) => state.followedArtists)
  const hasQueue = usePlayer((state) => state.queue.length > 0)
  const toggleImmersive = useUI((state) => state.toggleImmersive)

  const recent = recentTracks.slice(0, 10).map((entry) => entry.track)
  const liked = [...likedOrder]
    .reverse()
    .map((id) => likedTracks[id])
    .filter((track): track is Track => Boolean(track))
  const artists = Object.values(followed).slice(0, 8)

  return (
    <div className="page page--home">
      <div className="quick-grid">
        <button className="quick-tile" onClick={() => navigate('/search')}>
          <span className="quick-tile__art">
            <IconSearch size={20} />
          </span>
          <span className="quick-tile__label">Поиск</span>
        </button>
        <button className="quick-tile" onClick={() => navigate('/liked')}>
          <span className="quick-tile__art">
            {liked[0] ? <Artwork src={liked[0].cover} alt="" seed={liked[0].id} /> : <IconHeart size={20} />}
          </span>
          <span className="quick-tile__label">
            Любимые{liked.length ? ` · ${trackCountLabel(liked.length)}` : ''}
          </span>
        </button>
        <button className="quick-tile" onClick={() => navigate('/history')}>
          <span className="quick-tile__art">
            {recent[0] ? <Artwork src={recent[0].cover} alt="" seed={recent[0].id} /> : <IconClock size={20} />}
          </span>
          <span className="quick-tile__label">{recent[0] ? `Недавно: ${recent[0].title}` : 'Недавние'}</span>
        </button>
        <button className="quick-tile" onClick={() => navigate('/artists')}>
          <span className="quick-tile__art">
            <IconUsers size={20} />
          </span>
          <span className="quick-tile__label">Исполнители</span>
        </button>
        {hasQueue ? (
          <button className="quick-tile" onClick={toggleImmersive}>
            <span className="quick-tile__art">
              <IconPlay size={20} />
            </span>
            <span className="quick-tile__label">Сейчас играет</span>
          </button>
        ) : null}
      </div>

      {recent.length > 0 ? (
        <Section
          title="Недавние"
          action={
            <button className="section__link" onClick={() => navigate('/history')}>
              Все
            </button>
          }
        >
          <div className="tracklist">
            {recent.map((track, index) => (
              <TrackRow key={track.id} track={track} index={index} tracks={recent} contextLabel="Недавние" />
            ))}
          </div>
        </Section>
      ) : null}

      {liked.length > 0 ? (
        <Section
          title="Любимые"
          action={
            <button className="section__link" onClick={() => navigate('/liked')}>
              Все
            </button>
          }
        >
          <div className="tracklist">
            {liked.slice(0, 8).map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                tracks={liked.slice(0, 8)}
                contextLabel="Любимые"
              />
            ))}
          </div>
        </Section>
      ) : null}

      {playlists.length > 0 ? (
        <Section
          title="Плейлисты"
          action={
            <button className="section__link" onClick={() => navigate('/library')}>
              Все
            </button>
          }
        >
          <div className="chips">
            {playlists.slice(0, 8).map((playlist) => (
              <button key={playlist.id} className="chip" onClick={() => navigate(`/playlist/${playlist.id}`)}>
                <IconPlay size={12} /> {playlist.name}
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      {artists.length > 0 ? (
        <Section title="Вы подписаны">
          <div className="card-grid">
            {artists.map((artist) => (
              <button
                key={artist.id}
                className="card card--artist"
                onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
              >
                <div className="card__art card__art--round">
                  <Artwork src={artist.cover ?? ''} alt={artist.name} seed={artist.id} round />
                </div>
                <div className="card__title">{artist.name}</div>
                <div className="card__sub">Исполнитель</div>
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      {recent.length === 0 && liked.length === 0 && artists.length === 0 ? <StartSuggestions /> : null}
    </div>
  )
}

const SUGGESTIONS = [
  'LONOWN addiction',
  'Daft Punk Get Lucky',
  'Кино Группа крови',
  'Nirvana Smells Like Teen Spirit',
  'The Weeknd Blinding Lights',
  'Molchat Doma Судно',
]

/** A useful first screen: jump straight into a search instead of explaining. */
function StartSuggestions() {
  return (
    <Section title="Попробуйте" subtitle="Или введите своё название в поиске">
      <div className="chips">
        {SUGGESTIONS.map((query) => (
          <button
            key={query}
            className="chip"
            onClick={() => navigate(`/search?q=${encodeURIComponent(query)}`)}
          >
            <IconSearch size={12} /> {query}
          </button>
        ))}
      </div>
    </Section>
  )
}
