/** Discord Rich Presence settings and the bridge to the main process. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PresenceState = 'off' | 'connecting' | 'ready' | 'no-discord' | 'bad-id' | 'error'

/**
 * Ownly ships one Discord application, so the id is a constant rather than a
 * setting: asking people to create their own application was a support burden
 * with no benefit.
 */
export const DISCORD_APP_ID = '1563199207899140166'

interface DiscordState {
  enabled: boolean
  state: PresenceState
  message: string
  setEnabled: (value: boolean) => void
  apply: () => Promise<void>
  setStatus: (state: PresenceState, message: string) => void
}

export const useDiscord = create<DiscordState>()(
  persist(
    (set, get) => ({
      enabled: false,
      state: 'off',
      message: '',

      setEnabled: (value) => {
        set({ enabled: value })
        void get().apply()
      },

      apply: async () => {
        const bridge = window.ownly
        if (!bridge?.discordConfigure) return
        const { enabled } = get()
        if (!enabled) {
          const status = await bridge.discordConfigure({ enabled: false })
          set({ state: status.state as PresenceState, message: status.message })
          return
        }
        set({ state: 'connecting', message: '' })
        const status = await bridge.discordConfigure({ enabled: true, clientId: DISCORD_APP_ID })
        set({ state: status.state as PresenceState, message: status.message })
      },

      setStatus: (state, message) => set({ state, message }),
    }),
    {
      name: 'ownly.discord',
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
)

/** Pushes the current track to Discord. `null` clears the presence. */
export async function publishPresence(activity: Record<string, unknown> | null) {
  const bridge = window.ownly
  if (!bridge?.discordActivity) return
  await bridge.discordActivity(activity)
}

export const PRESENCE_LABEL: Record<PresenceState, string> = {
  off: 'Выключено',
  connecting: 'Подключаемся…',
  ready: 'Подключено к Discord',
  'no-discord': 'Discord не запущен',
  'bad-id': 'Неверный Application ID',
  error: 'Ошибка Discord',
}
