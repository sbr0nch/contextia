// The extension in a real Firefox: installed, its pages opened, a secret typed with real
// key presses into a page it protects, and the result looked at.
//
//   npm run test:firefox --workspace @sbr0nch/contextia-extension
//
// FIREFOX_BIN names the browser (default: `firefox` on the PATH). With none found the check
// says NOT PROVEN and exits 0; set REQUIRE_FIREFOX=1 to make that a failure (CI does).
//
// How it works. Playwright cannot load an extension into Firefox, so the stock browser is
// started with its built-in remote control (Marionette) and the add-on is installed as a
// temporary add-on, which is what `web-ext run` does. The sites the extension protects are
// stood in for by a local HTTPS server: `claude.ai` is mapped to 127.0.0.1 inside this
// Firefox (and nowhere else), direct connections are forced, and the profile accepts the
// server's self-signed certificate, so no test traffic can reach the real site. Match
// patterns ignore the port, so the extension treats the local server as claude.ai.
//
// Popup and settings pages are opened as ordinary tabs (Marionette cannot click the toolbar
// button), so what is seen is their content at tab width, not the toolbar popup frame.
// Pictures go to firefox-out/ (not committed).

import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { createServer as httpsServer } from 'node:https'
import { createServer as netServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marionette } from './marionette.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(process.env.FIREFOX_OUT ?? join(here, 'firefox-out'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const AWS = 'AKIAIOSFODNN7EXAMPLE'
const GH = 'ghp_' + 'aB3dE6gH9jK2mN5pQ8rS1tV4wX7yZ0cF3hL6'
const UUID = '5c2b8d1e-7a40-4f6b-9d33-0e1f2a3b4c5d'
const GECKO_ID = 'contextia@contextia.dev'

function findFirefox() {
  if (process.env.FIREFOX_BIN) return existsSync(process.env.FIREFOX_BIN) ? process.env.FIREFOX_BIN : null
  for (const p of ['/usr/bin/firefox', '/usr/local/bin/firefox', '/snap/bin/firefox', '/Applications/Firefox.app/Contents/MacOS/firefox', '/tmp/ff/firefox/firefox']) if (existsSync(p)) return p
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['firefox'], { encoding: 'utf8' }).split(/\r?\n/)[0]
    return out && existsSync(out) ? out : null
  } catch {
    return null
  }
}

const bin = findFirefox()
if (!bin) {
  console.log('\nNOT PROVEN: no Firefox found (set FIREFOX_BIN). Nothing was run.\n')
  process.exit(process.env.REQUIRE_FIREFOX ? 1 : 0)
}

const freePort = () =>
  new Promise((res) => {
    const s = netServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => res(port))
    })
  })

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>chat</title><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;font:15px system-ui;background:#fff;color:#111"><main style="max-width:640px;margin:40px auto;padding:0 16px"><h1>New chat</h1>
<form id="f"><textarea aria-label="Message" style="width:100%;height:90px"></textarea><p><button type="button" id="send" aria-label="Send message">Send</button></p></form>
<script>window.__sent = 0; document.getElementById('send').addEventListener('click', () => { window.__sent++ })</script>
</main></body></html>`

// a certificate for claude.ai, good for one day, made fresh each run
const certDir = mkdtempSync(join(tmpdir(), 'contextia-ff-cert-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(certDir, 'k.pem'), '-out', join(certDir, 'c.pem'), '-days', '1', '-subj', '/CN=claude.ai', '-addext', 'subjectAltName=DNS:claude.ai'], { stdio: 'ignore' })
const server = httpsServer({ key: readFileSync(join(certDir, 'k.pem')), cert: readFileSync(join(certDir, 'c.pem')) }, (_q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  r.end(PAGE)
})
const sitePort = await freePort()
await new Promise((r) => server.listen(sitePort, '127.0.0.1', r))

mkdirSync(OUT, { recursive: true })
const dist = join(here, 'dist-firefox')
execFileSync(process.execPath, ['build.mjs', '--firefox'], { cwd: here, stdio: 'ignore' })

const profile = mkdtempSync(join(tmpdir(), 'contextia-ff-'))
const mPort = await freePort()
writeFileSync(
  join(profile, 'user.js'),
  [
    ['marionette.port', mPort],
    ['app.update.enabled', false],
    ['browser.shell.checkDefaultBrowser', false],
    ['browser.startup.homepage_override.mstone', 'ignore'],
    ['datareporting.policy.dataSubmissionEnabled', false],
    ['network.dns.localDomains', 'claude.ai'],
    ['network.proxy.type', 0],
    ['network.trr.mode', 5],
    ['extensions.webextensions.uuids', JSON.stringify({ [GECKO_ID]: UUID })],
  ]
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n'),
)
const ff = spawn(bin, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profile], { stdio: 'ignore' })

const results = []
let failed = 0
const check = (ok, name, detail = '') => {
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`)
  if (!ok) failed++
}

