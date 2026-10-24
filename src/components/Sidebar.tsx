import { useState } from 'react'
import { navigate, useRoute } from '../lib/router'
import { useLibrary } from '../state/library'
import { useUI } from '../state/ui'
import { Modal } from './Modal'
import {
  IconHome,
  IconSearch,
  IconHeart,
  IconClock,
  IconDisc,
  IconUsers,
  IconPlus,
  IconSettings,
  IconList,
  IconLibrary,
} from './Icons'
import { cx } from '../lib/format'

const NAV = [
  { path: '/', label: 'Главная', icon: IconHome },
  { path: '/search', label: 'Поиск', icon: IconSearch },
]

const COLLECTION = [
  { path: '/liked', label: 'Любимые треки', icon: IconHeart },
  { path: '/library', label: 'Коллекция', icon: IconLibrary },
  { path: '/history', label: 'Недавние', icon: IconClock },
  { path: '/artists', label: 'Исполнители', icon: IconUsers },
]

export function Sidebar() {
  const route = useRoute()
  const collapsed = useUI((state) => state.sidebarCollapsed)
  const playlists = useLibrary((state) => state.playlists)
  const likedCount = useLibrary((state) => state.likedOrder.length)
  const createPlaylist = useLibrary((state) => state.createPlaylist)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const isActive = (path: string) => (path === '/' ? route.path === '/' : route.path === path || route.path.startsWith(`${path}/`))

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = createPlaylist(trimmed)
    setName('')
    setCreating(false)
    navigate(`/playlist/${id}`)
  }

  return (
    <aside className={cx('sidebar', collapsed && 'is-collapsed')}>
      <div className="sidebar__scroll scroll-area no-scrollbar">
        {NAV.map((item) => (
          <button key={item.path} className={cx('nav-item', isActive(item.path) && 'is-active')} onClick={() => navigate(item.path)} title={item.label}>
            <item.icon size={18} />
            <span className="nav-item__label">{item.label}</span>
          </button>
        ))}

        <div className="sidebar__section-label">
          <span>Коллекция</span>
        </div>

        {COLLECTION.map((item) => (
          <button key={item.path} className={cx('nav-item', isActive(item.path) && 'is-active')} onClick={() => navigate(item.path)} title={item.label}>
            <item.icon size={18} />
            <span className="nav-item__label">{item.label}</span>
            {item.path === '/liked' && likedCount > 0 && <span className="nav-item__badge">{likedCount}</span>}
          </button>
        ))}

        <div className="sidebar__section-label">
          <span>Плейлисты</span>
          <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setCreating(true)} aria-label="Создать плейлист">
            <IconPlus size={14} />
          </button>
        </div>

        <div className="playlist-list">
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              className={cx('playlist-item', route.path === `/playlist/${playlist.id}` && 'is-active')}
              onClick={() => navigate(`/playlist/${playlist.id}`)}
              title={playlist.name}
            >
              <span className="playlist-item__art" style={{ display: 'grid', placeItems: 'center' }}>
                <IconList size={13} />
              </span>
              <span className="playlist-item__name">{playlist.name}</span>
            </button>
          ))}
          {playlists.length === 0 && !collapsed && (
            <button className="sidebar__create" onClick={() => setCreating(true)}>
              <IconPlus size={14} /> Создать плейлист
            </button>
          )}
        </div>
      </div>

      <div className="sidebar__footer">
        <button className={cx('nav-item', route.path === '/settings' && 'is-active')} onClick={() => navigate('/settings')} title="Настройки">
          <IconSettings size={18} />
          <span className="nav-item__label">Настройки</span>
        </button>
        <button className="icon-btn" onClick={() => useUI.getState().toggleSidebar()} aria-label="Свернуть панель">
          <IconDisc size={16} />
        </button>
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Новый плейлист"
        description="Назовите подборку — треки добавим позже."
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setCreating(false)}>
              Отмена
            </button>
            <button className="btn btn--primary" onClick={handleCreate} disabled={!name.trim()}>
              Создать
            </button>
          </>
        }
      >
        <input
          className="input"
          autoFocus
          placeholder="Например, «Ночная езда»"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
        />
      </Modal>
    </aside>
  )
}
