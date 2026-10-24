const { app, BrowserWindow, ipcMain, shell, screen, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { execFile } = require('node:child_process')
const { DiscordPresence } = require('./discord.cjs')
const { spotifyPlaylist } = require('./spotify.cjs')

const isDev = !!process.env.VITE_DEV_SERVER_URL
const SHOOT_DIR = process.env.OWNLY_SHOOT_DIR || null

/** @type {BrowserWindow | null} */
let win = null

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')

function loadWindowState() {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.width === 'number' && typeof parsed.height === 'number') return parsed
  } catch {
    /* first run */
  }
  return { width: 1440, height: 900 }
}

function saveWindowState() {
  if (!win) return
  try {
    const bounds = win.getNormalBounds()
    fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }))
  } catch {
    /* ignore */
  }
}

function createWindow() {
  const saved = loadWindowState()
  const area = screen.getPrimaryDisplay().workAreaSize

  win = new BrowserWindow({
    width: Math.min(saved.width, area.width),
    height: Math.min(saved.height, area.height),
    x: saved.x,
    y: saved.y,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#0B0B0C',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 18 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })

  win.setMenuBarVisibility(false)

  if (saved.maximized) win.maximize()

  win.once('ready-to-show', () => {
    win.show()
  })

  const emitMaximized = () => {
    if (!win) return
    win.webContents.send('win:state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen() })
  }
  win.on('maximize', emitMaximized)
  win.on('unmaximize', emitMaximized)
  win.on('enter-full-screen', emitMaximized)
  win.on('leave-full-screen', emitMaximized)
  win.on('resize', saveWindowState)
  win.on('move', saveWindowState)

  // External links open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const current = win?.webContents.getURL() ?? ''
    if (url.split('#')[0] !== current.split('#')[0]) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  win.webContents.on('did-finish-load', () => {
    emitMaximized()
    if (SHOOT_DIR) runShoot(win)
    else if (process.env.OWNLY_E2E) runE2E(win)
    else if (process.env.OWNLY_PLAYBACK) runPlaybackAudit(win)
    else if (process.env.OWNLY_AUDIT) runSearchAudit(win)
    else if (process.env.OWNLY_SMOKE) runSmoke(win)
  })

  win.on('closed', () => {
    win = null
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

/* ------------------------------------------------------------------ */
/* window controls                                                     */
/* ------------------------------------------------------------------ */

ipcMain.on('win:minimize', () => win?.minimize())
ipcMain.on('win:toggle-maximize', () => {
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('win:close', () => win?.close())
ipcMain.handle('win:is-maximized', () => ({ maximized: win?.isMaximized() ?? false, fullscreen: win?.isFullScreen() ?? false }))

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
}))

ipcMain.handle('app:open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) return shell.openExternal(url)
  return false
})

/* ------------------------------------------------------------------ */
/* JSON proxy for services that send no CORS headers                   */
/* ------------------------------------------------------------------ */

/**
 * Public catalogue APIs (Yandex Music among them) reject browser requests
 * because they send no Access-Control-Allow-Origin. Fetching from the main
 * process sidesteps that, and the host allowlist keeps this from becoming an
 * open proxy.
 */
const JSON_PROXY_HOSTS = [/^api\.music\.yandex\.net$/i, /^open\.spotify\.com$/i, /^api\.deezer\.com$/i]

ipcMain.handle('net:json', async (_event, url) => {
  let parsed
  try {
    parsed = new URL(String(url))
  } catch {
    return { ok: false, status: 0, error: 'bad-url' }
  }
  if (!JSON_PROXY_HOSTS.some((pattern) => pattern.test(parsed.hostname))) {
    return { ok: false, status: 0, error: 'host-not-allowed' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    })
    const text = await response.text()
    clearTimeout(timer)
    return { ok: response.ok, status: response.status, body: text }
  } catch (error) {
    clearTimeout(timer)
    return { ok: false, status: 0, error: String(error?.message ?? error) }
  }
})

/* ------------------------------------------------------------------ */
/* Spotify                                                             */
/* ------------------------------------------------------------------ */

ipcMain.handle('spotify:playlist', (_event, payload) => spotifyPlaylist(payload))

/* ------------------------------------------------------------------ */
/* Discord Rich Presence                                               */
/* ------------------------------------------------------------------ */

const presence = new DiscordPresence()
presence.onChange((status) => {
  win?.webContents.send('discord:status', status)
})

ipcMain.handle('discord:status', () => ({ state: presence.state, message: presence.message }))

ipcMain.handle('discord:configure', async (_event, options) => {
  const enabled = Boolean(options?.enabled)
  const clientId = String(options?.clientId ?? '').trim()
  if (!enabled) {
    presence.destroy()
    return { state: presence.state, message: presence.message }
  }
  await presence.connect(clientId)
  return { state: presence.state, message: presence.message }
})

ipcMain.handle('discord:activity', (_event, activity) => {
  presence.setActivity(activity ?? null)
  return { state: presence.state, message: presence.message }
})

app.on('before-quit', () => presence.destroy())

/* ------------------------------------------------------------------ */
/* YouTube via yt-dlp — the app's main catalogue                       */
/* ------------------------------------------------------------------ */

const YTDLP = app.isPackaged
  ? path.join(process.resourcesPath, 'yt-dlp.exe')
  : path.join(__dirname, '..', 'resources', 'yt-dlp.exe')

/**
 * Player client order. yt-dlp itself walks this list inside a single process,
 * which is far faster than spawning one process per client and having them
 * compete for the same slow link.
 */
const YT_CLIENT_CHAIN = 'android,tv_embedded,ios,web'

/**
 * Runs yt-dlp with parallel attempts, each getting its own argument list.
 *
 * The link to YouTube from some networks stalls without ever failing, so a
 * serial retry burns a full timeout before trying again. Racing a second
 * attempt means a stuck connection costs one short timeout, not the whole wait.
 * `attempts` is an array of argument arrays; `stagger` delays all but the first.
 */
function raceYtDlp(attempts, { timeout = 45_000, accept = null, stagger = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let pending = attempts.length
    let settled = false
    let best = null
    let lastError = null
    const timers = []
    const children = new Set()

    const finish = (value, error) => {
      if (settled) return
      settled = true
      for (const timer of timers) clearTimeout(timer)
      for (const child of children) {
        try {
          child.kill()
        } catch {
          /* already gone */
        }
      }
      if (error) reject(error)
      else resolve(value)
    }

    const done = (stdout, error, stderr) => {
      pending -= 1
      if (!error && stdout && stdout.trim()) {
        if (!accept || accept(stdout)) {
          finish(stdout)
          return
        }
        best = best ?? stdout
      } else {
        lastError = new Error((stderr || error?.message || 'yt-dlp failed').trim().slice(0, 300))
      }
      if (pending <= 0) {
        if (best) finish(best)
        else finish(null, lastError ?? new Error('YouTube недоступен'))
      }
    }

    attempts.forEach((args, index) => {
      const start = () => {
        if (settled) return
        const child = execFile(
          YTDLP,
          args,
          { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
          (error, stdout, stderr) => {
            children.delete(child)
            done(stdout, error, stderr)
          },
        )
        children.add(child)
      }
      if (index === 0 || stagger === 0) start()
      else timers.push(setTimeout(start, stagger * index))
    })
  })
}

/**
 * Common yt-dlp arguments.
 *
 * The socket timeout is deliberately short: this link stalls for tens of
 * seconds without failing, and a stalled read is worth retrying immediately.
 * These calls only fetch metadata — the audio itself is streamed by the
 * renderer, so an aggressive timeout costs nothing in playback quality.
 */
function ytArgs(extra, client = YT_CLIENT_CHAIN, socketTimeout = '2') {
  return [
    '--no-warnings',
    '--socket-timeout',
    socketTimeout,
    '--retries',
    '2',
    '--extractor-args',
    `youtube:player_client=${client}`,
    ...extra,
  ]
}

/* ------------------------------------------------------------------ */
/* Music-only result shaping                                           */
/* ------------------------------------------------------------------ */

/** Auto-generated mixes and radios are never a single song. */
const YT_MIX_ID = /^RD/
/** Long-form uploads: hour loops, full albums, DJ sets. */
const YT_LONG_MINUTES = 15
/** Titles that are not a song even when they contain the query. */
const YT_NOT_MUSIC = /\b(?:podcast|interview|trailer|teaser|reaction|tutorial|behind the scenes|unboxing|audiobook)\b/i
const YT_LOOP = /\b(?:1|one|10|twelve|\d+)\s*(?:hour|hr)s?\b|\bhour\s*loop\b|\bloop(?:ed)?\s*(?:for|1)\b/i

function scoreSong(entry, query) {
  const title = String(entry.title ?? '').toLowerCase()
  const channel = String(entry.channel ?? entry.uploader ?? '').toLowerCase()
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 1)

  let score = 0
  for (const token of tokens) {
    if (title.includes(token)) score += 3
    if (channel.includes(token)) score += 5
  }
  // "Artist - Topic" channels are YouTube's auto-generated song catalogue.
  if (/\s-\s*topic$/.test(channel)) score += 4
  // Studio-length audio is the sweet spot for a song.
  const duration = Number(entry.duration) || 0
  if (duration >= 60 && duration <= 600) score += 3
  else if (duration > 600 && duration <= YT_LONG_MINUTES * 60) score += 1
  // A channel that repeats the artist name is a strong signal.
  if (channel && title.startsWith(channel)) score += 2
  if (/\(official|official\s+(?:audio|video|music\s+video)\)/i.test(String(entry.title ?? ''))) score += 1
  return score
}

/** Keeps only things that look like an actual song, best match first. */
function shapeSongs(entries, query) {
  const seen = new Set()
  const scored = []

  for (const entry of entries) {
    if (!entry || !entry.id) continue
    if (YT_MIX_ID.test(entry.id)) continue

    const title = String(entry.title ?? '')
    if (!title.trim()) continue
    if (YT_NOT_MUSIC.test(title) || YT_LOOP.test(title)) continue

    const duration = Number(entry.duration) || 0
    if (duration && duration < 30) continue
    if (duration > YT_LONG_MINUTES * 60) continue
    if (seen.has(entry.id)) continue
    seen.add(entry.id)

    scored.push({ entry, score: scoreSong(entry, query) })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.map((item) => item.entry)
}

function toResult(entry) {
  return {
    id: entry.id,
    title: entry.title ?? '',
    duration: Number(entry.duration) || 0,
    channel: entry.channel ?? entry.uploader ?? '',
    thumbnail:
      entry.thumbnails?.length > 0
        ? entry.thumbnails[entry.thumbnails.length - 1].url
        : `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
    url: entry.url ?? `https://www.youtube.com/watch?v=${entry.id}`,
  }
}

/**
 * Fetches YouTube's results page and parses the embedded payload.
 *
 * This replaces shelling out to yt-dlp for search: the page carries everything
 * a search needs (id, title, duration, channel, thumbnail) in one request,
 * which takes well under a second when the connection comes up at all.
 * `sp` biases the results towards songs.
 */
const YT_SEARCH_SP = 'EgWKAQIIAWoMEA4QChADEAQQCRAF'
const YT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  Cookie: 'CONSENT=YES+1; SOCS=CAI',
}

async function fetchSearchPage(query, timeout = 6500) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${YT_SEARCH_SP}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { headers: YT_HEADERS, signal: controller.signal, redirect: 'follow' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Pulls the `ytInitialData` JSON blob out of the results page. */
function parseInitialData(html) {
  const marker = 'var ytInitialData = '
  const at = html.indexOf(marker)
  if (at < 0) return null
  const start = at + marker.length
  const end = html.indexOf(';</script>', start)
  if (end < 0) return null
  try {
    return JSON.parse(html.slice(start, end))
  } catch {
    return null
  }
}

function toSeconds(text) {
  if (!text) return 0
  const parts = String(text).split(':')
  if (parts.length < 2 || parts.length > 3) return 0
  const numbers = parts.map((part) => Number.parseInt(part, 10))
  if (numbers.some((value) => Number.isNaN(value))) return 0
  return numbers.reduce((acc, value) => acc * 60 + value, 0)
}

function collectVideos(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, out)
    return out
  }
  if (node.videoRenderer) {
    const video = node.videoRenderer
    const thumbnails = video.thumbnail?.thumbnails ?? []
    out.push({
      id: video.videoId,
      title: video.title?.runs?.map((run) => run.text).join('') ?? '',
      duration: toSeconds(video.lengthText?.simpleText),
      channel: video.ownerText?.runs?.[0]?.text ?? '',
      thumbnails,
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
    })
    return out
  }
  for (const key of Object.keys(node)) collectVideos(node[key], out)
  return out
}

/**
 * Search through the plain HTTP page; returns [] when the page won't load.
 *
 * Three attempts run at once and the first usable one wins — waiting for all
 * of them would mean a stalled connection sets the pace even when another
 * attempt already succeeded.
 */
async function httpSearch(query) {
  const attempts = [fetchSearchPage(query), fetchSearchPage(query), fetchSearchPage(query), fetchSearchPage(query)]

  return new Promise((resolve) => {
    let pending = attempts.length
    let settled = false

    const giveUp = () => {
      pending -= 1
      if (pending === 0 && !settled) {
        settled = true
        resolve([])
      }
    }

    for (const attempt of attempts) {
      attempt
        .then((html) => {
          if (settled) return
          if (html.length < 10_000) {
            giveUp()
            return
          }
          const data = parseInitialData(html)
          const videos = data ? collectVideos(data) : []
          if (videos.length === 0) {
            giveUp()
            return
          }
          settled = true
          resolve(videos)
        })
        .catch(giveUp)
    }
  })
}

ipcMain.handle('yt:search', async (_event, query, limit = 30) => {
  if (typeof query !== 'string' || !query.trim()) return []
  const count = Math.max(1, Math.min(50, Number(limit) || 30))

  let entries = []
  try {
    entries = await httpSearch(query)
  } catch {
    entries = []
  }

  // Fall back to yt-dlp only when the page route produced nothing usable.
  if (shapeSongs(entries, query).length < 3) {
    const minSongs = Math.min(8, count)
    const parse = (stdout) => {
      try {
        return JSON.parse(stdout)
      } catch {
        return null
      }
    }
    const usable = (stdout) => {
      const data = parse(stdout)
      if (!data || !Array.isArray(data.entries)) return false
      return shapeSongs(data.entries, query).length >= minSongs
    }
    try {
      const out = await raceYtDlp([ytArgs(['--flat-playlist', '-J', `ytsearch${count}:${query}`])], {
        timeout: 30_000,
        accept: usable,
      })
      const data = parse(out)
      if (data && Array.isArray(data.entries) && data.entries.length > 0) entries = data.entries
    } catch {
      /* keep whatever the page route gave us */
    }
  }

  const songs = shapeSongs(entries, query)
  return songs.slice(0, count).map(toResult)
})

ipcMain.handle('yt:stream', async (_event, videoId) => {
  if (typeof videoId !== 'string' || !/^[\w-]{5,20}$/.test(videoId)) throw new Error('Некорректный идентификатор')
  const watch = `https://www.youtube.com/watch?v=${videoId}`
  const format = ['-f', 'bestaudio[ext=m4a]/bestaudio/best', '--get-url']

  // One process walks the client chain internally, which is far faster than
  // racing two processes: they contend for the same slow link. A backup with
  // the chain reversed only starts if the first is still stuck after 6s.
  const out = await raceYtDlp(
    [
      ytArgs([...format, watch], 'android,tv_embedded'),
      ytArgs([...format, watch], 'tv_embedded,android'),
    ],
    { timeout: 40_000, stagger: 6000 },
  )
  const url = out
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('http'))
  if (!url) throw new Error('Не удалось получить поток')
  return url
})

