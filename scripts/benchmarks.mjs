#!/usr/bin/env node
// The numbers behind the claims, measured the same way on any build.
//
//   node scripts/benchmarks.mjs                       # this working tree (build first)
//   node scripts/benchmarks.mjs --root /path/to/tree  # another checkout, e.g. an older release
//   node scripts/benchmarks.mjs --json                # machine-readable
//
// `--root` is what makes a before/after honest: run it on the old tree and the new
// tree with the same script, not with numbers remembered from a terminal. The
// tree needs `npm run build` done (packages/engine/dist and packages/cli/dist).
//
// Four things are measured:
//   1. worst-case scan time of the detectors on hostile input (ReDoS)
//   2. how many request shapes an agent really sends get a planted secret to the upstream
//   3. whether --reversible still returns a valid reply when the secret has a newline or a quote
//   4. scan throughput on ordinary text, so a fix cannot hide a slowdown

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const root = resolve(val('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
const asJson = flag('--json')

const { detectors, detect } = await import(pathToFileURL(join(root, 'packages/engine/dist/index.js')).href)
const CLI = join(root, 'packages/cli/dist/cli.js')
const byId = (id) => detectors.find((d) => d.id === id)
const ms = (fn) => { const t = performance.now(); fn(); return performance.now() - t }
const best = (fn, n = 3) => Math.min(...Array.from({ length: n }, () => ms(fn)))
const out = {}

// 1. hostile input ----------------------------------------------------------
const CAP_MS = 20_000
const hostile = [
  ['email', 'dotted labels "a.a.a."', (n) => 'a.'.repeat(n / 2), 80_000],
  ['internal_hostname', 'dotted labels "a.a.a."', (n) => 'a.'.repeat(n / 2), 80_000],
  ['db_connection_string', 'dotted labels "a.a.a."', (n) => 'a.'.repeat(n / 2), 80_000],
  ['private_key', 'PEM headers with no END, 1 MB', (n) => '-----BEGIN PRIVATE KEY-----\n'.repeat(n / 28), 1_000_000],
]
out.hostile = hostile.map(([id, shape, make, n]) => {
  const d = byId(id)
  const small = make(n / 2)
  const big = make(n)
  const a = best(() => d.scan(small), 1)
  const b = a > CAP_MS ? a : best(() => d.scan(big), 1)
  return { detector: id, shape, bytes: n, ms_half: Math.round(a), ms: Math.round(b), growth_on_doubling: +(b / Math.max(a, 1)).toFixed(1) }
})

// 2 and 3 need a proxy in front of a local fake upstream --------------------
async function withProxy(extra, fn) {
  const seen = []
  const up = createServer(async (req, res) => {
    const ch = []
    for await (const c of req) ch.push(c)
    const body = Buffer.concat(ch).toString()
    seen.push(body)
    let echo = ''
    try { echo = JSON.parse(body).messages?.[0]?.content ?? '' } catch { /* not the echo shape */ }
    if (req.url.includes('sse')) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(`data: ${JSON.stringify({ text: echo })}\n\n`) }
    else { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ content: [{ type: 'text', text: echo }] })) }
  })
  await new Promise((r) => up.listen(0, '127.0.0.1', r))
  const port = 20000 + Math.floor(Math.random() * 20000)
  const p = spawn(process.execPath, [CLI, 'proxy', '--port', String(port), '--upstream', `http://127.0.0.1:${up.address().port}`, ...extra], { stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 900))
  try { return await fn(`http://127.0.0.1:${port}`, seen) } finally { p.kill(); up.close() }
}

