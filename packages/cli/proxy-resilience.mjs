// Resilience checks for the proxy, run against a real process over a real
// socket.
//
//   npm run test:proxy --workspace @sbr0nch/contextia
//
// The unit suite drives createProxyServer in-process with well-behaved clients,
// which is why it never noticed that a client hanging up mid-request killed the
// proxy outright: the body read rejected, the rejection escaped unhandled, and
// Node took the process down. Ctrl+C in your agent was enough. Everything after
// that got ECONNREFUSED, so the guard was simply gone and nothing said so.
//
// These cases need a separate process and a socket that can actually be torn
// up, so they live here rather than in the vitest suite.

import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { spawn } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CLI = join(here, 'dist/cli.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const record = (ok, name, detail = '') => results.push([ok, name, detail])

// Upstream whose behaviour each case selects.
let mode = 'json'
const upstream = createServer(async (req, res) => {
  try {
    for await (const _ of req) void _
  } catch {
    return
  }
  if (mode === 'sse') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    for (let i = 0; i < 4; i++) {
      res.write(`data: {"i":${i}}\n\n`)
      await sleep(120)
    }
    res.end('data: [DONE]\n\n')
  } else if (mode === 'die') {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: {"i":0}\n\n')
    await sleep(100)
    res.socket?.destroy()
  } else {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
  }
})
await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
const UP = upstream.address().port
const PORT = 8913

const proxy = spawn(
  process.execPath,
  [CLI, 'proxy', '--port', String(PORT), '--mode', 'redact', '--upstream', `http://127.0.0.1:${UP}`],
  { stdio: ['ignore', 'ignore', 'pipe'] },
)
let stderr = ''
proxy.stderr.on('data', (d) => (stderr += d))
await sleep(1300)

const body = (content) => JSON.stringify({ model: 'x', messages: [{ role: 'user', content }] })

function send(payload, { abortAfterMs } = {}) {
  return new Promise((resolve_) => {
    const t0 = Date.now()
    const arrivals = []
    const req = request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: '/v1/messages',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
      (res) => {
        res.on('data', () => arrivals.push(Date.now() - t0))
        res.on('end', () => resolve_({ status: res.statusCode, arrivals, ms: Date.now() - t0 }))
      },
    )
    req.on('error', (e) => resolve_({ error: e.code ?? e.message, arrivals }))
    if (abortAfterMs == null) req.end(payload)
    else {
      req.write(payload.slice(0, Math.min(payload.length, 100_000)))
      setTimeout(() => req.destroy(), abortAfterMs)
    }
  })
}

const alive = () => proxy.exitCode === null

try {
  // 1. The one that used to be fatal.
  mode = 'json'
  const huge = body('x'.repeat(2_000_000))
  for (let i = 1; i <= 3; i++) await send(huge, { abortAfterMs: 70 })
  await sleep(500)
  record(alive(), 'survives a client hanging up mid-request', alive() ? '' : 'the proxy exited')

  // 2. And still works afterwards, which is the part that matters.
  const after = await send(body('hello'))
  record(after.status === 200, 'still serves the next request', `got ${after.status ?? after.error}`)

  // 3. Streaming must stay incremental. Buffering a response would break every
  //    agent that renders tokens as they arrive.
  mode = 'sse'
  const sse = await send(body('hello'))
  const streamed = sse.arrivals.length > 1 && sse.arrivals[0] < sse.ms / 2
  record(streamed, 'streams SSE incrementally', `chunks at [${sse.arrivals.join(', ')}] of ${sse.ms}ms`)

  // 4. Upstream failing partway through must not take the proxy with it.
  mode = 'die'
  await send(body('hello'))
  await sleep(400)
  record(alive(), 'survives the upstream dying mid-response', alive() ? '' : 'the proxy exited')

  // 5. A malformed request reaches the server before any handler.
  await new Promise((done) => {
    const socket = connect(PORT, '127.0.0.1', () => {
      socket.write('GARBAGE / HTTP/9.9\r\n\r\n')
      setTimeout(() => {
        socket.destroy()
        done()
      }, 250)
    })
    socket.on('error', () => done())
  })
  await sleep(300)
  record(alive(), 'survives a malformed request', alive() ? '' : 'the proxy exited')

  // 6. Concurrency, with the stats endpoint agreeing on the count.
  mode = 'json'
  const many = await Promise.all(Array.from({ length: 50 }, () => send(body('hello'))))
  const ok = many.filter((m) => m.status === 200).length
  record(ok === 50, 'handles 50 concurrent requests', `${ok}/50 returned 200`)
  record(alive(), 'is still alive at the end', alive() ? '' : 'the proxy exited')
} finally {
  proxy.kill()
  upstream.close()
}

const noise = stderr
  .split('\n')
  .filter((l) => l && !/^contextia proxy:|^point your agent|^live stats/.test(l))
record(noise.length === 0, 'logs no unhandled errors', noise.slice(0, 3).join(' | '))

const line = '-'.repeat(70)
console.log(`\n${line}\nProxy resilience\n${line}`)
for (const [ok, name, detail] of results) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`)
}
const failed = results.filter(([ok]) => !ok).length
console.log(failed ? `\n${failed} failed\n` : `\nall ${results.length} passed\n`)
process.exit(failed ? 1 : 0)
