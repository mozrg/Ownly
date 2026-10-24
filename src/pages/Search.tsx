import { useEffect, useRef, useState } from 'react'
import { useAsync, useDebounced } from '../hooks/useAsync'
import { youtubeSearch } from '../lib/youtube'
import { navigate, useRoute } from '../lib/router'
import { Section, RowSkeleton } from '../components/Layout'
import { TrackRow } from '../components/TrackRow'
import { IconPlay, IconSearch } from '../components/Icons'
import { playTracks } from '../lib/actions'
import { useLibrary } from '../state/library'

const DEBOUNCE_MS = 200

export function SearchPage() {
  const route = useRoute()
  const queryParam = route.query.get('q') ?? ''
  const [raw, setRaw] = useState(queryParam)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounced = useDebounced(raw.trim(), DEBOUNCE_MS)
  const activeQuery = debounced

  useEffect(() => {
    setRaw(queryParam)
  }, [queryParam])

  // Keep the URL in sync so a query survives navigation and reloads.
  useEffect(() => {
    if (activeQuery === queryParam) return
    navigate(activeQuery ? `/search?q=${encodeURIComponent(activeQuery)}` : '/search', { replace: true })
  }, [activeQuery, queryParam])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="page">
      <div className="search-hero">
        <h1 className="search-hero__title">{activeQuery ? 'Поиск' : 'Что послушаем?'}</h1>
        <div className="search-field">
          <IconSearch size={17} />
          <input
            ref={inputRef}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder="Название песни, исполнитель или альбом"
            spellCheck={false}
            autoComplete="off"
            aria-label="Поиск"
          />
          {raw ? (
            <button className="search-field__clear" onClick={() => setRaw('')} aria-label="Очистить">
              ×
            </button>
          ) : null}
        </div>
      </div>

      {/* `key` remounts on a new query: without it the previous query's
          results stay on screen while the next one loads. */}
      {activeQuery ? <Results key={activeQuery} query={activeQuery} /> : <Browse />}
    </div>
  )
}

function Results({ query }: { query: string }) {
  const { data, loading, error, reload } = useAsync(() => youtubeSearch(query, 30), [query])
  const tracks = data ?? []
  const rememberTracks = useLibrary((state) => state.rememberTracks)

  useEffect(() => {
    if (tracks.length === 0) return
    rememberTracks(tracks)
  }, [tracks, rememberTracks])

  if (loading && tracks.length === 0) {
    return (
      <>
        <div className="section__eyebrow" style={{ marginBottom: 12 }}>
          Ищем «{query}»
        </div>
        <RowSkeleton count={8} />
      </>
    )
  }

  if (error && tracks.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">
          <IconSearch size={26} />
        </div>
        <div className="empty__title">Не удалось выполнить поиск</div>
        <div className="empty__text">{error}</div>
        <button className="btn btn--secondary btn--sm" style={{ marginTop: 12 }} onClick={reload}>
          Повторить
        </button>
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">
          <IconSearch size={26} />
        </div>
        <div className="empty__title">Ничего не найдено</div>
        <div className="empty__text">
          По запросу «{query}» пусто. Попробуйте написать иначе — например, только исполнителя
          или название без лишних слов.
        </div>
      </div>
    )
  }

  return (
    <div data-search-results={query} data-search-source="youtube">
      <Section
        title="Треки"
        subtitle="Полные версии — играют целиком"
        action={
          <button className="btn btn--secondary btn--sm" onClick={() => playTracks(tracks, 0, `Поиск: ${query}`)}>
            <IconPlay size={13} /> Слушать все
          </button>
        }
      >
        <div className="tracklist">
          {tracks.map((track, index) => (
            <TrackRow key={track.id} track={track} index={index} tracks={tracks} contextLabel={`Поиск: ${query}`} />
          ))}
        </div>
      </Section>
    </div>
  )
}

function Browse() {
  const recentTracks = useLibrary((state) => state.recentTracks)
  const likedTracks = useLibrary((state) => state.likedTracks)
  const likedOrder = useLibrary((state) => state.likedOrder)
  const playlists = useLibrary((state) => state.playlists)

  const recentList = recentTracks.slice(0, 12).map((entry) => entry.track)

  const liked = [...likedOrder]
    .reverse()
    .map((id) => likedTracks[id])
    .filter(Boolean)
    .slice(0, 12)

  return (
    <>
      <div className="empty" style={{ padding: '36px 24px 24px' }}>
        <div className="empty__icon">
          <IconSearch size={26} />
        </div>
        <div className="empty__title">Начните с названия песни</div>
        <div className="empty__text">
          Ownly найдёт запись и включит её целиком. Можно искать по исполнителю или альбому.
        </div>
      </div>

      {recentList.length > 0 ? (
        <Section
          title="Недавние"
          action={
            <button className="section__link" onClick={() => navigate('/history')}>
              Все
            </button>
          }
        >
          <div className="tracklist">
            {recentList.map((track, index) => (
              <TrackRow key={track.id} track={track} index={index} tracks={recentList} contextLabel="Недавние" />
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
            {liked.map((track, index) => (
              <TrackRow key={track.id} track={track} index={index} tracks={liked} contextLabel="Любимые" />
            ))}
          </div>
        </Section>
      ) : null}

      {playlists.length > 0 ? (
        <Section title="Плейлисты">
          <div className="chips">
            {playlists.map((playlist) => (
              <button key={playlist.id} className="chip" onClick={() => navigate(`/playlist/${playlist.id}`)}>
                {playlist.name}
              </button>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  )
}
