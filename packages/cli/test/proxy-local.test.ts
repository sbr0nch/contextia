import { describe, it, expect, afterEach } from 'vitest'
import { request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync, brotliCompressSync as brotli, deflateSync, constants } from 'node:zlib'
import { createProxyServer, decodeBody } from '../src/proxy.js'

// The proxy's own pages (/__contextia, /stats, /events) are served on a loopback
// port that any web page the user has open can reach. Measured before this law:
// a page's text/plain POST put 99,999 fake "leaked" events into the stats, and
// the stats and dashboard answered a request whose Host was another domain,
// which is what DNS rebinding sends. A 400 KB gzip was expanded to 400 MB.
const open: Server[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))))
})

async function start(host?: string): Promise<number> {
  const s = createProxyServer({ port: 0, mode: 'warn', host })
  open.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  return (s.address() as AddressInfo).port
}

function send(port: number, method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const EVENTS = JSON.stringify({ events: [{ ts: 't', site: 'evil', detector: 'aws_access_key_id', action: 'leaked', count: 5 }] })
const leaked = async (port: number): Promise<number> => (JSON.parse((await send(port, 'GET', '/__contextia/stats', { host: `localhost:${port}` })).body) as { leaked: number }).leaked

describe('local pages and the web', () => {
  it('refuses a stats batch posted by a web page', async () => {
    const port = await start()
    for (const origin of ['https://evil.example', 'http://localhost:3000', 'null']) {
      const r = await send(port, 'POST', '/__contextia/events', { host: `127.0.0.1:${port}`, origin, 'content-type': 'text/plain' }, EVENTS)
      expect(r.status, origin).toBe(403)
    }
    expect(await leaked(port)).toBe(0)
  })

  it('still accepts the batch from the extension and from a client with no Origin', async () => {
    const port = await start()
    for (const origin of ['chrome-extension://abcdefghijklmnop', 'moz-extension://1234-5678', undefined]) {
      const headers: Record<string, string> = { host: `127.0.0.1:${port}`, 'content-type': 'application/json' }
      if (origin) headers['origin'] = origin
      expect((await send(port, 'POST', '/__contextia/events', headers, EVENTS)).status, String(origin)).toBe(204)
    }
    expect(await leaked(port)).toBe(15)
  })

  it('answers stats and dashboard only for a loopback Host (DNS rebinding)', async () => {
    const port = await start()
    for (const path of ['/__contextia/stats', '/__contextia', '/__contextia/']) {
      for (const host of ['evil.example', `evil.example:${port}`, '192.168.1.5', `127.0.0.1.evil.example:${port}`]) {
        const r = await send(port, 'GET', path, { host })
        expect(r.status, `${path} Host '${host}'`).toBe(403)
      }
      for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, 'LOCALHOST']) {
        expect((await send(port, 'GET', path, { host })).status, `${path} Host '${host}'`).toBe(200)
      }
    }
  })

  it('does not apply the Host check when the operator bound a non-loopback interface on purpose', async () => {
    const port = await start('0.0.0.0')
    expect((await send(port, 'GET', '/__contextia/stats', { host: '192.168.1.5:8787' })).status).toBe(200)
  })
})

const brotliCompressSync = (b: Buffer): Buffer => brotli(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 1 } })

describe('decodeBody refuses a decompression bomb', () => {
  const MB = 1024 * 1024
  it('returns null when the output would pass the scan cap', () => {
    const zeros = Buffer.alloc(12 * MB) // the scan cap is 5 MB
    for (const packed of [gzipSync(zeros), deflateSync(zeros), brotliCompressSync(zeros)]) {
      expect(packed.length).toBeLessThan(MB)
    }
    expect(decodeBody(gzipSync(zeros), 'gzip')).toBeNull()
    expect(decodeBody(deflateSync(zeros), 'deflate')).toBeNull()
    expect(decodeBody(brotliCompressSync(zeros), 'br')).toBeNull()
  })

  it('still decodes an ordinary body', () => {
    const text = Buffer.from('{"a":"hello"}')
    expect(decodeBody(gzipSync(text), 'gzip')?.toString()).toBe('{"a":"hello"}')
    expect(decodeBody(brotliCompressSync(text), 'br')?.toString()).toBe('{"a":"hello"}')
  })
})
