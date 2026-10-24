/**
 * Reading a public Spotify playlist from its link alone.
 *
 * No account, no Client ID, no Secret, no app registration. This is the same
 * route the community clients take (AliAkhtari78/SpotifyScraper,
 * tr1ckydev/spotifly, kaangiray26/noauth): Spotify's own web player reads
 * public data anonymously, so those endpoints are open to anyone.
 *
 * Three routes, tried in order:
 *
 *   1. the embed page carries an anonymous bearer token, and that token opens
 *      the `fetchPlaylist` GraphQL query the web player uses — full track list
 *      of any length, with authoritative per-artist credits;
 *   2. the embed page also server-renders the first 100 tracks into
 *      `__NEXT_DATA__`, which needs no token at all;
 *   3. an anonymous web-player token from `/get_access_token` plus the public
 *      Web API.
 *
 * The embed page is the only part Spotify refuses in some regions: it answers
 * `pageProps.status = 451`, "This content is not available in your country".
 * `api-partner.spotify.com` is not refused, so the page is fetched through a
 * public relay when needed — only the playlist link travels through it — and
 * the token it returns is then used directly. Tokens are cached until they
 * expire, so later imports need no relay at all.
 */
const fs = require('node:fs')
const path = require('node:path')

const EMBED_URL = (id) => `https://open.spotify.com/embed/playlist/${encodeURIComponent(id)}`
const TOKEN_URL = 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player'
const WEB_API = 'https://api.spotify.com/v1'
const PATHFINDER_URL = 'https://api-partner.spotify.com/pathfinder/v1/query'

