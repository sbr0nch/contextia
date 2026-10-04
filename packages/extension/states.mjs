// Every screen the extension has, in its states, at the widths people use it at, in a
// real browser. For each: no uncaught error, something readable on the page, no
// horizontal scroll, and a picture saved for a person to look at.
//
//   npm run test:states --workspace @sbr0nch/contextia-extension
//   node states.mjs --update     # re-approve the fingerprints after a change you meant
//
// Pictures go to the folder in STATES_OUT (default: states-out/, not committed). The
// fingerprints of the approved pictures (a 64-bit difference hash of each) are in
// visual-baseline.json: a page that changes by accident moves its hash, and the check
// says which screen. A fingerprint cannot say the change is bad, only that it is a change.
//
// "API in error": the browser's storage answering with a failure, which is what a full
// or blocked profile does. Before this check existed, the popup showed a spinner forever
// and the settings page a blank page with an uncaught error.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchWithExtension } from './browser.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(here, 'dist')
const OUT = resolve(process.env.STATES_OUT ?? join(here, 'states-out'))
const BASELINE = join(here, 'visual-baseline.json')
const UPDATE = process.argv.includes('--update')
const TOLERANCE = 10 // bits of 64 that may differ: antialiasing, not layout
mkdirSync(OUT, { recursive: true })

const AWS = 'AKIAIOSFODNN7EXAMPLE'
const GH = 'ghp_' + 'aB3dE6gH9jK2mN5pQ8rS1tV4wX7yZ0cF3hL6'
const failStorage = () => {
  chrome.storage.local.get = () => Promise.reject(new Error('storage unavailable'))
}

const { ctx, sw, close } = await launchWithExtension(DIST)
const id = new URL(sw.url()).host
const results = []
const fingerprints = {}
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
let failed = 0

/** 64-bit difference hash of a PNG, computed in the browser: 9x8 greyscale, bit = left brighter than right. */
async function dhash(png) {
  const pg = await ctx.newPage()
  const hex = await pg.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 9
    c.height = 8
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0, 9, 8)
    const d = g.getImageData(0, 0, 9, 8).data
    let bits = ''
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const a = d[(y * 9 + x) * 4] * 0.3 + d[(y * 9 + x) * 4 + 1] * 0.6 + d[(y * 9 + x) * 4 + 2] * 0.1
      const b = d[(y * 9 + x + 1) * 4] * 0.3 + d[(y * 9 + x + 1) * 4 + 1] * 0.6 + d[(y * 9 + x + 1) * 4 + 2] * 0.1
      bits += a > b ? '1' : '0'
    }
    return bits.match(/.{4}/g).map((n) => parseInt(n, 2).toString(16)).join('')
  }, png.toString('base64'))
  await pg.close()
  return hex
}
const hamming = (a, b) => [...a].reduce((n, ch, i) => n + (parseInt(ch, 16) ^ parseInt(b[i], 16)).toString(2).replace(/0/g, '').length, 0)

async function capture(name, pg, { expect, minText = 8 } = {}) {
  const problems = []
  const errors = pg.__errors ?? []
  await pg.waitForTimeout(350)
  if (errors.length) problems.push(`uncaught error: ${errors[0]}`)
  const text = (await pg.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  if (text.length < minText && !expect) problems.push(`nothing readable on the page (${JSON.stringify(text)})`)
  if (expect && !expect.test(text)) problems.push(`expected text ${expect} not found; page says ${JSON.stringify(text.slice(0, 100))}`)
  const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 1) problems.push(`scrolls sideways by ${overflow}px`)
  const png = await pg.screenshot({ fullPage: false })
  writeFileSync(join(OUT, `${name}.png`), png)
  const h = await dhash(png)
  fingerprints[name] = h
  if (!UPDATE && baseline[name] !== undefined) {
    const d = hamming(h, baseline[name])
    if (d > TOLERANCE) problems.push(`looks different from the approved picture (${d} of 64 bits; allowed ${TOLERANCE})`)
  } else if (!UPDATE) {
    problems.push('no approved fingerprint yet: run with --update, then look at the picture')
  }
  const ok = problems.length === 0
  if (!ok) failed++
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${problems.map((p) => `\n          ${p}`).join('')}`)
}

async function extPage(file, width, height, { fail = false } = {}) {
  const pg = await ctx.newPage()
  pg.__errors = []
  pg.on('pageerror', (e) => pg.__errors.push(e.message))
  await pg.setViewportSize({ width, height })
  if (fail) await pg.addInitScript(failStorage)
  await pg.goto(`chrome-extension://${id}/${file}`)
  return pg
}