ipcMain.handle('yt:available', () => fs.existsSync(YTDLP))

/**
 * Reads a public YouTube or YouTube Music playlist.
 *
 * This is the one import source that needs no account anywhere: the playlist
 * already lives in the catalogue Ownly plays from, so the entries come back
 * with titles, channels and durations in a single flat listing.
 */
ipcMain.handle('yt:playlist', async (_event, rawUrl) => {
  let url
  try {
    url = new URL(String(rawUrl))
  } catch {
    return { ok: false, error: 'bad-url' }
  }
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') {
    return { ok: false, error: 'bad-url' }
  }
  const listId = url.searchParams.get('list')
  if (!listId || !/^[\w-]{10,60}$/.test(listId)) return { ok: false, error: 'no-playlist' }

  const target = `https://www.youtube.com/playlist?list=${listId}`
  try {
    const out = await raceYtDlp([ytArgs(['--flat-playlist', '-J', target], YT_CLIENT_CHAIN, '4')], {
      timeout: 45_000,
    })
    const data = JSON.parse(out)
    const entries = (Array.isArray(data?.entries) ? data.entries : [])
      .filter((entry) => entry && entry.title)
      .map((entry) => ({
        id: String(entry.id ?? ''),
        title: String(entry.title),
        channel: String(entry.channel ?? entry.uploader ?? ''),
        duration: Math.round(Number(entry.duration ?? 0)),
      }))
      .filter((entry) => entry.id)

    return { ok: true, name: String(data?.title ?? 'Плейлист YouTube'), entries }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
})