const SECRET = 'AKIAIOSFODNN7EXAMPLE'
const text = `key ${SECRET}`
const SHAPES = {
  'Anthropic: user text': ['/v1/messages', { messages: [{ role: 'user', content: text }] }],
  'Anthropic: text block': ['/v1/messages', { messages: [{ role: 'user', content: [{ type: 'text', text }] }] }],
  'Anthropic: tool_result (text)': ['/v1/messages', { messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: text }] }] }],
  'Anthropic: tool_result (blocks)': ['/v1/messages', { messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text }] }] }] }],
  'Anthropic: tool_use input': ['/v1/messages', { messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'bash', input: { command: `export K=${SECRET}` } }] }] }],
  'OpenAI chat: user text': ['/v1/chat/completions', { messages: [{ role: 'user', content: text }] }],
  'OpenAI chat: tool message': ['/v1/chat/completions', { messages: [{ role: 'tool', tool_call_id: 'c', content: text }] }],
  'OpenAI chat: tool_calls arguments': ['/v1/chat/completions', { messages: [{ role: 'assistant', tool_calls: [{ id: 'c', type: 'function', function: { name: 'f', arguments: JSON.stringify({ k: SECRET }) } }] }] }],
  'OpenAI Responses: input text': ['/v1/responses', { input: text }],
  'OpenAI Responses: input items': ['/v1/responses', { input: [{ role: 'user', content: [{ type: 'input_text', text }] }] }],
  'OpenAI Responses: instructions': ['/v1/responses', { instructions: text, input: 'hi' }],
  'OpenAI legacy: prompt': ['/v1/completions', { prompt: text }],
  'Gemini: contents': ['/v1beta/models/g:generateContent', { contents: [{ parts: [{ text }] }] }],
}
out.shapes = await withProxy(['--mode', 'redact'], async (base, seen) => {
  const rows = []
  for (const [name, [path, body]] of Object.entries(SHAPES)) {
    seen.length = 0
    await (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).text()
    rows.push({ shape: name, reached_upstream: (seen[0] ?? '').includes(SECRET) })
  }
  return rows
})
out.shapes_total = out.shapes.length
out.shapes_leaked = out.shapes.filter((r) => r.reached_upstream).length

const PEM = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX\n-----END RSA PRIVATE KEY-----'
out.reversible = await withProxy(['--mode', 'redact', '--reversible'], async (base) => {
  const ask = async (path) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: `use\n${PEM}\nthanks` }] }) })).text()
  const parses = (t, sse) => { try { JSON.parse(sse ? t.split('\n').find((l) => l.startsWith('data: ')).slice(6) : t); return true } catch { return false } }
  return { json_reply_valid: parses(await ask('/v1/messages'), false), sse_reply_valid: parses(await ask('/v1/sse'), true) }
})

// 4. throughput on ordinary text --------------------------------------------
const code = 'function foo(a, b) { return a + b } // lorem ipsum dolor sit amet, consectetur\nconst url = "https://example.com/path?x=1"\n'
const benign = code.repeat(Math.ceil(1_000_000 / code.length)).slice(0, 1_000_000)
detect(benign)
const t = best(() => detect(benign), 5)
out.throughput = { default_detectors_ms_per_MB: Math.round(t), default_detectors_MB_per_s: +(1000 / t).toFixed(1) }
const all = { enabledDetectors: detectors.map((d) => d.id) }
const ta = best(() => detect(benign, all), 3)
out.throughput.all_detectors_ms_per_MB = Math.round(ta)

if (asJson) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`tree: ${root}\n`)
  console.log('1. hostile input (lower is better)')
  for (const r of out.hostile) console.log(`   ${r.detector.padEnd(22)} ${r.shape.padEnd(32)} ${String(r.ms).padStart(7)} ms   (x${r.growth_on_doubling} when the input doubles)`)
  console.log(`\n2. request shapes where a planted secret reached the upstream in redact mode: ${out.shapes_leaked} of ${out.shapes_total}`)
  for (const r of out.shapes.filter((x) => x.reached_upstream)) console.log(`   - ${r.shape}`)
  console.log(`\n3. --reversible with a multi-line key: JSON reply valid=${out.reversible.json_reply_valid}, SSE reply valid=${out.reversible.sse_reply_valid}`)
  console.log(`\n4. throughput, ordinary text: ${out.throughput.default_detectors_ms_per_MB} ms/MB with the default detectors (${out.throughput.default_detectors_MB_per_s} MB/s), ${out.throughput.all_detectors_ms_per_MB} ms/MB with all`)
}
