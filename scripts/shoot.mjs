/** Screenshot harness: builds, launches Electron headless-ish and captures pages. */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.shots')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const electronBinary = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!existsSync(electronBinary)) {
  console.error('Electron binary not found. Run `npm install` first.')
  process.exit(1)
}

const env = { ...process.env, OWNLY_SHOOT_DIR: outDir, ELECTRON_ENABLE_LOGGING: '1' }
// The harness itself may run inside an Electron-based shell that sets this.
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronBinary, [root], {
  env,
  stdio: 'inherit',
})

child.on('exit', (code) => {
  console.log(`screenshots written to ${outDir} (exit ${code})`)
})
