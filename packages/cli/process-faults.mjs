// What happens to the people around the proxy when something goes wrong, run as
// real processes.
//
//   npm run test:proxy --workspace @sbr0nch/contextia
//
// proxy-resilience.mjs covers the proxy surviving bad clients. This covers the
// operator and the agent: a port that is taken, a command that does not exist, a
// child that exits with a code, a wrapper that is told to stop, an upstream that
// cannot be reached. Each of these used to end in a stack trace or a silent
// orphan, or had never been looked at.

import { createServer } from 'node:http'
import { createServer as netServer } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { waitForPort } from './wait-port.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const CLI = join(here, 'dist/cli.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const posix = process.platform !== 'win32'

const results = []
const record = (ok, name, detail = '') => results.push([ok, name, detail])
const skipped = (name, why) => results.push([null, name, why])

/** Run the CLI to the end (or until `ms`), collecting output. */
function cli(args, { ms = 15000, env = {}, onStart } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    const timer = setTimeout(() => p.kill('SIGKILL'), ms)
    p.on('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, out, err, p })
    })
    onStart?.(p)
  })
}
// a stack frame is "    at something (file:line:col)"; a sentence that contains "at " is not one
const noStack = (s) => !/^\s+at .*:\d+:\d+\)?$|node:events|node:net|Unhandled 'error'/m.test(s)

// 1. a port that is taken ----------------------------------------------------
{
  const busy = netServer()
  await new Promise((r) => busy.listen(0, '127.0.0.1', r))
  const port = busy.address().port
  const r = await cli(['proxy', '--port', String(port)])
  busy.close()
  record(r.code === 1, 'proxy on a port that is taken exits 1', `exit ${r.code}`)
  record(new RegExp(`${port}`).test(r.err) && /in use/i.test(r.err), 'and says which port is in use', r.err.split('\n')[0])
  record(noStack(r.err), 'and does not print a stack trace', r.err.split('\n').slice(0, 3).join(' | '))
}

// 2. contextia run: exit codes and wiring ------------------------------------
{
  const r = await cli(['run', '--', process.execPath, '-e', 'process.exit(7)'])
  record(r.code === 7, "run passes on the child's exit code", `exit ${r.code}`)
}
{
  const r = await cli(['run', '--', 'contextia-no-such-command-xyz'])
  record(r.code === 127 && /cannot launch/.test(r.err) && noStack(r.err), 'run with a command that does not exist exits 127 with a message', `exit ${r.code}: ${r.err.split('\n').pop()}`)
}
{
  const r = await cli(['run'])
  record(r.code === 2 && /usage/i.test(r.err), 'run with no command exits 2 with the usage', `exit ${r.code}`)
}
{
  const r = await cli(['run', '--mode', 'nonsense', '--', process.execPath, '-e', '0'])
  record(r.code === 2, 'run with an invalid mode exits 2 before starting anything', `exit ${r.code}`)
}

// 3. the whole path: run -> agent -> proxy -> upstream -------------------------
{
  let received = ''
  const up = createServer(async (req, res) => {
    const ch = []
    for await (const c of req) ch.push(c)
    received = Buffer.concat(ch).toString()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
  })
  await new Promise((r) => up.listen(0, '127.0.0.1', r))
  const agent = `
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'key AKIAIOSFODNN7EXAMPLE' }] })
    const urls = [process.env.ANTHROPIC_BASE_URL, process.env.OPENAI_BASE_URL, process.env.OPENAI_API_BASE]
    if (new Set(urls).size !== 1 || !urls[0]) { console.error('base urls differ: ' + urls); process.exit(3) }
    fetch(urls[0] + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      .then((r) => r.text()).then(() => process.exit(0), (e) => { console.error(String(e)); process.exit(4) })`
  const r = await cli(['run', '--upstream', `http://127.0.0.1:${up.address().port}`, '--', process.execPath, '-e', agent])
  up.close()
  record(r.code === 0, 'an agent started by run sends its request through the proxy, with all three base URLs set', `exit ${r.code} ${r.err.split('\n').slice(-2).join(' ')}`)
  record(received.includes('redacted') && !received.includes('AKIAIOSFODNN7EXAMPLE'), 'and what reaches the upstream has the secret redacted', received.slice(0, 120))
}

// 4. telling the wrapper to stop ----------------------------------------------
for (const sig of ['SIGTERM', 'SIGINT']) {
  if (!posix) {
    skipped(`run stops its child on ${sig}`, 'NOT PROVEN on Windows: signals there do not reach a child the same way')
    continue
  }
  const box = mkdtempSync(join(tmpdir(), 'contextia-sig-'))
  const pidFile = join(box, 'child.pid')
  const child = `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000)`
  const started = Date.now()
  const r = await cli(['run', '--', process.execPath, '-e', child], {
    ms: 20000,
    onStart: (p) => setTimeout(() => p.kill(sig), 1500),
  })
  await sleep(300)
  const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : 0
  let alive = false
  try {
    process.kill(pid, 0)
    alive = true
    process.kill(pid, 'SIGKILL')
  } catch {
    alive = false
  }
  rmSync(box, { recursive: true, force: true })
  record(pid > 0 && !alive, `run on ${sig}: the child it started is stopped, not left running`, pid ? `child ${pid} ${alive ? 'still alive' : 'gone'}` : 'the child never started')
  record(r.code !== 0 && Date.now() - started < 10000, `run on ${sig} exits non-zero, promptly`, `exit ${r.code} after ${Date.now() - started} ms`)
}

// 5. an upstream that cannot be reached ----------------------------------------
{
  const closed = netServer()
  await new Promise((r) => closed.listen(0, '127.0.0.1', r))
  const deadPort = closed.address().port
  await new Promise((r) => closed.close(r))
  const port = 20000 + Math.floor(Math.random() * 20000)
  const p = spawn(process.execPath, [CLI, 'proxy', '--port', String(port), '--upstream', `http://127.0.0.1:${deadPort}`], { stdio: 'ignore' })
  await waitForPort(port, p)
  const res = await fetch(`http://127.0.0.1:${port}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"messages":[]}' }).catch((e) => ({ status: 0, text: async () => String(e) }))
  const text = await res.text()
  p.kill()
  record(res.status === 502, 'an unreachable upstream is answered with 502', `status ${res.status}`)
  record(text.includes(`127.0.0.1:${deadPort}`) && /ECONNREFUSED/.test(text), 'and the reply names the upstream and why (not just "fetch failed")', text.slice(0, 160))
}

const line = '-'.repeat(70)
console.log(`\n${line}\nProxy and run: operator and agent faults\n${line}`)
for (const [ok, name, detail] of results) {
  console.log(`  ${ok === null ? 'skip' : ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`)
}
const failed = results.filter(([ok]) => ok === false).length
const skips = results.filter(([ok]) => ok === null).length
console.log(failed ? `\n${failed} failed\n` : `\nall ${results.length - skips} passed${skips ? `, ${skips} NOT PROVEN on this platform` : ''}\n`)
process.exit(failed ? 1 : 0)
