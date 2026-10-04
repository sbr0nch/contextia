import { describe, it, expect, afterEach } from 'vitest'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib'
import { detectors } from '@sbr0nch/contextia-engine'
import {
  parseEventBatch,
  foldEvents,
  decodeBody,
  escapeHtml,
  configFor,
  processPayload,
  textNodes,
  createProxyServer,
  MAX_STAT_KEYS,
  type ProxyStats,
  type ProxyMode,
} from '../src/proxy.js'
import { lineCol, maskValue, configFor as cliConfigFor } from '../src/core.js'

// Laws added after mutation testing proxy.ts and core.ts: the unit suite scored
// 61% on proxy.ts, so most small rewrites of its validation, header and
// decoding rules went unnoticed. Each group pins a rule that was free to change.

const SECRET = 'AKIAIOSFODNN7EXAMPLE'
const ev = (over: Record<string, unknown> = {}) => ({ ts: 't', site: 's', detector: 'd', action: 'warn', count: 1, ...over })
const stats = (): ProxyStats => ({ startedAt: 0, requests: 0, withFindings: 0, redacted: 0, blocked: 0, leaked: 0, unscanned: 0, byType: {}, bySite: {} })

describe('parseEventBatch accepts exactly the counts-only shape', () => {
  it('accepts the smallest and the largest valid batch', () => {
    expect(parseEventBatch({ events: [ev()] })).toHaveLength(1)
    expect(parseEventBatch({ events: Array.from({ length: 1000 }, () => ev({ count: 100000 })) })).toHaveLength(1000)
    for (const action of ['warn', 'redact', 'block', 'leaked']) expect(parseEventBatch({ events: [ev({ action })] })).not.toBeNull()
  })

  it('refuses every way of being wrong', () => {
    const bad: unknown[] = [
      null, undefined, 'x', 5, [], {}, { events: 'x' }, { events: [] }, { events: Array.from({ length: 1001 }, () => ev()) },
      { events: [null] }, { events: ['x'] }, { events: [5] },
      { events: [ev({ match: SECRET })] }, // an extra field, which is how a secret would arrive
      { events: [ev({ ts: 5 })] }, { events: [ev({ site: null })] }, { events: [ev({ detector: {} })] },
      { events: [ev({ action: 'nope' })] }, { events: [ev({ action: 5 })] },
      { events: [ev({ count: '1' })] }, { events: [ev({ count: 1.5 })] }, { events: [ev({ count: 0 })] },
      { events: [ev({ count: -1 })] }, { events: [ev({ count: 100001 })] }, { events: [ev({ count: NaN })] },
      { events: [ev(), ev({ count: 0 })] }, // one bad event spoils the batch
    ]
    for (const b of bad) expect(parseEventBatch(b), JSON.stringify(b)).toBeNull()
  })
})

describe('stats', () => {
  it('folds each action into its own counter', () => {
    const s = stats()
    foldEvents(s, [ev({ action: 'redact', count: 2 }), ev({ action: 'block', count: 3 }), ev({ action: 'leaked', count: 4 }), ev({ action: 'warn', count: 5 })])
    expect(s).toMatchObject({ withFindings: 14, redacted: 2, blocked: 3, leaked: 4 })
    expect(s.byType).toEqual({ d: 14 })
    expect(s.bySite).toEqual({ s: 14 })
  })

  it('stops adding keys at the cap, keeps counting the ones it has, and takes the last one under it', () => {
    const s = stats()
    foldEvents(s, Array.from({ length: MAX_STAT_KEYS - 1 }, (_, i) => ev({ site: `k${i}` })))
    foldEvents(s, [ev({ site: 'last' })]) // the 200th key
    expect(Object.keys(s.bySite)).toHaveLength(MAX_STAT_KEYS)
    foldEvents(s, [ev({ site: 'one-too-many' }), ev({ site: 'k0', count: 4 })])
    expect(s.bySite['one-too-many']).toBeUndefined()
    expect(s.bySite['k0']).toBe(5)
    expect(Object.keys(s.bySite)).toHaveLength(MAX_STAT_KEYS)
  })
})

