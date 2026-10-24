/// <reference types="vite/client" />

interface WindowState {
  maximized: boolean
  fullscreen: boolean
}

interface YtSearchResult {
  id: string
  title: string
  duration: number
  channel: string
  thumbnail: string
  url: string
}

interface DiscordStatus {
  state: string
  message: string
}

interface OwnlyBridge {
  platform: string
  isDesktop: boolean
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  isMaximized: () => Promise<WindowState>
  onWindowState: (callback: (state: WindowState) => void) => () => void
  appInfo: () => Promise<{ version: string; electron: string; chrome: string; platform: string }>
  openExternal: (url: string) => Promise<unknown>
  ytSearch: (query: string, limit?: number) => Promise<YtSearchResult[]>
  ytStream: (videoId: string) => Promise<string>
  ytAvailable: () => Promise<boolean>
  ytPlaylist: (url: string) => Promise<{
    ok: boolean
    error?: string
    name?: string
    entries?: Array<{ id: string; title: string; channel: string; duration: number }>
  }>
  netJson: (url: string) => Promise<{ ok: boolean; status: number; body?: string; error?: string }>
  spotifyPlaylist: (payload: { playlistId: string }) => Promise<{
    ok: boolean
    error?: string
    name?: string
    cover?: string | null
    entries?: Array<{ title: string; artists: string[]; duration: number }>
  }>
  discordStatus: () => Promise<DiscordStatus>
  discordConfigure: (options: { enabled: boolean; clientId?: string }) => Promise<DiscordStatus>
  discordActivity: (activity: Record<string, unknown> | null) => Promise<DiscordStatus>
  onDiscordStatus: (callback: (status: DiscordStatus) => void) => () => void
}

interface Window {
  ownly?: OwnlyBridge
  __ownlyPlayer?: any
  __ownlyAudio?: HTMLAudioElement
}