/* ------------------------------------------------------------------ */
/* screenshot harness (OWNLY_SHOOT_DIR=/path node scripts/shoot.mjs)   */
/* ------------------------------------------------------------------ */

async function runShoot(instance) {
  const dir = SHOOT_DIR
  fs.mkdirSync(dir, { recursive: true })
  const targets = [
    { name: '01-home', hash: '#/', wait: 2600 },
    { name: '02-search', hash: '#/search?q=' + encodeURIComponent('LONOWN addiction'), wait: 1800, needsRows: true, query: 'LONOWN addiction' },
    { name: '04-library', hash: '#/library', wait: 2000 },
    { name: '07-artist', hash: '#/artist/LONOWN', wait: 1800, needsRows: true },
    { name: '08-settings', hash: '#/settings', wait: 1600 },
    { name: '17-search-mainstream', hash: '#/search?q=daft%20punk', wait: 1800, needsRows: true, query: 'daft punk' },
    { name: '18-search-ru', hash: '#/search?q=' + encodeURIComponent('кино группа крови'), wait: 1800, needsRows: true, query: 'кино группа крови' },
  ]
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  /** Waits for real results instead of a fixed delay, so shots aren't skeletons. */
  const waitForRows = async (query = null, timeout = 120_000) => {
    const step = 500
    const needle = query ? JSON.stringify(query.toLowerCase()) : 'null'
    for (let waited = 0; waited < timeout; waited += step) {
      await sleep(step)
      const ready = await instance.webContents.executeJavaScript(`
        (() => {
          const scope = document.querySelector('[data-search-results]')
          const matches = ${needle} === null
            || (scope && (scope.getAttribute('data-search-results') || '').toLowerCase() === ${needle})
          const rows = [...document.querySelectorAll('[data-track-row]')]
          // Rows animate in; require them to be visible and settled, not just
          // present in the DOM.
          const visible = rows.filter((row) => {
            const rect = row.getBoundingClientRect()
            return rect.height > 10 && Number(getComputedStyle(row).opacity) > 0.9
          }).length
          return {
            matches,
            rows: visible,
            busy: document.querySelectorAll('.skeleton').length > 0,
          }
        })()
      `)
      if (ready.matches && ready.rows > 0 && !ready.busy) {
        // Let the last row finish its entrance animation.
        await sleep(700)
        return true
      }
    }
    return false
  }

  const capture = async (name) => {
    // Offscreen captures skip repaints triggered by late image loads;
    // a 1px scroll nudge forces the compositor to paint the final frame.
    await instance.webContents.executeJavaScript(`
      (() => { const p = document.getElementById('main-scroll'); if (p) { p.scrollTop += 1; p.scrollTop -= 1 } })()
    `)
    await sleep(260)
    const image = await instance.webContents.capturePage()
    fs.writeFileSync(path.join(dir, `${name}.png`), image.toPNG())
  }

  await sleep(2600)

  for (const t of targets) {
    await instance.webContents.executeJavaScript(`location.hash = ${JSON.stringify(t.hash)}`)
    await sleep(t.wait)
    if (t.needsRows) await waitForRows(t.query ?? null)
    await capture(t.name)
  }


  // now-playing overlay with a real playing track
  await instance.webContents.executeJavaScript(`location.hash = '#/search?q=' + encodeURIComponent('LONOWN addiction')`)
  await sleep(2500)
  await instance.webContents.executeJavaScript(`
    (() => {
      const row = document.querySelector('[data-track-row] button[data-play]')
      if (row) row.click()
    })()
  `)
  await sleep(6000)
  await capture('09-playing')

  // playlist shelf + the import dialog
  await instance.webContents.executeJavaScript(`location.hash = '#/library'`)
  await sleep(900)
  await instance.webContents.executeJavaScript(`
    (() => { const tile = document.querySelector('.shelf-card--new'); if (tile) tile.click() })()
  `)
  await sleep(700)
  await instance.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('.modal input')
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'Ночная езда')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()
  `)
  await sleep(400)
  await instance.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.modal .btn--primary')].pop()
      if (button) button.click()
    })()
  `)
  await sleep(1800)
  await capture('05-playlist')

  // Open the import dialog; retry until it is actually on screen.
  for (let attempt = 0; attempt < 6; attempt++) {
    const opened = await instance.webContents.executeJavaScript(`
      (() => {
        if (document.querySelector('.modal .import-input')) return true
        const button = [...document.querySelectorAll('button')].find(
          (el) => el.classList.contains('btn') && el.textContent.trim().startsWith('Импортировать'),
        )
        if (button) button.click()
        return false
      })()
    `)
    if (opened) break
    await sleep(700)
  }
  await sleep(600)
  await capture('06-import')



  // Spotify by link only: whatever the network allows, the importer must
  // explain the outcome instead of crashing.
  await instance.webContents.executeJavaScript(`
    (() => {
      const box = document.querySelector('.modal .import-input')
      if (!box) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(box, 'https://open.spotify.com/playlist/4wZCfH9wjnDcvbcuP7qjsD')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })()
  `)
  await sleep(300)
  await instance.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.modal .btn--primary')].pop()
      if (button) button.click()
    })()
  `)
  // Reading the playlist now takes a couple of requests (embed → pathfinder),
  // so wait past the fetch phase to capture the real track count.
  await sleep(6000)
  await capture('06b-import-spotify')


  await instance.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.modal .btn--ghost')].pop()
      if (button) button.click()
    })()
  `)
  await sleep(500)
  await instance.webContents.executeJavaScript(`location.hash = '#/library'`)
  await sleep(1400)
  await capture('13-library-filled')

  await instance.webContents.executeJavaScript(`location.hash = '#/liked'`)
  await sleep(1800)
  await capture('14-liked')
  // right panel: queue
  await instance.webContents.executeJavaScript(`
    (() => { const b = document.querySelector('[data-action="queue"]'); if (b) b.click() })()
  `)
  await sleep(1400)
  await capture('11-queue')

  // right panel: lyrics
  await instance.webContents.executeJavaScript(`
    (() => {
      const tabs = [...document.querySelectorAll('.right-panel__tab')]
      const lyrics = tabs.find((t) => t.textContent.trim() === 'Текст')
      if (lyrics) lyrics.click()
    })()
  `)
  await sleep(5200)
  await capture('12-lyrics')

  await instance.webContents.executeJavaScript(`
    (() => { const b = document.querySelector('.right-panel__head .icon-btn'); if (b) b.click() })()
  `)

  await instance.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('[data-action="fullscreen"]')
      if (btn) btn.click()
    })()
  `)
  await sleep(5200)
  await capture('10-fullscreen')

  // narrow window check
  await instance.webContents.executeJavaScript(`
    (() => { const b = document.querySelector('.immersive__close'); if (b) b.click() })()
  `)
  await sleep(800)
  instance.setSize(1120, 740)
  await instance.webContents.executeJavaScript(`location.hash = '#/'`)
  await sleep(4200)
  await capture('16-narrow')

  app.quit()
}

async function runE2E(instance) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const js = (code) => instance.webContents.executeJavaScript(code)
  const results = []
  const check = (name, ok, detail) => {
    results.push({ name, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  }

  await sleep(2400)

  const waitRows = async (query, min = 5) => {
    const started = Date.now()
    for (let i = 0; i < 160; i++) {
      await sleep(250)
      const state = await js(`
        (() => {
          const scope = document.querySelector('[data-search-results]')
          const match = Boolean(scope && scope.getAttribute('data-search-results') === ${JSON.stringify(query)})
          const busy = document.querySelectorAll('.skeleton').length > 0
          const rows = document.querySelectorAll('[data-track-row]').length
          return { match, busy, rows }
        })()
      `)
      if (state.match && !state.busy && state.rows >= min) return { ok: true, ms: Date.now() - started, rows: state.rows }
    }
    return { ok: false, ms: Date.now() - started, rows: 0 }
  }

  const playFirst = async () => {
    const started = Date.now()
    await js(`document.querySelectorAll('[data-track-row]')[0].querySelector('button[data-play]').click()`)
    for (let i = 0; i < 200; i++) {
      await sleep(200)
      const playing = await js(
        `(() => { const a = window.__ownlyAudio; return Boolean(a && !a.paused && a.currentTime > 0.5) })()`,
      )
      if (playing) return { ok: true, ms: Date.now() - started }
    }
    return { ok: false, ms: Date.now() - started }
  }

  // The exact case the user reported: LONOWN + Asenssia, "addiction (Slowed)".
  const query = 'LONOWN addiction'
  await js(`location.hash = '#/search?q=' + encodeURIComponent(${JSON.stringify(query)})`)
  const search = await waitRows(query)
  check('search finds LONOWN addiction', search.ok, `${search.rows} rows in ${search.ms}ms`)
  check('search is fast', search.ms < 6000, `${search.ms}ms`)

  const info = await js(`
    (() => {
      const rows = [...document.querySelectorAll('[data-track-row]')]
      return rows.slice(0, 8).map((r) => ({
        title: r.querySelector('.track-row__title')?.textContent || '',
        artists: [...r.querySelectorAll('.track-row__artist')].map((a) => a.textContent),
        duration: r.querySelector('.track-row__duration')?.textContent || '',
      }))
    })()
  `)
  console.log('   RESULTS:')
  for (const row of info) {
    console.log(`     ${row.duration.padStart(6)} | ${row.artists.join(' + ')} — ${row.title}`)
  }

  // Songs, not videos: nothing absurdly long, nothing that is clearly a video.
  const seconds = (text) => {
    const parts = text.split(':').map((n) => Number.parseInt(n, 10))
    if (parts.some(Number.isNaN)) return 0
    return parts.reduce((acc, n) => acc * 60 + n, 0)
  }
  const tooLong = info.filter((row) => seconds(row.duration) > 15 * 60)
  check('results are songs, not long videos', tooLong.length === 0, `${tooLong.length} over 15 min`)

  const multiArtist = info.find((row) => row.artists.length > 1)
  check(
    'multiple artists are split',
    Boolean(multiArtist) || info.some((row) => /,\s|&|\sx\s/i.test(row.artists.join(''))),
    multiArtist ? multiArtist.artists.join(' | ') : 'single artist rows only',
  )

  // Find the slowed version the user was listening to and play it.
  const slowedIndex = info.findIndex((row) => /slowed/i.test(row.title))
  const playIndex = slowedIndex >= 0 ? slowedIndex : 0

  // Realistic path: the pointer passes over the row before it is clicked, so
  // the stream starts warming. Give it a moment, as a person would.
  await js(`
    (() => {
      const row = document.querySelectorAll('[data-track-row]')[${playIndex}]
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    })()
  `)
  await sleep(2500)

  const started = Date.now()
  await js(`document.querySelectorAll('[data-track-row]')[${playIndex}].querySelector('button[data-play]').click()`)
  let playing = false
  for (let i = 0; i < 250; i++) {
    await sleep(200)
    playing = await js(
      `(() => { const a = window.__ownlyAudio; return Boolean(a && !a.paused && a.currentTime > 0.5) })()`,
    )
    if (playing) break
  }
  const playMs = Date.now() - started
  check(`play "${info[playIndex]?.title}"`, playing, `${playMs}ms to first audio`)
  check('playback is fast', playMs < 8000, `${playMs}ms`)

  const state = await js(`
    (() => {
      const a = window.__ownlyAudio
      const p = window.__ownlyPlayer ? window.__ownlyPlayer.getState() : null
      const item = p ? p.queue[p.order[p.cursor]] : null
      return {
        duration: a ? Math.round(a.duration || 0) : 0,
        artists: item?.artists ?? [],
        artist: item?.artist ?? '',
        error: p?.error ?? '',
      }
    })()
  `)
  check('full track loaded', state.duration > 60, `${state.duration}s`)
  check(
    'both artists credited',
    state.artists.length >= 2,
    `${state.artist} · ${JSON.stringify(state.artists)}`,
  )

  // The catalogue lookup adds collaborators that a YouTube title omits, so at
  // least one row should end up with two credited names.
  let credited = 0
  for (let i = 0; i < 40; i++) {
    credited = await js(`
      (() => {
        const rows = [...document.querySelectorAll('[data-track-row]')]
        return rows.filter((row) => row.querySelectorAll('.track-row__artist').length > 1).length
      })()
    `)
    if (credited >= 3) break
    await sleep(500)
  }
  check('collaborators resolved from catalogue', credited >= 3, `${credited} rows with 2+ artists`)

  // Artist page speed.
  const artistStarted = Date.now()
  await js(`location.hash = '#/artist/' + encodeURIComponent('LONOWN')`)
  let artistRows = 0
  for (let i = 0; i < 200; i++) {
    await sleep(250)
    artistRows = await js(`document.querySelectorAll('[data-track-row]').length`)
    if (artistRows > 3) break
  }
  const artistMs = Date.now() - artistStarted
  check('artist page loads', artistRows > 3, `${artistRows} tracks in ${artistMs}ms`)
  check('artist page is fast', artistMs < 6000, `${artistMs}ms`)

  const passed = results.filter((r) => r.ok).length
  console.log(`\nE2E: ${passed}/${results.length} passed`)
  app.quit()
}
async function runPlaybackAudit(instance) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const js = (code) => instance.webContents.executeJavaScript(code)
  const releases = [
    'DaftPunk-DigitalLovealphabeatCover',
    'Nirvana_1992-01-02',
    'DWK123',
    'TheBeatlesEverydayChemistry',
  ]

  await sleep(2600)

  for (const id of releases) {
    await js(`location.hash = '#/album/${id}'`)
    await sleep(4500)
    const rows = await js(`document.querySelectorAll('[data-track-row]').length`)
    if (rows === 0) {
      console.log(`PLAY ${id.padEnd(34)} no tracks`)
      continue
    }
    // Play the first three tracks in sequence and watch what actually happens.
    for (let index = 0; index < Math.min(3, rows); index++) {
      await js(`location.hash = '#/album/${id}'`)
      await sleep(600)
      await js(`document.querySelectorAll('[data-track-row]')[${index}].querySelector('button[data-play]').click()`)
      await sleep(7000)
      const state = await js(`
        (() => {
          const audio = document.querySelector('audio')
          const title = document.querySelector('.playerbar__title')?.textContent || ''
          const err = document.querySelector('.player-error')?.textContent || ''
          const t = window.__ownlyAudio ? window.__ownlyAudio.currentTime : (audio ? audio.currentTime : -1)
          return { title, err, time: Math.round((t || 0) * 10) / 10 }
        })()
      `)
      const ok = !state.err && state.time > 0.5
      console.log(`PLAY ${id.padEnd(34)} #${index + 1} ${ok ? 'OK  ' : 'FAIL'} t=${state.time}s «${state.title.slice(0, 34)}» ${state.err}`)
    }
  }

  app.quit()
}