describe('decodeBody', () => {
  const body = Buffer.from('{"a":1}')
  it('passes identity through, whatever the case or spacing', () => {
    for (const e of [undefined, '', 'identity', ' IDENTITY ']) expect(decodeBody(body, e)).toBe(body)
  })
  it('decodes gzip, x-gzip, deflate and br, whatever the case or spacing', () => {
    expect(decodeBody(gzipSync(body), ' GZIP ')?.toString()).toBe('{"a":1}')
    expect(decodeBody(gzipSync(body), 'x-gzip')?.toString()).toBe('{"a":1}')
    expect(decodeBody(deflateSync(body), 'deflate')?.toString()).toBe('{"a":1}')
    expect(decodeBody(brotliCompressSync(body), 'br')?.toString()).toBe('{"a":1}')
  })
  it('returns null for an encoding it cannot read and for a body that does not match its encoding', () => {
    expect(decodeBody(body, 'zstd')).toBeNull()
    expect(decodeBody(body, 'gzip')).toBeNull()
    expect(decodeBody(body, 'deflate')).toBeNull()
    expect(decodeBody(body, 'br')).toBeNull()
  })
})

describe('escapeHtml escapes all five characters', () => {
  it('turns markup into text', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  })
})

describe('configFor', () => {
  it('enables every detector with --all and the defaults without it', () => {
    expect(configFor()).toEqual({})
    expect(cliConfigFor({})).toEqual({})
    for (const c of [configFor(true), cliConfigFor({ all: true })]) expect(c.enabledDetectors).toEqual(detectors.map((d) => d.id))
  })
})

describe('core', () => {
  it('lineCol counts to the offset and not past the end of the text', () => {
    expect(lineCol('a\nb', 3)).toEqual({ line: 2, col: 2 })
    expect(lineCol('a\nb', 99)).toEqual({ line: 2, col: 99 - 2 + 1 })
    expect(lineCol('a\nb', 2)).toEqual({ line: 2, col: 1 })
    expect(lineCol('a\nb', 1)).toEqual({ line: 1, col: 2 })
    expect(lineCol('', 0)).toEqual({ line: 1, col: 1 })
  })
  it('maskValue changes its reveal at exactly 20 and 40 characters', () => {
    const v = (n: number) => 'abcdefghij'.repeat(5).slice(0, n)
    expect(maskValue(v(10))).toBe('•'.repeat(10))
    expect(maskValue(v(11))).toBe('a…a')
    expect(maskValue(v(19))).toBe('a…i')
    expect(maskValue(v(20))).toBe('ab…ij')
    expect(maskValue(v(39))).toBe('ab…hi')
    expect(maskValue(v(40))).toBe('abcd…ghij')
  })
})

