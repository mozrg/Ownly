/** Runs Vite and Electron together with hot reload for the renderer. */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electronBinary = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const DEV_URL = 'http://localhost:5273'

if (!existsSync(electronBinary)) {
  console.error('Electron binary not found. Run `npm install` first.')
  process.exit(1)
}

const vite = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

const waitForServer = async () => {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(DEV_URL)
      if (response.ok) return true
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

const env = { ...process.env, VITE_DEV_SERVER_URL: DEV_URL }
delete env.ELECTRON_RUN_AS_NODE

const ready = await waitForServer()
if (!ready) {
  console.error('Vite dev server did not start in time.')
  vite.kill()
  process.exit(1)
}

const electron = spawn(electronBinary, [root], { cwd: root, env, stdio: 'inherit' })

const shutdown = () => {
  electron.kill()
  vite.kill()
}

electron.on('exit', shutdown)
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