let m
for (let i = 0; i < 60 && !m; i++) {
  try {
    const c = new Marionette(mPort)
    await c.connect()
    m = c
  } catch {
    await sleep(500)
  }
}

const run = (script, args = []) => m.send('WebDriver:ExecuteScript', { script, args }).then((r) => r.value)
const shot = async (name) => writeFileSync(join(OUT, `${name}.png`), Buffer.from((await m.send('WebDriver:TakeScreenshot', { full: false })).value, 'base64'))
const text = () => run('return document.body.innerText').then((t) => (t ?? '').replace(/\s+/g, ' ').trim())

async function openExtensionPage(file) {
  const before = await m.send('WebDriver:GetWindowHandles')
  await m.send('Marionette:SetContext', { value: 'chrome' })
  await m.send('WebDriver:ExecuteScript', {
    script: 'gBrowser.selectedTab = gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() })',
    args: [`moz-extension://${UUID}/${file}`],
  })
  await m.send('Marionette:SetContext', { value: 'content' })
  await sleep(1200)
  const after = await m.send('WebDriver:GetWindowHandles')
  const handle = after.find((h) => !before.includes(h))
  await m.send('WebDriver:SwitchToWindow', { handle })
  return handle
}

const hud = (js) =>
  run(`const h = document.getElementById('contextia-hud'); const r = h && h.shadowRoot; if (!r) return null; ${js}`)

async function typeInto(selector, value) {
  const el = await m.send('WebDriver:FindElement', { using: 'css selector', value: selector })
  const id = Object.values(el.value)[0]
  await m.send('WebDriver:ElementClear', { id }).catch(() => {})
  await m.send('WebDriver:ElementSendKeys', { id, text: value })
}