try {
  const set = (settings) => sw.evaluate((s) => chrome.storage.local.set({ settings: s }), settings)
  const reset = () => sw.evaluate(() => chrome.storage.local.clear())

  // popup (a toolbar popup is narrow)
  await reset()
  let pg = await extPage('popup.html', 360, 480)
  await capture('popup-empty-360', pg, { expect: /Nothing flagged yet/ })
  await pg.close()

  await sw.evaluate(() => chrome.storage.local.set({
    stats: { caught: 12, redacted: 9, leaked: 1, allowed: 2 },
    log: [
      { ts: Date.now() - 20_000, site: 'claude.ai', type: 'aws_access_key_id', severity: 'critical', action: 'blocked' },
      { ts: Date.now() - 3_600_000, site: 'chatgpt.com', type: 'github_token', severity: 'critical', action: 'redacted' },
      { ts: Date.now() - 90_000_000, site: 'gemini.google.com', type: 'email', severity: 'warning', action: 'flagged' },
    ],
  }))
  pg = await extPage('popup.html', 360, 480)
  await capture('popup-with-activity-360', pg, { expect: /12 secrets caught/ })
  await pg.close()

  pg = await extPage('popup.html', 360, 480, { fail: true })
  await capture('popup-storage-error-360', pg, { expect: /could not read/i })
  await pg.close()

  // settings page
  await reset()
  for (const w of [390, 768, 1280]) {
    pg = await extPage('options.html', w, 900)
    await capture(`options-default-${w}`, pg, { expect: /Protection/ })
    await pg.close()
  }
  pg = await extPage('options.html', 768, 900)
  await pg.getByPlaceholder(/search/i).first().fill('aws').catch(() => {})
  await capture('options-detector-search-768', pg, { expect: /AWS/i })
  await pg.close()
  pg = await extPage('options.html', 768, 900, { fail: true })
  await capture('options-storage-error-768', pg, { expect: /could not read/i })
  await pg.close()

  // in the chat page
  await set({ mode: 'block' })
  for (const [w, h] of [[390, 700], [1280, 720]]) {
    const open = async (text, { click = false, press = false } = {}) => {
      const p = await ctx.newPage()
      p.__errors = []
      p.on('pageerror', (e) => p.__errors.push(e.message))
      await p.setViewportSize({ width: w, height: h })
      await p.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="en"><head><title>chat</title><meta name="viewport" content="width=device-width"></head><body style="margin:0;font:15px system-ui;background:#fff;color:#111"><main style="max-width:640px;margin:40px auto;padding:0 16px"><h1>New chat</h1><textarea aria-label="Message" style="width:100%;height:90px"></textarea></main></body></html>' }))
      await p.goto('https://claude.ai/', { waitUntil: 'domcontentloaded' })
      await p.waitForTimeout(500)
      if (text) {
        await p.focus('textarea')
        await p.keyboard.insertText(text)
        await p.waitForTimeout(500)
      }
      if (click) await p.locator('.cx-indicator').first().click()
      if (press) await p.keyboard.press('Enter')
      return p
    }
    pg = await open('')
    await capture(`chat-clean-${w}`, pg, { expect: /New chat/ })
    await pg.close()
    pg = await open(`deploy with ${AWS} and ${GH}`)
    await capture(`chat-secrets-found-${w}`, pg, { expect: /New chat/ })
    await pg.close()
    pg = await open(`deploy with ${AWS} and ${GH}`, { click: true })
    await capture(`chat-secrets-panel-open-${w}`, pg, { expect: /New chat/ })
    await pg.close()
    pg = await open(`deploy with ${AWS}`, { press: true })
    await capture(`chat-send-blocked-${w}`, pg, { expect: /New chat/ })
    await pg.close()
    pg = await open('x '.repeat(600_000))
    await capture(`chat-too-long-${w}`, pg, { expect: /New chat/ })
    await pg.close()
  }
} finally {
  await sw.evaluate(() => chrome.storage.local.clear()).catch(() => {})
  await close()
}

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify(fingerprints, null, 2) + '\n')
  console.log(`wrote ${Object.keys(fingerprints).length} fingerprints to visual-baseline.json: look at ${OUT} before committing them`)
}
const line = '-'.repeat(70)
console.log(`\n${line}\nScreens and states\n${line}`)
console.log(results.join('\n'))
console.log(failed ? `\n${failed} of ${results.length} failed (pictures in ${OUT})\n` : `\nall ${results.length} screens passed (pictures in ${OUT})\n`)
process.exit(failed ? 1 : 0)