describe('which strings are read, and in what order', () => {
  it('reads system, then messages in order, then the rest', () => {
    const body = { tools: [{ description: 'T' }], messages: [{ content: 'M1' }, { content: 'M2' }], system: 'S', extra: { deep: ['D1', 'D2'] } }
    expect([...textNodes(body)].map((n) => n.get())).toEqual(['S', 'M1', 'M2', 'T', 'D1', 'D2'])
  })

  it('puts the signature on the first prose node that had a finding, and only once', () => {
    const body = { messages: [{ role: 'user', content: `a ${SECRET}` }, { role: 'user', content: `b ${SECRET}` }] }
    processPayload(body, 'redact', configFor(), undefined, undefined, true)
    expect(body.messages[0]!.content.startsWith('[Secrets redacted locally by Contextia')).toBe(true)
    expect(body.messages[1]!.content).not.toContain('Contextia')
  })

  it('leaves redacted_thinking and a plain-text field called data alone only where they are opaque', () => {
    const body = {
      messages: [
        { role: 'assistant', content: [{ type: 'redacted_thinking', data: `x/${SECRET}/y` }] },
        { role: 'user', content: [{ type: 'tool_use', id: 'i', name: 'n', input: { data: `k ${SECRET}` } }] },
      ],
    }
    expect(processPayload(body, 'redact', configFor())).toHaveLength(1) // only the tool input, whose key is called data
    expect(JSON.stringify(body)).toContain(`x/${SECRET}/y`)
  })

  it('numbers reversible tokens from 1, one per secret, so two secrets stay apart', () => {
    const vault = new Map<string, string>()
    const other = 'ghp_' + 'aB3dE6gH9jK2mN5pQ8rS1tV4wX7yZ0cF3hL6'
    const body = { messages: [{ role: 'user', content: `${SECRET} then ${other}` }] }
    processPayload(body, 'redact', configFor(), undefined, vault)
    expect([...vault.keys()]).toEqual(['⟨cx:1⟩', '⟨cx:2⟩'])
    expect([...vault.values()].sort()).toEqual([SECRET, other].sort())
    expect(body.messages[0]!.content).toBe(`⟨cx:1⟩ then ⟨cx:2⟩`)
  })
})