async function runSearchAudit(instance) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const js = (code) => instance.webContents.executeJavaScript(code)
  const queries = ['daft punk', 'billie eilish', 'nirvana nevermind', 'кино группа крови', 'the beatles', 'moonlight sonata']

  instance.webContents.on('console-message', (_e, _level, message) => {
    if (/error|failed|Error/i.test(message)) console.log('  [renderer]', message.slice(0, 200))
  })

  await sleep(2600)

  for (const query of queries) {
    await js(`location.hash = '#/search?q=' + encodeURIComponent(${JSON.stringify(query)})`)
    // Wait until every skeleton is gone, so we measure settled content.
    let settled = false
    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(500)
      settled = await js(`document.querySelectorAll('.skeleton').length === 0`)
      if (settled) break
    }
    const stats = await js(`
      (() => ({
        tracks: document.querySelectorAll('[data-track-row]').length,
        cards: document.querySelectorAll('.card').length,
        empty: Boolean(document.querySelector('.search-hero__title')?.textContent?.includes('Ничего')),
        first: document.querySelector('[data-track-row] .track-row__title')?.textContent || document.querySelector('.card__title')?.textContent || '',
      }))()
    `)
    console.log(`AUDIT ${query.padEnd(20)} tracks=${String(stats.tracks).padStart(2)} cards=${String(stats.cards).padStart(2)} ${stats.empty ? 'EMPTY' : settled ? 'ok' : 'TIMEOUT'}  «${stats.first}»`)
  }

  app.quit()
}