/** The `fetchPlaylist` persisted query, as the web player calls it. */
const PLAYLIST_QUERY = {
  operationName: 'fetchPlaylist',
  sha256Hash: 'a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4',
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const REQUEST_HEADERS = {
  'User-Agent': BROWSER_UA,
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://open.spotify.com/',
}

/**
 * Public relays that fetch from a region Spotify does serve. Only the public
 * playlist link is sent through them, and only until a token has been minted —
 * after that the token is reused straight from disk.
 */
const RELAYS = [
  (url) => `https://cors.eu.org/${url}`,
  (url) => `https://test.cors.workers.dev/?${url}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

const PAGE_LIMIT = 100
const MAX_TRACKS = 2000

/**
 * How long the whole relay sweep may take. Public relays answer a healthy
 * request in a few seconds and throw 5xx after ~20 s when overloaded, so this
 * buys a handful of attempts without stalling the import dialog indefinitely.
 */
const RELAY_BUDGET = 40_000

/* ------------------------------------------------------------------ */
/* Token cache                                                         */
/* ------------------------------------------------------------------ */

const TOKEN_FILE = 'spotify-anon-token.json'
let tokenLoaded = false

function cachePath(name) {
  try {
    const { app } = require('electron')
    return path.join(app.getPath('userData'), name)
  } catch {
    return null
  }
}

/**
 * Anonymous tokens live for months, and they are what makes the playlist query
 * work without touching a relay. Remembering one turns every later import into
 * a single direct request.
 */
function loadToken() {
  if (tokenLoaded) return
  tokenLoaded = true
  const file = cachePath(TOKEN_FILE)
  if (!file) return
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    const expiresAt = Number(raw?.expiresAt ?? 0)
    if (raw?.value && expiresAt > Date.now() + 60_000) {
      cachedToken = { value: String(raw.value), expiresAt }
    }
  } catch {
    /* no cached token yet */
  }
}

function saveToken(token) {
  const file = cachePath(TOKEN_FILE)
  if (!file) return
  try {
    fs.writeFileSync(file, JSON.stringify(token))
  } catch {
    /* a missing cache only costs one extra request later */
  }
}

/** Drops a token Spotify has stopped accepting, on disk as well as in memory. */
function clearToken() {
  cachedToken = null
  const file = cachePath(TOKEN_FILE)
  if (!file) return
  try {
    fs.rmSync(file, { force: true })
  } catch {
    /* an unremovable cache just gets replaced by the next mint */
  }
}

async function withTimeout(url, options, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** "Artist A, Artist B & Artist C" → ['Artist A', 'Artist B', 'Artist C'] */
function splitArtists(text) {
  if (!text) return []
  return String(text)
    .split(/\s*(?:,|&|feat\.|ft\.|·|\bx\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Widest image out of a Spotify `sources` list. */
function widestUrl(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return null
  const widest = [...sources].sort(
    (a, b) => Number(b?.width ?? b?.maxWidth ?? 0) - Number(a?.width ?? a?.maxWidth ?? 0),
  )[0]
  return widest?.url ? String(widest.url) : null
}

function pickCover(entity) {
  return (
    widestUrl(entity?.coverArt?.sources) ??
    widestUrl(entity?.visualIdentity?.image) ??
    widestUrl(entity?.images?.items?.[0]?.sources) ??
    widestUrl(entity?.images) ??
    null
  )
}

/* ------------------------------------------------------------------ */
/* The embed page — token and first page of tracks in one request      */
/* ------------------------------------------------------------------ */

function parseEmbedPage(html) {
  const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
  if (!match) return { ok: false, error: 'no-state' }

  let data
  try {
    data = JSON.parse(match[1])
  } catch {
    return { ok: false, error: 'bad-state' }
  }

  const props = data?.props?.pageProps
  const status = Number(props?.status ?? 0)
  if (status === 451) return { ok: false, error: 'region' }
  if (status === 404) return { ok: false, error: 'not-found' }
  if (status >= 400) return { ok: false, error: `status-${status}` }

  const session = props?.state?.settings?.session
  const token =
    session?.isAnonymous !== false && typeof session?.accessToken === 'string' ? session.accessToken : null
  const expiresAt = Number(session?.accessTokenExpirationTimestampMs ?? 0)

  const entity = props?.state?.data?.entity
  const entries = []
  for (const item of entity?.trackList ?? []) {
    const title = String(item?.title ?? '').trim()
    if (!title) continue
    entries.push({
      title,
      artists: splitArtists(item?.subtitle),
      duration: Math.round(Number(item?.duration ?? 0) / 1000),
      cover: pickCover(item) ?? undefined,
    })
  }

  return {
    ok: true,
    token,
    expiresAt,
    name: entity?.name ?? entity?.title ?? null,
    cover: pickCover(entity),
    entries,
  }
}

async function fetchEmbedPage(url, timeout) {
  try {
    const response = await withTimeout(url, { headers: REQUEST_HEADERS }, timeout)
    if (response.status === 404) return { ok: false, error: 'not-found' }
    if (!response.ok) return { ok: false, error: `http-${response.status}` }
    return parseEmbedPage(await response.text())
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

async function readEmbed(playlistId) {
  const target = EMBED_URL(playlistId)

  // Direct first: fastest, and needs no third party when the region is served.
  const direct = await fetchEmbedPage(target, 12_000)
  if (direct.ok) return direct
  if (direct.error === 'not-found') return direct

  // `region` is the one failure a relay can fix. Relays are shared services
  // that rate-limit whole IPs and flap between healthy and overloaded, so they
  // are asked one at a time (a parallel burst gets them all blocked) and swept
  // again while the time budget lasts. A healthy relay answers in a few
  // seconds, an overloaded one errors out or times out.
  const problems = [direct.error]
  const deadline = Date.now() + RELAY_BUDGET

  while (Date.now() < deadline) {
    for (const build of RELAYS) {
      const budget = Math.min(20_000, deadline - Date.now())
      if (budget < 2_000) break
      const relayed = await fetchEmbedPage(build(target), budget)
      if (relayed.ok) return relayed
      if (relayed.error === 'not-found') return relayed
      problems.push(relayed.error)
    }
    if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 1_200))
  }

  if (problems.includes('not-found')) return { ok: false, error: 'not-found' }
  if (problems.includes('region')) return { ok: false, error: 'region' }
  return { ok: false, error: problems[0] ?? 'unknown' }
}

/* ------------------------------------------------------------------ */
/* Route 1 — the web player's own playlist query                       */
/* ------------------------------------------------------------------ */

let cachedToken = null

function playlistQueryUrl(playlistId, offset) {
  const params = {
    operationName: PLAYLIST_QUERY.operationName,
    variables: JSON.stringify({
      uri: `spotify:playlist:${playlistId}`,
      offset,
      limit: PAGE_LIMIT,
      enableWatchFeedEntrypoint: false,
    }),
    extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: PLAYLIST_QUERY.sha256Hash } }),
  }
  return `${PATHFINDER_URL}?${new URLSearchParams(params).toString()}`
}

function entryFromPathfinder(item) {
  const data = item?.itemV2?.data
  if (!data || data.__typename === 'Episode') return null
  const title = String(data.name ?? '').trim()
  if (!title) return null
  return {
    title,
    artists: (data.artists?.items ?? [])
      .map((artist) => String(artist?.profile?.name ?? '').trim())
      .filter(Boolean),
    duration: Math.round(Number(data.trackDuration?.totalMilliseconds ?? 0) / 1000),
    cover: pickCover(data.albumOfTrack) ?? undefined,
  }
}

async function readPathfinder(token, playlistId) {
  const headers = {
    ...REQUEST_HEADERS,
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'app-platform': 'WebPlayer',
  }

  const entries = []
  let name = null
  let cover = null
  let total = 0

  for (let offset = 0; offset < MAX_TRACKS; offset += PAGE_LIMIT) {
    const response = await withTimeout(playlistQueryUrl(playlistId, offset), { headers }, 15_000)
    if (response.status === 401 || response.status === 403) return { ok: false, error: 'unauthorized' }
    if (!response.ok) return { ok: false, error: `http-${response.status}` }

    const body = await response.json()
    const playlist = body?.data?.playlistV2
    if (!playlist) return { ok: false, error: 'no-playlist' }

    if (offset === 0) {
      name = playlist.name ?? null
      cover = pickCover(playlist)
      total = Number(playlist.content?.totalCount ?? 0)
    }

    const items = Array.isArray(playlist.content?.items) ? playlist.content.items : []
    for (const item of items) {
      const entry = entryFromPathfinder(item)
      if (entry) entries.push(entry)
    }

    if (items.length < PAGE_LIMIT) break
    if (total && offset + PAGE_LIMIT >= total) break
  }

  if (entries.length === 0) return { ok: false, error: 'empty' }
  return { ok: true, name: name ?? 'Плейлист Spotify', cover: cover ?? entries[0]?.cover ?? null, entries }
}

/* ------------------------------------------------------------------ */
/* Route 3 — anonymous web-player token + the public Web API           */
/* ------------------------------------------------------------------ */

async function anonymousToken(force = false) {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const response = await withTimeout(TOKEN_URL, { headers: REQUEST_HEADERS }, 15_000)
  if (response.status === 403) throw new Error('region')
  if (!response.ok) throw new Error(`http-${response.status}`)

  const data = await response.json()
  const value = data?.accessToken ?? data?.access_token
  if (!value) throw new Error('no-token')

  const lifetime = Number(data?.accessTokenExpirationTimestampMs ?? 0)
  cachedToken = { value: String(value), expiresAt: lifetime > Date.now() ? lifetime : Date.now() + 30 * 60_000 }
  saveToken(cachedToken)
  return cachedToken.value
}

async function readWebApi(playlistId) {
  const token = await anonymousToken()
  const headers = { ...REQUEST_HEADERS, Accept: 'application/json', Authorization: `Bearer ${token}` }

  const metaResponse = await withTimeout(
    `${WEB_API}/playlists/${encodeURIComponent(playlistId)}?fields=name,images,tracks(total)`,
    { headers },
    15_000,
  )
  if (metaResponse.status === 401 || metaResponse.status === 403) {
    clearToken()
    return { ok: false, error: 'unauthorized' }
  }
  if (metaResponse.status === 404) return { ok: false, error: 'not-found' }
  if (!metaResponse.ok) return { ok: false, error: `http-${metaResponse.status}` }

  const meta = await metaResponse.json()
  const total = Number(meta?.tracks?.total ?? 0)
  const cap = Math.min(total || PAGE_LIMIT, MAX_TRACKS)
  const entries = []

  for (let offset = 0; offset < cap; offset += PAGE_LIMIT) {
    const pageResponse = await withTimeout(
      `${WEB_API}/playlists/${encodeURIComponent(playlistId)}/tracks` +
        `?offset=${offset}&limit=${PAGE_LIMIT}&fields=items(track(name,duration_ms,type,artists(name)))`,
      { headers },
      15_000,
    )
    if (!pageResponse.ok) break
    const page = await pageResponse.json()
    const items = Array.isArray(page?.items) ? page.items : []
    for (const item of items) {
      const track = item?.track
      if (!track?.name || track.type === 'episode') continue
      entries.push({
        title: String(track.name),
        artists: (track.artists ?? []).map((artist) => String(artist.name ?? '')).filter(Boolean),
        duration: Math.round(Number(track.duration_ms ?? 0) / 1000),
      })
    }
    if (items.length < PAGE_LIMIT) break
  }

  if (entries.length === 0) return { ok: false, error: 'empty' }
  return {
    ok: true,
    name: meta?.name ?? 'Плейлист Spotify',
    cover: Array.isArray(meta?.images) && meta.images[0]?.url ? String(meta.images[0].url) : null,
    entries,
  }
}

/* ------------------------------------------------------------------ */

/**
 * Public relays are shared and rate-limit whole IPs, so a mint can fail simply
 * because every relay is busy at that moment. When that happens, keep trying in
 * the background on a widening delay: the token lives for months, so one
 * success makes every later import a single direct request.
 */
const RETRY_DELAYS = [90_000, 300_000, 900_000]
let retryTimer = null
let retryStep = 0

function scheduleMintRetry(playlistId) {
  if (retryTimer) return
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return
  if (retryStep >= RETRY_DELAYS.length) return

  const delay = RETRY_DELAYS[retryStep]
  retryStep += 1

  retryTimer = setTimeout(async () => {
    retryTimer = null
    try {
      const page = await readEmbed(playlistId)
      if (page.ok && page.token) {
        cachedToken = {
          value: page.token,
          expiresAt: page.expiresAt > Date.now() ? page.expiresAt : Date.now() + 30 * 60_000,
        }
        saveToken(cachedToken)
        retryStep = 0
      } else {
        scheduleMintRetry(playlistId)
      }
    } catch {
      scheduleMintRetry(playlistId)
    }
  }, delay)

  // Never hold the app open just for this.
  if (typeof retryTimer.unref === 'function') retryTimer.unref()
}

/**
 * @param {{playlistId: string}} payload
 * @returns {Promise<{ok: boolean, name?: string, cover?: string|null, entries?: Array, error?: string}>}
 */
async function spotifyPlaylist(payload) {
  const playlistId = String(payload?.playlistId ?? '').trim()
  if (!/^[A-Za-z0-9]{16,64}$/.test(playlistId)) return { ok: false, error: 'bad-playlist' }

  loadToken()

  // A remembered token skips the embed page and every relay entirely.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    try {
      const full = await readPathfinder(cachedToken.value, playlistId)
      if (full.ok) return full
      if (full.error === 'not-found' || full.error === 'empty') return full
      if (full.error === 'unauthorized') clearToken()
    } catch {
      /* fall back to minting a fresh token */
    }
  }

  const page = await readEmbed(playlistId)
  if (!page.ok && page.error === 'not-found') return { ok: false, error: 'not-found' }

  // A token turns the first 100 tracks into the whole playlist.
  if (page.ok && page.token) {
    cachedToken = {
      value: page.token,
      expiresAt: page.expiresAt > Date.now() ? page.expiresAt : Date.now() + 30 * 60_000,
    }
    saveToken(cachedToken)
    try {
      const full = await readPathfinder(page.token, playlistId)
      if (full.ok) return full
    } catch {
      /* fall through to the embedded list */
    }
  }

  if (page.ok && page.entries.length > 0) {
    return { ok: true, name: page.name ?? 'Плейлист Spotify', cover: page.cover, entries: page.entries }
  }

  try {
    const api = await readWebApi(playlistId)
    if (api.ok) return api
    if (api.error === 'not-found' || api.error === 'empty') return api
  } catch {
    /* nothing left to try */
  }

  // The page was readable, so the playlist exists — it just has no tracks.
  if (page.ok) return { ok: false, error: 'empty' }
  if (page.error === 'region') {
    scheduleMintRetry(playlistId)
    return { ok: false, error: 'region' }
  }
  return { ok: false, error: page.error ?? 'unknown' }
}

module.exports = { spotifyPlaylist }