try {
  if (!m) throw new Error('Firefox did not start its remote control in 30 s')
  const session = await m.send('WebDriver:NewSession', { acceptInsecureCerts: true })
  console.log(`Firefox ${session.capabilities.browserVersion} (${bin})`)

  const installed = await m.send('Addon:Install', { path: dist, temporary: true })
  check(installed.value === GECKO_ID, 'the add-on installs as a temporary add-on', installed.value)

  // popup, as a tab
  const home = (await m.send('WebDriver:GetWindowHandles'))[0]
  await openExtensionPage('popup.html')
  await m.send('WebDriver:SetWindowRect', { width: 1000, height: 800 }).catch(() => {})
  const popup = await text()
  check(/Nothing flagged yet/.test(popup), 'the popup page renders', popup.slice(0, 80))
  await shot('popup-empty')

  // settings page: change the mode as a person would, by clicking
  await openExtensionPage('options.html')
  const options = await text()
  check(/Protection/.test(options) && /Detectors/.test(options), 'the settings page renders', options.slice(0, 80))
  const block = await m.send('WebDriver:FindElement', { using: 'css selector', value: '.cx-seg-btn[data-mode="block"]' })
  await m.send('WebDriver:ElementClick', { id: Object.values(block.value)[0] })
  await sleep(400)
  check(/Stop send until resolved/.test(await text()), 'choosing Block shows what it does')
  const bar = await run("return getComputedStyle(document.querySelector('.cx-detlist')).scrollbarColor")
  check(bar !== 'auto', 'settings: the detector list has dark scrollbars (Firefox drew a white track)', bar)
  await shot('options-block')

  // a chat page the extension protects
  await m.send('WebDriver:SwitchToWindow', { handle: home })
  await m.send('WebDriver:Navigate', { url: `https://claude.ai:${sitePort}/` })
  await sleep(1500)
  const where = await run('return location.href')
  check(where.startsWith('https://claude.ai:'), 'the local stand-in answers as claude.ai (no real site was contacted)', where)

  await typeInto('textarea', 'hello, nothing secret here')
  await sleep(900)
  check((await hud("return r.querySelector('.cx-count')?.textContent?.trim() ?? ''")) === '', 'clean text: nothing flagged')

  await typeInto('textarea', `deploy with ${AWS} and ${GH}`)
  await sleep(1300)
  const count = await hud("return r.querySelector('.cx-count')?.textContent?.trim() ?? ''")
  check(count === '2', 'a typed AWS key and a GitHub token are both flagged', `indicator says ${JSON.stringify(count)}`)
  await shot('chat-secrets-found')

  await run("document.getElementById('contextia-hud').shadowRoot.querySelector('.cx-indicator').click()")
  await sleep(500)
  const panel = await hud("return r.querySelector('[role=dialog]')?.innerText ?? ''")
  check(/AWS access key/i.test(panel) && /Redact all/.test(panel), 'the indicator opens a panel naming each secret, with Redact all', String(panel).replace(/\s+/g, ' ').slice(0, 80))
  const tall = await hud("return [...r.querySelectorAll('.cx-head button')].map((b) => Math.round(b.getBoundingClientRect().height))")
  check(Array.isArray(tall) && tall.length >= 2 && tall.every((h) => h < 30), 'panel header: the buttons stay on one line', JSON.stringify(tall))
  await shot('chat-panel-open')

  // Block: a click on Send is stopped, and the person is told
  await run("document.getElementById('contextia-hud').shadowRoot.querySelector('.cx-indicator').click()") // close the panel
  await run("document.getElementById('send').click()")
  await sleep(500)
  check((await run('return window.__sent')) === 0, 'Block: a click on Send with a secret in the box is stopped')
  const alert = await hud("return r.querySelector('[role=alert]')?.innerText ?? ''")
  check(/./.test(alert ?? ''), 'and a message says so (role=alert)', JSON.stringify(alert))
  await shot('chat-send-blocked')

  // Redact all, then Send goes through
  await run("document.getElementById('contextia-hud').shadowRoot.querySelector('.cx-indicator').click()")
  await sleep(300)
  await hud("[...r.querySelectorAll('button')].find((b) => /Redact all/.test(b.textContent)).click()")
  await sleep(900)
  const after = await run("return document.querySelector('textarea').value")
  check(!after.includes(AWS) && !after.includes(GH) && /redacted:aws_access_key_id/.test(after), 'Redact all replaces both secrets in the box', after.slice(0, 80))
  await run("document.getElementById('send').click()")
  await sleep(400)
  check((await run('return window.__sent')) === 1, 'and the redacted text can be sent')
  await shot('chat-after-redact')
} catch (e) {
  check(false, 'the run completed', String(e.message ?? e).slice(0, 200))
} finally {
  try {
    await m.send('Marionette:Quit', { flags: ['eForceQuit'] })
  } catch {
    /* already gone */
  }
  m?.close()
  ff.kill('SIGKILL')
  server.close()
  rmSync(profile, { recursive: true, force: true })
  rmSync(certDir, { recursive: true, force: true })
}

const line = '-'.repeat(70)
console.log(`\n${line}\nThe extension in Firefox\n${line}`)
console.log(results.join('\n'))
console.log(failed ? `\n${failed} of ${results.length} failed (pictures in ${OUT})\n` : `\nall ${results.length} passed (pictures in ${OUT})\n`)
process.exit(failed ? 1 : 0)
