import { useEffect, useLayoutEffect } from 'react'
import { useRoute } from './lib/router'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { PlayerBar } from './components/PlayerBar'
import { RightPanel } from './components/RightPanel'
import { Immersive } from './components/Immersive'
import { Toasts } from './components/Toasts'
import { MenuHost } from './components/Menu'
import { PlaylistPickerHost } from './components/PlaylistPicker'
import { HomePage } from './pages/Home'
import { SearchPage } from './pages/Search'
import { ArtistPage } from './pages/Artist'
import { ArtistsPage, HistoryPage, LibraryPage, LikedPage } from './pages/Library'
import { PlaylistPage } from './pages/Playlist'
import { SettingsPage } from './pages/Settings'
import { EmptyState } from './components/Layout'
import { IconSearch } from './components/Icons'
import { usePlayer, initPlayTracking } from './state/player'
import { useLibrary } from './state/library'
import { useUI, toast } from './state/ui'
import { toggleLike } from './lib/actions'
import { publishPresence, useDiscord } from './state/discord'

function RouteView() {
  const route = useRoute()
  const [head, second] = route.segments

  switch (head) {
    case undefined:
      return <HomePage />
    case 'search':
      return <SearchPage />
    case 'artist':
      return second ? <ArtistPage /> : <HomePage />
    case 'library':
      return <LibraryPage />
    case 'liked':
      return <LikedPage />
    case 'history':
      return <HistoryPage />
    case 'artists':
      return <ArtistsPage />
    case 'playlist':
      return second ? <PlaylistPage /> : <LibraryPage />
    case 'settings':
      return <SettingsPage />
    default:
      return (
        <div className="page">
          <EmptyState
            icon={<IconSearch size={30} />}
            title="Страница не найдена"
            text="Проверьте адрес или вернитесь на главную."
          />
        </div>
      )
  }
}

export default function App() {
  const route = useRoute()
  const setImmersive = useUI((state) => state.setImmersive)
  const immersive = useUI((state) => state.immersive)
  const setRightPanel = useUI((state) => state.setRightPanel)

  /* Scroll the content pane back to the top on navigation. */
  useLayoutEffect(() => {
    const pane = document.getElementById('main-scroll')
    if (!pane) return
    const reset = () => {
      pane.scrollTop = 0
    }
    reset()
    const frame = requestAnimationFrame(reset)
    const timer = window.setTimeout(reset, 220)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [route.full])

  /* Record plays into the local history. */
  useEffect(() => {
    initPlayTracking()
    const onPlayed = (event: Event) => {
      const track = (event as CustomEvent).detail
      if (track) useLibrary.getState().recordPlay(track)
    }
    const onFailed = (event: Event) => {
      const track = (event as CustomEvent).detail
      if (track) toast(`«${track.title}» недоступен — пропускаем`, 'danger')
    }
    window.addEventListener('ownly:played', onPlayed)
    window.addEventListener('ownly:trackfailed', onFailed)
    return () => {
      window.removeEventListener('ownly:played', onPlayed)
      window.removeEventListener('ownly:trackfailed', onFailed)
    }
  }, [])

  /* Discord Rich Presence follows the player. */
  const discordEnabled = useDiscord((state) => state.enabled)

  useEffect(() => {
    if (!discordEnabled) {
      void publishPresence(null)
      return
    }

    let lastKey = ''

    const push = () => {
      const player = usePlayer.getState()
      const item = player.queue[player.order[player.cursor]]
      if (!item) {
        void publishPresence(null)
        return
      }
      // Only republish when something Discord shows actually changed;
      // position ticks would otherwise flood the pipe.
      const key = `${item.id}|${player.isPlaying}`
      if (key === lastKey) return
      lastKey = key

      const activity: Record<string, unknown> = {
        details: item.title.slice(0, 128),
        state: item.artist.slice(0, 128),
        assets: {
          large_image: item.cover || undefined,
          large_text: (item.album || 'Ownly').slice(0, 128),
        },
      }
      if (player.isPlaying) {
        activity.timestamps = { start: Math.round(Date.now() - player.position * 1000) }
      }
      if (item.sourceUrl) {
        activity.buttons = [{ label: 'Слушать в Ownly', url: item.sourceUrl }]
      }
      void publishPresence(activity)
    }

    push()
    return usePlayer.subscribe(push)
  }, [discordEnabled])

  /* Global keyboard shortcuts. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return

      const player = usePlayer.getState()
      const current = player.queue[player.order[player.cursor]]

      switch (event.key.toLowerCase()) {
        case ' ':
          event.preventDefault()
          player.toggle()
          break
        case 'arrowright':
          event.preventDefault()
          player.seek(player.position + 5)
          break
        case 'arrowleft':
          event.preventDefault()
          player.seek(Math.max(0, player.position - 5))
          break
        case 'm':
          player.toggleMute()
          break
        case 's':
          player.toggleShuffle()
          break
        case 'r':
          player.cycleRepeat()
          break
        case 'l':
          if (current) toggleLike(current)
          break
        case 'f':
          setImmersive(!immersive)
          break
        case 'escape':
          setImmersive(false)
          setRightPanel('closed')
          break
        default:
          break
      }

      if (event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault()
        player.next()
      }
      if (event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        player.previous()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [immersive, setImmersive, setRightPanel])

  return (
    <div className="app">
      <TitleBar />
      <div className="shell">
        <Sidebar />
        <div className="main-pane">
          <main className="main-scroll scroll-area" id="main-scroll">
            <RouteView />
          </main>
          <RightPanel />
        </div>
      </div>
      <PlayerBar />
      <Immersive />
      <Toasts />
      <MenuHost />
      <PlaylistPickerHost />
    </div>
  )
}
