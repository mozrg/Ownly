import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const resourceDir = join(root, 'resources')
const requestedPlatform = process.argv.find((arg) => arg.startsWith('--platform='))?.split('=')[1] ?? process.platform
const requestedArch = process.argv.find((arg) => arg.startsWith('--arch='))?.split('=')[1] ?? process.arch
const version = process.env.YTDLP_VERSION ?? 'latest'

const targets = {
  win32: { x64: 'yt-dlp.exe', arm64: 'yt-dlp.exe' },
  darwin: { x64: 'yt-dlp_macos', arm64: 'yt-dlp_macos' },
  linux: { x64: 'yt-dlp_linux', arm64: 'yt-dlp_linux' },
}
const filename = targets[requestedPlatform]?.[requestedArch]
if (!filename) throw new Error(`Unsupported yt-dlp target: ${requestedPlatform}/${requestedArch}`)

const release = version === 'latest' ? 'latest' : `tags/${encodeURIComponent(version)}`
const api = `https://api.github.com/repos/yt-dlp/yt-dlp/releases/${release}`
const headers = { 'User-Agent': 'Ownly yt-dlp fetcher', Accept: 'application/vnd.github+json' }

async function json(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`)
  return response.json()
}

async function download(url, destination) {
  const response = await fetch(url, { headers })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} downloading ${url}`)
  await pipeline(response.body, createWriteStream(destination))
}

const metadata = await json(api)
const tag = metadata.tag_name
if (!tag) throw new Error('yt-dlp release did not include a tag')
const assetNames = new Set((metadata.assets ?? []).map((asset) => asset.name))
const checksumName = 'SHA2-256SUMS'
if (!assetNames.has(filename) || !assetNames.has(checksumName)) {
  throw new Error(`yt-dlp ${tag} has no ${filename} and ${checksumName} assets`)
}

const assetUrl = (name) => `https://github.com/yt-dlp/yt-dlp/releases/download/${encodeURIComponent(tag)}/${name}`
await mkdir(resourceDir, { recursive: true })
const checksumPath = join(resourceDir, `${checksumName}.tmp`)
const binaryPath = join(resourceDir, `${filename}.tmp`)
try {
  await download(assetUrl(checksumName), checksumPath)
  const sums = await readFile(checksumPath, 'utf8')
  const line = sums.split(/\r?\n/).find((entry) => entry.trim().endsWith(`  ${filename}`) || entry.trim().endsWith(` *${filename}`))
  const expected = line?.trim().split(/\s+/)[0]?.toLowerCase()
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`No SHA-256 entry for ${filename}`)

  await download(assetUrl(filename), binaryPath)
  const actual = createHash('sha256').update(await readFile(binaryPath)).digest('hex')
  if (actual !== expected) throw new Error(`SHA-256 mismatch for ${filename}: expected ${expected}, got ${actual}`)
  await rename(binaryPath, join(resourceDir, filename))
  const manifest = { project: 'Ownly', source: 'https://github.com/yt-dlp/yt-dlp', version: tag, platform: requestedPlatform, arch: requestedArch, filename, sha256: actual }
  await writeFile(join(resourceDir, 'yt-dlp-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Downloaded and verified yt-dlp ${tag} (${requestedPlatform}/${requestedArch}) ${actual}`)
} finally {
  await rm(checksumPath, { force: true })
  await rm(binaryPath, { force: true })
}
