import { useEffect, useRef, useState } from 'react'
import { navigate, useHistoryState, useRoute, goBack, goForward } from '../lib/router'
import { BrandMark, IconChevronLeft, IconChevronRight, IconSearch, IconClose, IconMinimize, IconSquare, IconMaximize, IconClose as IconX } from './Icons'

const isDesktop = typeof window !== 'undefined' && Boolean(window.ownly?.isDesktop)

export function TitleBar() {
  const route = useRoute()
  const { canBack, canForward } = useHistoryState()
  const [value, setValue] = useState('')
  const [maximized, setMaximized] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onSearchPage = route.path === '/search'
  const queryParam = route.query.get('q') ?? ''

  useEffect(() => {
    if (onSearchPage) setValue(queryParam)
    else setValue('')
  }, [onSearchPage, queryParam])

  useEffect(() => {
    if (!window.ownly?.onWindowState) return
    void window.ownly.isMaximized().then((state) => setMaximized(state.maximized))
    return window.ownly.onWindowState((state) => setMaximized(state.maximized))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isFind = (event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'k')
      if (isFind) {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleChange = (next: string) => {
    setValue(next)
    const trimmed = next.trim()
    if (!trimmed) {
      if (onSearchPage) navigate('/search', { replace: true })
      return
    }
    const target = `/search?q=${encodeURIComponent(trimmed)}`
    navigate(target, { replace: onSearchPage })
  }

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <BrandMark size={21} style={{ color: 'var(--text)' }} />
        <span className="titlebar__wordmark">Ownly</span>
      </div>

      <div className="titlebar__nav">
        <button className="icon-btn" onClick={goBack} disabled={!canBack} aria-label="Назад">
          <IconChevronLeft size={17} />
        </button>
        <button className="icon-btn" onClick={goForward} disabled={!canForward} aria-label="Вперёд">
          <IconChevronRight size={17} />
        </button>
      </div>

      <label className="search-pill">
        <IconSearch size={15} />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => {
            if (!onSearchPage) navigate('/search')
          }}
          placeholder="Альбомы, треки, исполнители"
          aria-label="Поиск"
          spellCheck={false}
        />
        {value ? (
          <button
            className="icon-btn"
            style={{ width: 20, height: 20 }}
            onClick={(event) => {
              event.preventDefault()
              handleChange('')
              inputRef.current?.focus()
            }}
            aria-label="Очистить"
          >
            <IconClose size={13} />
          </button>
        ) : (
          <kbd>Ctrl K</kbd>
        )}
      </label>

      <div className="titlebar__spacer" />

      {isDesktop && (
        <div className="win-controls">
          <button onClick={() => window.ownly?.minimize()} aria-label="Свернуть">
            <IconMinimize size={15} />
          </button>
          <button onClick={() => window.ownly?.toggleMaximize()} aria-label={maximized ? 'Восстановить' : 'Развернуть'}>
            {maximized ? <IconSquare size={13} /> : <IconMaximize size={14} />}
          </button>
          <button className="is-close" onClick={() => window.ownly?.close()} aria-label="Закрыть">
            <IconX size={15} />
          </button>
        </div>
      )}
    </header>
  )
}
