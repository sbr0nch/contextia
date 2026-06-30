import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const out = process.env.OUT ?? join(here, 'shots')
await mkdir(out, { recursive: true })

const shim = await readFile(join(here, 'shim.js'), 'utf8')
const contentJs = await readFile(join(dist, 'content.js'), 'utf8')
const mockUrl = 'file://' + join(here, 'mock-composer.html')

const SECRET_LINE = 'Deploy creds: AKIAIOSFODNN7EXAMPLE plus token ghp_' + 'a'.repeat(36)

// Use the Chromium pre-installed in this image rather than downloading one.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const context = await browser.newContext({ viewport: { width: 900, height: 600 } })

// Zero-network guard: record any non-local request the code attempts.
const external = []
await context.route('**/*', (route) => {
  const url = route.request().url()
  if (!/^(file|data|about|blob):/.test(url)) external.push(url)
  route.continue()
})

async function shot(page, name) {
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log('shot:', name)
}

// --- Content script: neutral -> alert -> popover -> redacted ---
const page = await context.newPage()
await page.addInitScript(shim)
await page.goto(mockUrl)
await page.evaluate(contentJs)
await page.waitForTimeout(300)
await shot(page, '1-neutral')

await page.evaluate((text) => {
  const c = document.getElementById('composer')
  c.focus()
  c.textContent = text
  c.dispatchEvent(new InputEvent('input', { bubbles: true }))
}, SECRET_LINE)
await page.waitForTimeout(450)
await shot(page, '2-alert')

await page.evaluate(() =>
  document.getElementById('contextia-hud').shadowRoot.querySelector('.cx-indicator').click(),
)
await page.waitForTimeout(150)
await shot(page, '3-popover')

await page.evaluate(() =>
  document.getElementById('contextia-hud').shadowRoot.querySelector('.cx-go').click(),
)
await page.waitForTimeout(450)
await shot(page, '4-redacted')

const composerText = await page.evaluate(() => document.getElementById('composer').textContent)
console.log('composer after redact:', composerText)

// --- Popup (seeded) ---
const seed = `globalThis.__cxStore = ${JSON.stringify({
  stats: { caught: 7, redacted: 5, leaked: 0 },
  log: [
    { ts: Date.now() - 60000, site: 'chatgpt.com', type: 'aws_access_key_id', severity: 'critical', action: 'redacted' },
    { ts: Date.now() - 200000, site: 'claude.ai', type: 'github_token', severity: 'critical', action: 'flagged' },
  ],
})}`

const popup = await context.newPage()
await popup.setViewportSize({ width: 320, height: 360 })
await popup.addInitScript(seed)
await popup.addInitScript(shim)
await popup.goto('file://' + join(dist, 'popup.html'))
await popup.waitForTimeout(200)
await shot(popup, '5-popup')

// --- Options (seeded) ---
const options = await context.newPage()
await options.setViewportSize({ width: 760, height: 900 })
await options.addInitScript(seed)
await options.addInitScript(shim)
await options.goto('file://' + join(dist, 'options.html'))
await options.waitForTimeout(200)
await shot(options, '6-options')

await browser.close()

console.log('external requests attempted:', external.length, external)
if (external.length > 0) {
  console.error('FAIL: extension code attempted network requests')
  process.exit(1)
}
console.log('OK: zero network requests')
