const { app, BrowserWindow, ipcMain, shell, screen, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { execFile } = require('node:child_process')
const { DiscordPresence } = require('./discord.cjs')
const { spotifyPlaylist } = require('./spotify.cjs')

const isDev = !!process.env.VITE_DEV_SERVER_URL
const SHOOT_DIR = process.env.OWNLY_SHOOT_DIR || null

/** Test harnesses drive one window at a time and must not take the lock. */
const isTestRun = Boolean(
  SHOOT_DIR ||
    process.env.OWNLY_SMOKE ||
    process.env.OWNLY_E2E ||
    process.env.OWNLY_PLAYBACK ||
    process.env.OWNLY_AUDIT,
)

// Two instances would share userData, localStorage and the Discord IPC pipe,
// so the second one hands focus back to the first and exits.
const hasLock = isTestRun || app.requestSingleInstanceLock()

if (!hasLock) {
  app.quit()
} else if (!isTestRun) {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
}

/** @type {BrowserWindow | null} */
let win = null

/**
 * Only the app's own window may call IPC. A single local window makes this
 * mostly theoretical, but a navigated or injected frame would otherwise reach
 * every handler below.
 */
function isTrustedSender(event) {
  const url = event?.senderFrame?.url ?? ''
  if (url.startsWith('file://')) return true
  return Boolean(isDev && process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL))
}

function handle(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error(`Blocked IPC "${channel}"`)
    return listener(event, ...args)
  })
}

function onIpc(channel, listener) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) return
    listener(event, ...args)
  })
}

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

let windowStateTimer = null

/** Writes the current bounds immediately — used when the window closes. */
function writeWindowState() {
  if (!win) return
  try {
    const bounds = win.getNormalBounds()
    fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }))
  } catch {
    /* ignore */
  }
}

/**
 * Dragging or resizing fires dozens of times a second; writing the file on
 * every event is pure disk churn for a value only read at next launch.
 */
function saveWindowState() {
  if (!win) return
  if (windowStateTimer) clearTimeout(windowStateTimer)
  windowStateTimer = setTimeout(() => {
    windowStateTimer = null
    writeWindowState()
  }, 400)
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
      sandbox: true,
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
  win.on('close', () => {
    if (windowStateTimer) clearTimeout(windowStateTimer)
    windowStateTimer = null
    writeWindowState()
  })

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
    if (SHOOT_DIR) devHarness().runShoot(win)
    else if (process.env.OWNLY_E2E) devHarness().runE2E(win)
    else if (process.env.OWNLY_PLAYBACK) devHarness().runPlaybackAudit(win)
    else if (process.env.OWNLY_AUDIT) devHarness().runSearchAudit(win)
    else if (process.env.OWNLY_SMOKE) devHarness().runSmoke(win)
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

onIpc('win:minimize', () => win?.minimize())
onIpc('win:toggle-maximize', () => {
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
onIpc('win:close', () => win?.close())
handle('win:is-maximized', () => ({ maximized: win?.isMaximized() ?? false, fullscreen: win?.isFullScreen() ?? false }))

handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
}))

