// Chrome Web Store-compliant assets: screenshots are exactly 1280x800 and saved
// as JPEG (no alpha channel), which is what the console requires.
import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const out = process.env.OUT ?? join(here, 'store')
await mkdir(out, { recursive: true })

const shim = await readFile(join(here, 'shim.js'), 'utf8')
const contentJs = await readFile(join(dist, 'content.js'), 'utf8')
const mockUrl = 'file://' + join(here, 'mock-composer.html')
const SECRET_LINE = 'Deploy creds: AKIAIOSFODNN7EXAMPLE plus token ghp_' + 'a'.repeat(36)

const seed = `globalThis.__cxStore = ${JSON.stringify({
  stats: { caught: 23, redacted: 18, leaked: 0, allowed: 4 },
  log: [
    { ts: Date.now() - 60000, site: 'chatgpt.com', type: 'aws_access_key_id', severity: 'critical', action: 'redacted' },
    { ts: Date.now() - 200000, site: 'claude.ai', type: 'github_token', severity: 'critical', action: 'flagged' },
    { ts: Date.now() - 480000, site: 'chatgpt.com', type: 'anthropic_key', severity: 'critical', action: 'blocked' },
    { ts: Date.now() - 900000, site: 'claude.ai', type: 'email', severity: 'warning', action: 'allowed' },
    { ts: Date.now() - 1500000, site: 'chatgpt.com', type: 'credit_card', severity: 'warning', action: 'redacted' },
  ],
})}`

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
// deviceScaleFactor: 1 so the captured frame is exactly 1280x800 (not 2x).
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })

const external = []
await context.route('**/*', (route) => {
  const url = route.request().url()
  if (!/^(file|data|about|blob):/.test(url)) external.push(url)
  route.continue()
})

const save = (page, name, clip) =>
  page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 92, ...(clip ? { clip } : {}) })

// --- Composer: alert -> popover -> redacted (each fills 1280x800) ---
const page = await context.newPage()
await page.addInitScript(shim)
await page.goto(mockUrl)
await page.evaluate(contentJs)
await page.evaluate((text) => {
  const c = document.getElementById('composer')
  c.focus()
  c.textContent = text
  c.dispatchEvent(new InputEvent('input', { bubbles: true }))
}, SECRET_LINE)
await page.waitForTimeout(450)
await save(page, '1-detected')

await page.evaluate(() =>
  document.getElementById('contextia-hud').shadowRoot.querySelector('.cx-indicator').click(),
)
await page.waitForTimeout(180)
await save(page, '2-review')

await page.evaluate(() =>
  document.getElementById('contextia-hud').shadowRoot.querySelector('.cx-go').click(),
)
await page.waitForTimeout(450)
await save(page, '3-redacted')

// --- Popup & options framed on a 1280x800 branded canvas ---
async function framed(name, innerUrl, w, h) {
  const inner = await context.newPage()
  await inner.setViewportSize({ width: w, height: h })
  await inner.addInitScript(seed)
  await inner.addInitScript(shim)
  await inner.goto(innerUrl)
  await inner.waitForTimeout(250)
  const png = await inner.screenshot({ type: 'png' })
  await inner.close()

  const frame = await context.newPage()
  const dataUrl = 'data:image/png;base64,' + png.toString('base64')
  await frame.setContent(
    `<body style="margin:0;width:1280px;height:800px;background:radial-gradient(120% 120% at 70% 10%, #0f2a20 0%, #08080a 60%);display:flex;align-items:center;justify-content:center;font-family:system-ui">
       <img src="${dataUrl}" style="max-width:86%;max-height:86%;border-radius:16px;box-shadow:0 40px 90px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.06)"/>
     </body>`,
  )
  await frame.waitForTimeout(120)
  await save(frame, name)
  await frame.close()
}

await framed('4-popup', 'file://' + join(dist, 'popup.html'), 320, 560)
await framed('5-settings', 'file://' + join(dist, 'options.html'), 720, 720)

await browser.close()

console.log('external requests attempted:', external.length, external)
if (external.length > 0) {
  console.error('FAIL: extension code attempted network requests')
  process.exit(1)
}
console.log('OK: 1280x800 JPEG store shots written to', out)
