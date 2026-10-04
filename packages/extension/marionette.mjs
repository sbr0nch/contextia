// A minimal client for Marionette, the remote-control protocol that is built into Firefox.
// Playwright cannot load an extension into Firefox (its Firefox is a patched build), and
// geckodriver is a download from GitHub; Marionette is in the stock browser and is a
// length-prefixed JSON conversation over a local socket, so a hundred lines are enough.
import net from 'node:net'

export class Marionette {
  constructor(port) {
    this.port = port
    this.id = 0
    this.pending = new Map()
    this.buf = Buffer.alloc(0)
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.sock = net.connect(this.port, '127.0.0.1')
      this.sock.on('error', reject)
      let greeted = false
      this.sock.on('data', (d) => {
        this.buf = Buffer.concat([this.buf, d])
        for (;;) {
          const colon = this.buf.indexOf(':')
          if (colon < 0) return
          const len = Number(this.buf.subarray(0, colon).toString())
          if (this.buf.length < colon + 1 + len) return
          const body = JSON.parse(this.buf.subarray(colon + 1, colon + 1 + len).toString())
          this.buf = this.buf.subarray(colon + 1 + len)
          if (!greeted) {
            greeted = true
            this.hello = body
            resolve(body)
          } else if (Array.isArray(body) && body[0] === 1) {
            const [, id, err, res] = body
            const p = this.pending.get(id)
            this.pending.delete(id)
            if (p) err ? p.reject(Object.assign(new Error(`${err.error}: ${err.message}`), { detail: err })) : p.resolve(res)
          }
        }
      })
    })
  }
  send(name, params = {}) {
    const id = ++this.id
    const msg = JSON.stringify([0, id, name, params])
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.sock.write(`${Buffer.byteLength(msg)}:${msg}`)
    })
  }
  close() {
    this.sock?.destroy()
  }
}