handle('app:open-external', (_event, url) => {
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

handle('net:json', async (_event, url) => {
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

handle('spotify:playlist', (_event, payload) => spotifyPlaylist(payload))

/* ------------------------------------------------------------------ */
/* Discord Rich Presence                                               */
/* ------------------------------------------------------------------ */

const presence = new DiscordPresence()
presence.onChange((status) => {
  win?.webContents.send('discord:status', status)
})

handle('discord:status', () => ({ state: presence.state, message: presence.message }))

handle('discord:configure', async (_event, options) => {
  const enabled = Boolean(options?.enabled)
  const clientId = String(options?.clientId ?? '').trim()
  if (!enabled) {
    presence.destroy()
    return { state: presence.state, message: presence.message }
  }
  await presence.connect(clientId)
  return { state: presence.state, message: presence.message }
})

handle('discord:activity', (_event, activity) => {
  presence.setActivity(activity ?? null)
  return { state: presence.state, message: presence.message }
})

app.on('before-quit', () => presence.destroy())

/* ------------------------------------------------------------------ */
/* YouTube via yt-dlp — the app's main catalogue                       */
/* ------------------------------------------------------------------ */

const YTDLP_NAME =
  process.platform === 'win32' ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp'

const bundledYtDlp = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, YTDLP_NAME)
    : path.join(__dirname, '..', 'resources', YTDLP_NAME)

/** A writable copy, so the binary can update itself inside a packaged app. */
const userYtDlp = () => path.join(app.getPath('userData'), 'bin', YTDLP_NAME)

let YTDLP = fs.existsSync(userYtDlp()) ? userYtDlp() : bundledYtDlp()

/**
 * YouTube breaks older yt-dlp builds regularly, and a stale binary is the most
 * common reason playback "just stopped working". Keep a writable copy in
 * userData and let it refresh itself, at most once a day, in the background.
 */
const YTDLP_STAMP = 'yt-dlp-updated-at'
let ytdlpUpdating = false

function scheduleYtDlpUpdate() {
  if (ytdlpUpdating || isTestRun) return

  const stampFile = path.join(app.getPath('userData'), YTDLP_STAMP)
  try {
    const last = Number(fs.readFileSync(stampFile, 'utf8').trim()) || 0
    if (Date.now() - last < 24 * 60 * 60_000) return
  } catch {
    /* never updated */
  }

  ytdlpUpdating = true

  try {
    const target = userYtDlp()
    if (!fs.existsSync(target)) {
      const source = bundledYtDlp()
      if (!fs.existsSync(source)) {
        ytdlpUpdating = false
        return
      }
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(source, target)
      if (process.platform !== 'win32') fs.chmodSync(target, 0o755)
    }
    YTDLP = target
    fs.writeFileSync(stampFile, String(Date.now()))
  } catch {
    // A read-only install is fine: the bundled build still works.
    ytdlpUpdating = false
    return
  }

  if (!fs.existsSync(YTDLP)) {
    ytdlpUpdating = false
    return
  }

  // `-U` is a no-op when the build is current, and cheap when it is not.
  execFile(YTDLP, ['-U'], { timeout: 120_000, windowsHide: true }, () => {
    ytdlpUpdating = false
  })
}

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

/**
 * A non-music word only disqualifies a result when the user did not ask for it
 * and the upload does not come from a "- Topic" channel — YouTube's own song
 * catalogue, where such a word is just part of the song's name.
 */
function looksLikeNonMusic(title, query, channel) {
  const match = YT_NOT_MUSIC.exec(title)
  if (!match) return false
  if (query.toLowerCase().includes(match[0].toLowerCase())) return false
  if (/\s-\s*topic$/i.test(channel)) return false
  return true
}

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
    const channel = String(entry.channel ?? entry.uploader ?? '')
    // Duration is the only reliable "this is not one song" signal: an hour
    // loop, a full album and a DJ set are all long. The title is not — "24
    // Hours" and "Chain Reaction" are ordinary songs.
    if (looksLikeNonMusic(title, query, channel)) continue

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
  // The consent cookies skip YouTube's EU interstitial; they carry no identity.
  Cookie: 'CONSENT=YES+1; SOCS=CAI',
}

/**
 * YouTube ranks results by the language it is asked in, so a Russian request
 * for an English song returns a Russian-skewed list. Follow the script the
 * user actually typed instead of hard-coding one locale.
 */
function searchLanguage(query) {
  return /[\u0400-\u04FF]/.test(query) ? 'ru-RU,ru;q=0.9,en;q=0.8' : 'en-US,en;q=0.9,ru;q=0.5'
}

/**
 * One search request, with a handle the caller can abort.
 *
 * YouTube's results page carries everything a search needs (id, title,
 * duration, channel, thumbnail), which takes well under a second when the
 * connection comes up at all. `sp` biases the results towards songs.
 */
function startSearchAttempt(query, timeout = 6500) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${YT_SEARCH_SP}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  const promise = fetch(url, {
    headers: { ...YT_HEADERS, 'Accept-Language': searchLanguage(query) },
    signal: controller.signal,
    redirect: 'follow',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      const data = parseInitialData(html)
      return data ? collectVideos(data) : []
    })
    .finally(() => clearTimeout(timer))

  return {
    promise,
    cancel: () => {
      clearTimeout(timer)
      controller.abort()
    },
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
 * A single request is enough most of the time, so a second one is only started
 * when the first is still silent after a short delay — a hedged request.
 * Whichever finishes first wins and the loser is aborted, because four
 * simultaneous identical requests quadruple the load and invite a captcha.
 */
const HEDGE_DELAY_MS = 800
const HEDGE_ATTEMPTS = 2

async function httpSearch(query) {
  const attempts = []

  return new Promise((resolve) => {
    let settled = false
    let finished = 0

    const finish = (videos) => {
      if (settled) return
      settled = true
      // Drop the loser so it stops competing for the connection.
      for (const attempt of attempts) attempt.cancel()
      resolve(videos)
    }

    const launch = () => {
      const attempt = startSearchAttempt(query)
      attempts.push(attempt)
      attempt.promise
        .then((videos) => {
          finished += 1
          if (videos.length > 0) finish(videos)
          else if (finished >= HEDGE_ATTEMPTS) finish([])
        })
        .catch(() => {
          finished += 1
          if (finished >= HEDGE_ATTEMPTS) finish([])
        })
    }

    launch()
    setTimeout(() => {
      if (!settled) launch()
    }, HEDGE_DELAY_MS)
  })
}

handle('yt:search', async (_event, query, limit = 30) => {
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

handle('yt:stream', async (_event, videoId) => {
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

handle('yt:available', () => fs.existsSync(YTDLP))

/**
 * Reads a public YouTube or YouTube Music playlist.
 *
 * This is the one import source that needs no account anywhere: the playlist
 * already lives in the catalogue Ownly plays from, so the entries come back
 * with titles, channels and durations in a single flat listing.
 */
handle('yt:playlist', async (_event, rawUrl) => {
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
/* Test harnesses — loaded only for the run that asks for them         */
/* ------------------------------------------------------------------ */

function devHarness() {
  return require('./dev/harness.cjs')
}


app.whenReady().then(() => {
  if (!hasLock) return
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
  scheduleYtDlpUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
