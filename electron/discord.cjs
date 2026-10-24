/**
 * Discord Rich Presence over the local IPC pipe.
 *
 * Discord exposes a named pipe per client slot; there is no HTTP API for
 * presence, so this speaks the pipe protocol directly instead of pulling in a
 * dependency: an 8-byte header (opcode + length) followed by JSON.
 *
 * Discord validates the application id server-side, so a real id is required —
 * an unregistered one is rejected with `4000 Invalid Client ID`.
 */
const net = require('node:net')
const crypto = require('node:crypto')

const OP_HANDSHAKE = 0
const OP_FRAME = 1
const OP_CLOSE = 2
const OP_PING = 3
const OP_PONG = 4

const RECONNECT_MS = 15_000

function frame(op, payload) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(8)
  header.writeUInt32LE(op, 0)
  header.writeUInt32LE(json.length, 4)
  return Buffer.concat([header, json])
}

class DiscordPresence {
  constructor() {
    this.socket = null
    this.state = 'off'
    this.message = ''
    this.clientId = ''
    this.activity = null
    this.buffer = Buffer.alloc(0)
    this.reconnectTimer = null
    this.listener = null
  }

  onChange(listener) {
    this.listener = listener
  }

  emit() {
    if (this.listener) this.listener({ state: this.state, message: this.message })
  }

  setState(state, message = '') {
    this.state = state
    this.message = message
    this.emit()
  }

  async connect(clientId) {
    this.clientId = String(clientId ?? '').trim()
    this.clearReconnect()

    if (!this.clientId) {
      this.teardown()
      this.setState('off', 'Не указан Application ID')
      return
    }

    this.teardown()
    this.setState('connecting')

    let socket = null
    for (let slot = 0; slot < 10; slot++) {
      socket = await this.tryPipe(`\\\\.\\pipe\\discord-ipc-${slot}`)
      if (socket) break
    }

    if (!socket) {
      this.setState('no-discord', 'Discord не запущен')
      this.scheduleReconnect()
      return
    }

    this.socket = socket
    this.buffer = Buffer.alloc(0)

    socket.on('data', (chunk) => this.onData(chunk))
    socket.on('close', () => {
      this.socket = null
      if (this.state === 'ready' || this.state === 'connecting') {
        this.setState('no-discord', 'Discord закрылся')
        this.scheduleReconnect()
      }
    })
    socket.on('error', () => {
      /* close handler covers the recovery */
    })

    this.send(OP_HANDSHAKE, { v: 1, client_id: this.clientId })
  }

  tryPipe(path) {
    return new Promise((resolve) => {
      const socket = net.createConnection(path)
      const done = (result) => {
        socket.removeAllListeners()
        resolve(result)
      }
      socket.once('connect', () => done(socket))
      socket.once('error', () => done(null))
      setTimeout(() => done(null), 1500)
    })
  }

  scheduleReconnect() {
    if (this.reconnectTimer || !this.clientId) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.clientId) this.connect(this.clientId)
    }, RECONNECT_MS)
    this.reconnectTimer.unref?.()
  }

  clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 8) {
      const op = this.buffer.readUInt32LE(0)
      const length = this.buffer.readUInt32LE(4)
      if (this.buffer.length < 8 + length) return
      const body = this.buffer.subarray(8, 8 + length).toString('utf8')
      this.buffer = this.buffer.subarray(8 + length)

      let payload = null
      try {
        payload = JSON.parse(body)
      } catch {
        payload = null
      }

      if (op === OP_PING) {
        this.send(OP_PONG, payload ?? {})
        continue
      }
      if (op === OP_CLOSE) {
        // Discord reports a rejected application id by closing the pipe with
        // code 4000, not through the normal error event.
        const code = payload?.code
        const message = payload?.message ?? 'Discord закрыл соединение'
        this.setState(code === 4000 ? 'bad-id' : 'error', message)
        this.scheduleReconnect()
        continue
      }
      if (op !== OP_FRAME || !payload) continue

      if (payload.cmd === 'DISPATCH' && payload.evt === 'READY') {
        this.setState('ready', 'Подключено')
        // Re-apply whatever was showing before the reconnect.
        if (this.activity) this.send(OP_FRAME, this.activityRequest(this.activity))
        continue
      }
      if (payload.evt === 'ERROR' || payload.code) {
        const code = payload.code ?? payload.data?.code
        const message = payload.message ?? payload.data?.message ?? 'Ошибка Discord'
        this.setState(code === 4000 ? 'bad-id' : 'error', String(message))
      }
    }
  }

  send(op, payload) {
    if (!this.socket) return
    try {
      this.socket.write(frame(op, payload))
    } catch {
      /* the close handler will pick this up */
    }
  }

  activityRequest(activity) {
    return {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: crypto.randomUUID(),
    }
  }

  /** Publishes the current track. Passing null clears the presence. */
  setActivity(activity) {
    this.activity = activity
    if (this.state !== 'ready') return
    this.send(OP_FRAME, this.activityRequest(activity))
  }

  teardown() {
    this.clearReconnect()
    if (this.socket) {
      try {
        this.socket.end()
      } catch {
        /* already closed */
      }
      this.socket = null
    }
  }

  destroy() {
    this.clientId = ''
    this.activity = null
    this.teardown()
    this.state = 'off'
  }
}

module.exports = { DiscordPresence }