// The proxy end to end, with the upstream recording what it receives.
describe('what is forwarded and what comes back', () => {
  const open: Server[] = []
  afterEach(async () => {
    await Promise.all(open.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))))
  })
  const listen = (s: Server): Promise<number> =>
    new Promise((r) => {
      open.push(s)
      s.listen(0, () => r((s.address() as AddressInfo).port))
    })

  interface Seen { headers: Record<string, string | string[] | undefined>; body: string }

  async function through(
    mode: ProxyMode,
    send: { headers?: Record<string, string>; body: Buffer },
    reply: (res: import('node:http').ServerResponse) => void = (r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"ok":1}') },
  ): Promise<{ seen: Seen; status: number; headers: Record<string, string | string[] | undefined>; body: Buffer; proxyPort: number }> {
    let seen: Seen = { headers: {}, body: '' }
    const upstream = createServer(async (req, res) => {
      const ch: Buffer[] = []
      for await (const c of req) ch.push(c as Buffer)
      seen = { headers: req.headers, body: Buffer.concat(ch).toString('utf8') }
      reply(res)
    })
    const upPort = await listen(upstream)
    const proxy = createProxyServer({ port: 0, mode, upstream: `http://localhost:${upPort}` })
    const proxyPort = await listen(proxy)
    const out = await new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port: proxyPort, method: 'POST', path: '/v1/messages?x=1', headers: { 'content-type': 'application/json', ...send.headers } },
        (res) => {
          const ch: Buffer[] = []
          res.on('data', (c) => ch.push(c))
          res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(ch) }))
        },
      )
      req.on('error', reject)
      req.end(send.body)
    })
    return { seen, ...out, proxyPort }
  }

  const json = (content: string): Buffer => Buffer.from(JSON.stringify({ messages: [{ role: 'user', content }] }))

  it('does not forward hop-by-hop headers, and sets accept-encoding to identity', async () => {
    const r = await through('warn', {
      body: json('hi'),
      headers: { te: 'trailers', trailer: 'x', 'proxy-connection': 'keep-alive', 'keep-alive': 'timeout=5', upgrade: 'h2c', 'accept-encoding': 'gzip', 'x-keep-me': 'yes', authorization: 'Bearer abc' },
    })
    for (const h of ['te', 'trailer', 'proxy-connection', 'keep-alive', 'upgrade']) expect(r.seen.headers[h], h).toBeUndefined()
    expect(r.seen.headers['accept-encoding']).toBe('identity')
    expect(r.seen.headers['x-keep-me']).toBe('yes')
    expect(r.seen.headers['authorization']).toBe('Bearer abc')
    expect(String(r.seen.headers['host'])).toMatch(/^localhost:\d+$/) // the upstream's own, not the proxy's
  })

  it('forwards a redacted gzip body as plain JSON: no content-encoding, and the length it really has', async () => {
    const r = await through('redact', { body: gzipSync(json(`k ${SECRET}`)), headers: { 'content-encoding': 'gzip' } })
    expect(r.seen.headers['content-encoding']).toBeUndefined()
    expect(r.seen.body).not.toContain(SECRET)
    expect(JSON.parse(r.seen.body)).toBeTruthy()
    expect(Number(r.seen.headers['content-length'])).toBe(Buffer.byteLength(r.seen.body))
  })

  it('forwards an untouched gzip body as it came when nothing was redacted', async () => {
    const r = await through('redact', { body: gzipSync(json('clean')), headers: { 'content-encoding': 'gzip' } })
    expect(r.seen.headers['content-encoding']).toBe('gzip')
  })

  it('passes the upstream status and headers back, minus content-encoding and content-length', async () => {
    const r = await through('warn', { body: json('hi') }, (res) => {
      res.writeHead(418, { 'content-type': 'application/json', 'x-request-id': 'abc', 'content-encoding': 'gzip' })
      res.end(gzipSync(Buffer.from('{"teapot":true}')))
    })
    expect(r.status).toBe(418)
    expect(r.headers['x-request-id']).toBe('abc')
    expect(r.headers['content-encoding']).toBeUndefined()
    expect(r.body.toString()).toBe('{"teapot":true}') // fetch decoded it, so it goes back decoded
  })

  it('streams every chunk of a reply and ends it', async () => {
    const r = await through('warn', { body: json('hi') }, (res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: 1\n\n')
      setTimeout(() => { res.write('data: 2\n\n'); res.end('data: 3\n\n') }, 20)
    })
    expect(r.body.toString()).toBe('data: 1\n\ndata: 2\n\ndata: 3\n\n')
  })

  it('keeps the path and query it was called with', async () => {
    let url = ''
    const up = createServer((req, res) => { url = req.url ?? ''; res.end('{}') })
    const upPort = await listen(up)
    const proxy = createProxyServer({ port: 0, mode: 'warn', upstream: `http://localhost:${upPort}` })
    const port = await listen(proxy)
    await (await fetch(`http://localhost:${port}/v1/messages?beta=true`, { method: 'POST', body: '{}' })).text()
    expect(url).toBe('/v1/messages?beta=true')
  })

  it('restores two different reversible secrets each to its own place', async () => {
    const other = 'ghp_' + 'aB3dE6gH9jK2mN5pQ8rS1tV4wX7yZ0cF3hL6'
    const up = createServer(async (req, res) => {
      const ch: Buffer[] = []
      for await (const c of req) ch.push(c as Buffer)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(Buffer.concat(ch))
    })
    const upPort = await listen(up)
    const proxy = createProxyServer({ port: 0, mode: 'redact', reversible: true, signature: false, upstream: `http://localhost:${upPort}` })
    const port = await listen(proxy)
    const res = await fetch(`http://localhost:${port}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json(`first ${SECRET} second ${other}`) })
    const text = await res.text()
    expect(JSON.parse(text).messages[0].content).toBe(`first ${SECRET} second ${other}`)
  })

  it('counts requests, findings and unscanned bodies in the stats', async () => {
    const up = createServer((req, res) => { req.resume(); res.end('{}') })
    const upPort = await listen(up)
    const proxy = createProxyServer({ port: 0, mode: 'redact', upstream: `http://localhost:${upPort}` })
    const port = await listen(proxy)
    const post = (b: string | Buffer, h: Record<string, string> = {}) => fetch(`http://localhost:${port}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: b }).then((x) => x.text())
    await post(json('clean'))
    await post(json(`k ${SECRET}`))
    await post('not json at all')
    const s = (await (await fetch(`http://localhost:${port}/__contextia/stats`)).json()) as ProxyStats
    expect(s).toMatchObject({ requests: 3, withFindings: 1, redacted: 1, blocked: 0, unscanned: 1 })
    expect(s.byType).toEqual({ aws_access_key_id: 1 })
  })

  it('shows the busiest 25 rows of the dashboard, busiest first, and escapes their names', async () => {
    const proxy = createProxyServer({ port: 0, mode: 'warn' })
    const port = await listen(proxy)
    const events = Array.from({ length: 30 }, (_, i) => ev({ detector: `<d${i}>`, count: i + 1 }))
    await fetch(`http://localhost:${port}/__contextia/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }) })
    const html = await (await fetch(`http://localhost:${port}/__contextia`)).text()
    const rows = [...html.matchAll(/<tr><td>(&lt;d\d+&gt;)<\/td><td>(\d+)<\/td><\/tr>/g)]
    const typeRows = rows.filter((r) => Number(r[2]) > 0)
    expect(typeRows.slice(0, 25).map((r) => Number(r[2]))).toEqual(Array.from({ length: 25 }, (_, i) => 30 - i))
    expect(html).not.toContain('<d29>')
    expect(html).not.toContain('no secrets seen yet')
  })

  it('says so on the dashboard when nothing has been seen', async () => {
    const proxy = createProxyServer({ port: 0, mode: 'warn' })
    const port = await listen(proxy)
    const html = await (await fetch(`http://localhost:${port}/__contextia`)).text()
    expect(html).toContain('no secrets seen yet')
    expect(html).not.toContain('by site (browser)')
  })
})

describe('methods, size limits and refusals', () => {
  const open: Server[] = []
  afterEach(async () => {
    await Promise.all(open.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))))
  })
  const listen = (s: Server): Promise<number> =>
    new Promise((r) => {
      open.push(s)
      s.listen(0, () => r((s.address() as AddressInfo).port))
    })

  async function setup(mode: ProxyMode) {
    const calls: Array<{ method: string; body: string }> = []
    const up = createServer(async (req, res) => {
      const ch: Buffer[] = []
      for await (const c of req) ch.push(c as Buffer)
      calls.push({ method: req.method ?? '', body: Buffer.concat(ch).toString('utf8') })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":1}')
    })
    const upPort = await listen(up)
    const proxy = createProxyServer({ port: 0, mode, upstream: `http://localhost:${upPort}` })
    const port = await listen(proxy)
    const get = async (path: string, init: RequestInit = {}) => {
      const r = await fetch(`http://localhost:${port}${path}`, init)
      return { status: r.status, text: await r.text() }
    }
    const stats = async () => JSON.parse((await get('/__contextia/stats')).text) as ProxyStats
    return { calls, get, stats, port }
  }
  const body = (content: string): string => JSON.stringify({ messages: [{ role: 'user', content }] })
  const JSON_H = { 'content-type': 'application/json' }

  it('scans the body of a POST, PUT, PATCH and DELETE alike, in redact and in block mode', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const r = await setup('redact')
      await r.get('/v1/x', { method, headers: JSON_H, body: body(`k ${SECRET}`) })
      expect(r.calls[0]!.body, method).not.toContain(SECRET)
      const b = await setup('block')
      expect((await b.get('/v1/x', { method, headers: JSON_H, body: body(`k ${SECRET}`) })).status, method).toBe(403)
      expect(b.calls, method).toHaveLength(0)
    }
  })

  it('forwards a GET with no body, and a request for its own pages needs no Host check on the API paths', async () => {
    const t = await setup('block')
    expect((await t.get('/v1/models')).status).toBe(200)
    expect(t.calls[0]).toEqual({ method: 'GET', body: '' })
    const r = await new Promise<number>((resolve, reject) => {
      const q = request({ host: '127.0.0.1', port: t.port, method: 'GET', path: '/v1/models', headers: { host: 'my-alias.local' } }, (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode ?? 0))
      })
      q.on('error', reject)
      q.end()
    })
    expect(r).toBe(200)
  })

  it('answers the events route only to a POST, and a bad batch with 400 and no change', async () => {
    const t = await setup('warn')
    expect((await t.get('/__contextia/events')).status).toBe(405)
    for (const bad of ['not json', '{"events":[]}', JSON.stringify({ events: [ev({ match: SECRET })] })]) {
      const r = await t.get('/__contextia/events', { method: 'POST', headers: JSON_H, body: bad })
      expect(r.status, bad).toBe(400)
    }
    expect(await t.stats()).toMatchObject({ withFindings: 0, leaked: 0 })
  })

  it('block: the 403 names the types and never the value, and counts one block', async () => {
    const t = await setup('block')
    const r = await t.get('/v1/messages', { method: 'POST', headers: JSON_H, body: body(`k ${SECRET}`) })
    expect(r.status).toBe(403)
    expect(JSON.parse(r.text).error).toMatchObject({ type: 'contextia_blocked', secrets: ['aws_access_key_id'] })
    expect(r.text).not.toContain(SECRET)
    expect(await t.stats()).toMatchObject({ blocked: 1, withFindings: 1, requests: 1 })
    expect(t.calls).toHaveLength(0)
  })

  it('block: a body over the 5 MB scan cap is refused as oversize, and counted as one block', async () => {
    const t = await setup('block')
    const r = await t.get('/v1/messages', { method: 'POST', headers: JSON_H, body: body('x'.repeat(5 * 1024 * 1024 + 10)) })
    expect(r.status).toBe(403)
    expect(JSON.parse(r.text).error).toMatchObject({ type: 'contextia_unscannable', reason: 'oversize' })
    expect(await t.stats()).toMatchObject({ blocked: 1 })
    expect(t.calls).toHaveLength(0)
  })

  // A tool_result can be a whole file. The proxy used to refuse a text past the engine cap in
  // block mode, and forward it with the tail unread in redact mode.
  it('scans a text longer than the engine cap to the end: a secret in the tail is caught, a clean one passes', async () => {
    const long = 'x '.repeat(600_000)
    const blocked = await setup('block')
    const a = await blocked.get('/v1/messages', { method: 'POST', headers: JSON_H, body: body(long + `\n${SECRET}\n`) })
    expect(a.status).toBe(403)
    expect(JSON.parse(a.text).error.type).toBe('contextia_blocked')
    const clean = await blocked.get('/v1/messages', { method: 'POST', headers: JSON_H, body: body(long) })
    expect(clean.status).toBe(200)
    const redacting = await setup('redact')
    await redacting.get('/v1/messages', { method: 'POST', headers: JSON_H, body: body(long + `\n${SECRET}\n`) })
    expect(redacting.calls[0]!.body).not.toContain(SECRET)
    expect(await redacting.stats()).toMatchObject({ unscanned: 0, redacted: 1 })
  })

  it('block: a body that is not JSON, and one whose encoding it cannot read, are refused with their reasons', async () => {
    const t = await setup('block')
    const a = await t.get('/v1/messages', { method: 'POST', headers: JSON_H, body: 'not json' })
    expect(JSON.parse(a.text).error.reason).toBe('unparsable')
    const b = await t.get('/v1/messages', { method: 'POST', headers: { ...JSON_H, 'content-encoding': 'zstd' }, body: 'x' })
    expect(JSON.parse(b.text).error.reason).toBe('encoding')
    expect(await t.stats()).toMatchObject({ blocked: 2 })
  })

  it('warn: forwards an oversize and an unreadable body, and counts each as unscanned', async () => {
    const t = await setup('warn')
    await t.get('/v1/messages', { method: 'POST', headers: JSON_H, body: body('x'.repeat(5 * 1024 * 1024 + 10)) })
    await t.get('/v1/messages', { method: 'POST', headers: { ...JSON_H, 'content-encoding': 'zstd' }, body: 'x' })
    expect(t.calls).toHaveLength(2)
    expect(await t.stats()).toMatchObject({ unscanned: 2, blocked: 0 })
  })
})
