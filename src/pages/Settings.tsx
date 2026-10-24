import { useEffect, useState } from 'react'
import { useLibrary } from '../state/library'
import { useUI } from '../state/ui'
import { usePlayer } from '../state/player'
import { clearHttpCache } from '../lib/http'
import { Section } from '../components/Layout'
import { BrandMark, IconTrash } from '../components/Icons'
import { toast } from '../state/ui'
import { PRESENCE_LABEL, useDiscord } from '../state/discord'

interface AppInfo {
  version: string
  electron: string
  chrome: string
  platform: string
}

const SHORTCUTS: Array<[string, string]> = [
  ['Пробел', 'Играть / пауза'],
  ['← / →', 'Перемотка на 5 секунд'],
  ['Shift + ← / →', 'Предыдущий / следующий трек'],
  ['Ctrl + ↑ / ↓', 'Громкость'],
  ['M', 'Выключить звук'],
  ['L', 'В любимые'],
  ['S', 'Перемешать'],
  ['R', 'Режим повтора'],
  ['F', 'Полноэкранный плеер'],
  ['Ctrl + K', 'Поиск'],
  ['Esc', 'Закрыть панель'],
]

export function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const collapsed = useUI((state) => state.sidebarCollapsed)
  const toggleSidebar = useUI((state) => state.toggleSidebar)
  const likedCount = useLibrary((state) => state.likedOrder.length)
  const playlists = useLibrary((state) => state.playlists)
  const likedAlbums = useLibrary((state) => state.likedAlbums)
  const clearHistory = useLibrary((state) => state.clearHistory)
  const volume = usePlayer((state) => state.volume)

  const discordEnabled = useDiscord((state) => state.enabled)
  const discordState = useDiscord((state) => state.state)
  const discordMessage = useDiscord((state) => state.message)
  const setDiscordEnabled = useDiscord((state) => state.setEnabled)
  const setDiscordStatus = useDiscord((state) => state.setStatus)

  useEffect(() => {
    if (!window.ownly?.onDiscordStatus) return
    return window.ownly.onDiscordStatus((status) => {
      setDiscordStatus(status.state as never, status.message)
    })
  }, [setDiscordStatus])

  useEffect(() => {
    void window.ownly?.appInfo().then((value) => setInfo(value as AppInfo))
  }, [])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="section__eyebrow">Ownly</div>
          <h1 className="page-head__title">Настройки</h1>
          <div className="page-head__sub">Плеер, внешний вид и данные</div>
        </div>
      </div>

      <div className="settings">
        <div className="settings__group">
          <div className="settings__group-title">Интерфейс</div>
          <div className="setting-row">
            <div>
              <div className="setting-row__title">Компактная боковая панель</div>
              <div className="setting-row__text">Оставить только иконки — больше места для обложек и списков.</div>
            </div>
            <button className={`toggle${collapsed ? ' is-on' : ''}`} onClick={toggleSidebar} aria-label="Компактная панель" />
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-row__title">Громкость</div>
              <div className="setting-row__text">Запоминается между запусками.</div>
            </div>
            <span className="settings__value">{Math.round(volume * 100)}%</span>
          </div>
        </div>

        <div className="settings__group">
          <div className="settings__group-title">Discord</div>
          <div className="setting-row">
            <div>
              <div className="setting-row__title">Rich Presence</div>
              <div className="setting-row__text">
                Показывать в профиле Discord, что вы слушаете — с обложкой и прогрессом.
              </div>
              {discordEnabled ? (
                <div className={`setting-row__status is-${discordState}`}>
                  <span className="setting-row__dot" />
                  {PRESENCE_LABEL[discordState]}
                  {discordMessage && discordState !== 'ready' && discordState !== 'off' ? ` · ${discordMessage}` : ''}
                </div>
              ) : null}
            </div>
            <button
              className={`toggle${discordEnabled ? ' is-on' : ''}`}
              onClick={() => setDiscordEnabled(!discordEnabled)}
              aria-label="Discord Rich Presence"
            />
          </div>
        </div>

        <div className="settings__group">
          <div className="settings__group-title">Данные</div>
          <div className="setting-row">
            <div>
              <div className="setting-row__title">Коллекция</div>
              <div className="setting-row__text">
                {likedCount} любимых треков · {Object.keys(likedAlbums).length} альбомов · {playlists.length} плейлистов. Хранится локально на этом
                компьютере.
              </div>
            </div>
            <span className="settings__value">локально</span>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-row__title">История прослушиваний</div>
              <div className="setting-row__text">Список недавних треков и изданий.</div>
            </div>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => {
                clearHistory()
                toast('История очищена')
              }}
            >
              <IconTrash size={14} /> Очистить
            </button>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-row__title">Кэш каталога</div>
              <div className="setting-row__text">Метаданные изданий кэшируются на 30 минут, чтобы страницы открывались мгновенно.</div>
            </div>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => {
                clearHttpCache()
                toast('Кэш очищен')
              }}
            >
              Сбросить
            </button>
          </div>
        </div>

        <div className="settings__group">
          <div className="settings__group-title">Горячие клавиши</div>
          <div className="setting-row" style={{ display: 'block' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px 24px' }}>
              {SHORTCUTS.map(([keys, label]) => (
                <div key={keys} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{label}</span>
                  <span className="settings__kbd">
                    {keys.split(' + ').map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Section title="О приложении">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <BrandMark size={44} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Ownly</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                Версия {info?.version ?? '1.0.0'}
                {info ? ` · Electron ${info.electron} · Chromium ${info.chrome}` : ''}
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
