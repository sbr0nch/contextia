// The proxy under load, as a real process: does memory stay flat, do concurrent
// reversible requests keep their secrets apart, and what does it cost per request.
//
//   npm run test:proxy --workspace @sbr0nch/contextia
//
// A proxy that is left running for days, in front of an agent that re-sends its whole
// conversation on every turn, is the realistic customer. The checks are about shape,
// not speed: memory growth after thousands of requests, exact counters, and no mixing
// of one request's secret into another's reply. Throughput is printed, not asserted:
// a millisecond figure is a statement about the machine.

import { createServer, Agent, request } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { waitForPort } from './wait-port.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'dist/cli.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const record = (ok, name, detail = '') => results.push([ok, name, detail])
const rssMB = (pid) => {
  try {
    return Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024
  } catch {
    return null // no /proc (macOS, Windows): memory is not measured there
  }
}

// upstream: answers with the text it was sent, so a reply carries the request's own secret
const upstream = createServer(async (req, res) => {
  const ch = []
  for await (const c of req) ch.push(c)
  const body = JSON.parse(Buffer.concat(ch).toString())
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ content: [{ type: 'text', text: body.messages[0].content }] }))
})
await new Promise((r) => upstream.listen(0, '127.0.0.1', r))

async function withProxy(extra, fn) {
  const port = 20000 + Math.floor(Math.random() * 20000)
  const p = spawn(process.execPath, [CLI, 'proxy', '--port', String(port), '--upstream', `http://127.0.0.1:${upstream.address().port}`, ...extra], { stdio: 'ignore' })
  await waitForPort(port, p)
  try {
    return await fn(port, p)
  } finally {
    p.kill()
  }
}

const agent = new Agent({ keepAlive: true, maxSockets: 64 })
function post(port, body) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    const r = request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/messages', agent, headers: { 'content-type': 'application/json' } }, (res) => {
      const ch = []
      res.on('data', (c) => ch.push(c))
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(ch).toString(), ms: performance.now() - t0 }))
    })
    r.on('error', reject)
    r.end(body)
  })
}
const awsKey = (i) => 'AKIA' + [...String(i * 7919 + 104729).padStart(16, '0')].map((d) => 'ABCDEFGHIJ'[d]).join('')

// 1. concurrent reversible requests keep their secrets apart ---------------------
await withProxy(['--mode', 'redact', '--reversible', '--no-signature'], async (port) => {
  const N = 120
  const keys = Array.from({ length: N }, (_, i) => awsKey(i))
  const replies = await Promise.all(keys.map((k) => post(port, JSON.stringify({ messages: [{ role: 'user', content: `deploy with ${k} now` }] }))))
  const wrong = replies.map((r, i) => ({ r, i })).filter(({ r, i }) => {
    const text = JSON.parse(r.text).content[0].text
    return text !== `deploy with ${keys[i]} now` || keys.some((k, j) => j !== i && r.text.includes(k))
  })
  record(wrong.length === 0, `${N} concurrent reversible requests: each reply holds its own secret and no other`, wrong.length ? `request ${wrong[0].i} got ${wrong[0].r.text.slice(0, 100)}` : '')
  const stats = await (await fetch(`http://127.0.0.1:${port}/__contextia/stats`)).json()
  record(stats.requests === N && stats.redacted === N && stats.withFindings === N, 'and the counters are exact under concurrency', JSON.stringify({ requests: stats.requests, redacted: stats.redacted, withFindings: stats.withFindings }))
})

// 2. memory over thousands of requests -----------------------------------------
await withProxy(['--mode', 'redact'], async (port, p) => {
  const body = (i) => JSON.stringify({ messages: [{ role: 'user', content: `${'lorem ipsum dolor sit amet '.repeat(2000)} key ${awsKey(i)}` }] })
  const batch = async (from, n) => {
    const t0 = performance.now()
    for (let i = from; i < from + n; i += 16) await Promise.all(Array.from({ length: Math.min(16, from + n - i) }, (_, k) => post(port, body(i + k))))
    return performance.now() - t0
  }
  await batch(0, 400) // warm up: JIT, buffers
  await sleep(300)
  const before = rssMB(p.pid)
  const N = 3000
  const ms = await batch(1000, N)
  await sleep(500)
  const after = rssMB(p.pid)
  const kb = Math.round(body(0).length / 1024)
  console.log(`  info  ${N} requests of ${kb} KB, 16 at a time: ${Math.round((N * 1000) / ms)} requests/s, ${Math.round(ms / N)} ms each on average`)
  if (before === null) record(true, 'memory after thousands of requests: not measured on this platform (NOT PROVEN)')
  else record(after - before < 80, `memory stays flat across ${N} requests`, `${Math.round(before)} MB -> ${Math.round(after)} MB (+${Math.round(after - before)} MB)`)
})

upstream.close()
agent.destroy()
const line = '-'.repeat(70)
console.log(`\n${line}\nProxy under load\n${line}`)
for (const [ok, name, detail] of results) console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`)
const failed = results.filter(([ok]) => !ok).length
console.log(failed ? `\n${failed} failed\n` : `\nall ${results.length} passed\n`)
process.exit(failed ? 1 : 0)
