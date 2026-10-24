/**
 * Test-only harnesses: screenshots, smoke checks and catalogue audits.
 *
 * They drive a real window against the live network, so they are not part of
 * the app. Nothing here is loaded unless the matching run is requested.
 */
const { app, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const SHOOT_DIR = process.env.OWNLY_SHOOT_DIR || null

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

module.exports = { runShoot, runE2E, runPlaybackAudit, runSearchAudit, runSmoke }
