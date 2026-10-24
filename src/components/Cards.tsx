import type { AlbumSummary, Artist } from '../lib/types'
import { navigate } from '../lib/router'
import { useLibrary } from '../state/library'
import { Artwork } from './Artwork'
import { cx } from '../lib/format'
import { IconPlay } from './Icons'

/**
 * A release card. There are no album pages any more, so the card opens the
 * artist — the only place where a playable list of tracks lives.
 */
export function AlbumCard({ album, round, badge }: AlbumCardProps) {
  const recordView = useLibrary((state) => state.recordAlbumView)

  return (
    <button
      className="card"
      onClick={() => {
        recordView(album)
        navigate(`/artist/${encodeURIComponent(album.artist)}`)
      }}
      aria-label={`${album.title} — ${album.artist}`}
    >
      <div className={cx('card__art', round && 'card__art--round')}>
        <Artwork src={album.cover} alt={album.title} seed={album.id} />
        {badge && <span className="card__badge">{badge}</span>}
        <span className="card__play" aria-hidden="true">
          <IconPlay size={15} />
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="card__title">{album.title}</div>
        <div
          className="card__sub card__sub--link"
          onClick={(event) => {
            event.stopPropagation()
            navigate(`/artist/${encodeURIComponent(album.artist)}`)
          }}
        >
          {album.artist}
        </div>
      </div>
    </button>
  )
}

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <button className="card" onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}>
      <div className="card__art card__art--round">
        <Artwork src={artist.cover} alt={artist.name} seed={artist.name} round />
        <span className="card__play" aria-hidden="true">
          <IconPlay size={15} />
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="card__title">{artist.name}</div>
        <div className="card__sub">Исполнитель</div>
      </div>
    </button>
  )
}

interface AlbumCardProps {
  album: AlbumSummary
  round?: boolean
  badge?: string
}