async function runSmoke(instance) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const js = (code) => instance.webContents.executeJavaScript(code)
  const results = []
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  }

  // 1. search returns a real tracklist
  await js(`location.hash = '#/search?q=' + encodeURIComponent('LONOWN addiction')`)
  let rows = 0
  for (let i = 0; i < 160; i++) {
    await sleep(250)
    rows = await js(`document.querySelectorAll('[data-track-row]').length`)
    if (rows > 5) break
  }
  check('search returns a tracklist', rows > 5, `${rows} rows`)

  // 2. playback starts
  await js(`document.querySelector('[data-track-row] button[data-play]').click()`)
  let playing = ''
  let isPlaying = false
  for (let i = 0; i < 160; i++) {
    await sleep(250)
    playing = await js(`document.querySelector('.playerbar__title')?.textContent || ''`)
    isPlaying = await js(
      `(() => { const a = window.__ownlyAudio; return Boolean(a && !a.paused && a.currentTime > 0.3) })()`,
    )
    if (isPlaying) break
  }
  check('playback starts', isPlaying && Boolean(playing), playing || 'no title')

  // 3. like persists
  const likeAction = await js(`
    (() => {
      const row = document.querySelector('[data-track-row].is-active')
      const like = row && row.querySelector('.track-row__like')
      if (!like) return 'no-button'
      if (!like.classList.contains('is-liked')) like.click()
      return 'clicked'
    })()
  `)
  await sleep(700)
  const likedCount = await js(`JSON.parse(localStorage.getItem('ownly.library') || '{}')?.state?.likedOrder?.length ?? 0`)
  check('like persists to storage', likedCount === 1, `liked=${likedCount} · ${likeAction}`)

  // 4. queue panel
  await js(`document.querySelector('[data-action="queue"]').click()`)
  await sleep(600)
  const queueItems = await js(`document.querySelectorAll('.queue-item').length`)
  check('queue panel lists tracks', queueItems > 5, `${queueItems} items`)
  await js(`document.querySelector('.right-panel__head .icon-btn').click()`)

  // 5. playlist creation
  await js(`
    (() => {
      const btn = [...document.querySelectorAll('.sidebar__section-label .icon-btn')][0]
      if (btn) btn.click()
    })()
  `)
  await sleep(500)
  await js(`
    (() => {
      const input = document.querySelector('.modal .input')
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'Ночная езда')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()
  `)
  await sleep(400)
  await js(`
    (() => {
      const btn = [...document.querySelectorAll('.modal__actions .btn')].find((b) => b.textContent.trim() === 'Создать')
      if (btn) btn.click()
    })()
  `)
  await sleep(900)
  const route = await js(`location.hash`)
  const playlistName = await js(`[...document.querySelectorAll('.playlist-item__name')].map((n) => n.textContent).join(',')`)
  check('playlist created and opened', route.startsWith('#/playlist/'), `${route} · ${playlistName}`)

  // 6. liked page
  await js(`location.hash = '#/liked'`)
  await sleep(900)
  const likedRows = await js(`document.querySelectorAll('[data-track-row]').length`)
  check('liked page lists liked track', likedRows === 1, `${likedRows} rows`)

  // 7. artist page
  await js(`location.hash = '#/artist/LONOWN'`)
  let artistRows = 0
  for (let i = 0; i < 160; i++) {
    await sleep(250)
    artistRows = await js(`document.querySelectorAll('[data-track-row]').length`)
    if (artistRows > 3) break
  }
  check('artist page lists tracks', artistRows > 3, `${artistRows} rows`)

  const failed = results.filter((r) => !r.ok)
  console.log(`\nSMOKE: ${results.length - failed.length}/${results.length} passed`)
  app.quit()
}
/* ------------------------------------------------------------------ */

app.whenReady().then(() => {
  app.setAppUserModelId('app.ownly.desktop')

  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

  // The smoke and screenshot runs assert or display an exact library, so they
  // start from an empty one. Wiping the persisted store before the window
  // exists is the only reliable reset — clearing a key later leaves the
  // hydrated store untouched.
  if (process.env.OWNLY_SMOKE || SHOOT_DIR) {
    try {
      fs.rmSync(path.join(app.getPath('userData'), 'Local Storage'), { recursive: true, force: true })
    } catch {
      /* nothing to clear */
    }
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
