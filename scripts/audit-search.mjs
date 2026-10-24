/** Search audit: runs real queries through the app and reports coverage. */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electronBinary = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')

if (!existsSync(electronBinary)) {
  console.error('Electron binary not found. Run `npm install` first.')
  process.exit(1)
}

const env = { ...process.env, OWNLY_AUDIT: '1' }
delete env.ELECTRON_RUN_AS_NODE
delete env.OWNLY_SHOOT_DIR
delete env.OWNLY_SMOKE

const child = spawn(electronBinary, [root], { env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
