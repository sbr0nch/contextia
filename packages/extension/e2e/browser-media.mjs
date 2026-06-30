// Animated browser/UI media: a realistic prompt is pasted into an AI chat
// composer, Contextia flags the secrets, the user opens the popover and redacts.
// Frames are captured here; encode-gif turns them into a GIF.
import { chromium } from 'playwright'
import { readFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const out = process.env.OUT ?? join(here, 'media')
await mkdir(out, { recursive: true })

const shim = await readFile(join(here, 'shim.js'), 'utf8')
const contentJs = await readFile(join(dist, 'content.js'), 'utf8')
const mockUrl = 'file://' + join(here, 'mock-composer.html')

// A realistic paste: a dev asking for help and accidentally including a token and
// a DB connection string in the snippet — exactly what AI-DLP is for.
const PROMPT =
  "My deploy keeps failing on auth, can you spot the bug?\n\n" +
  "  curl -H 'Authorization: Bearer ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \\\n" +
  "       https://deploy.internal/run\n" +
  "  # db: postgres://admin:s3cr3t@db.prod:5432/app"

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 1120, height: 720 }, deviceScaleFactor: 1 })

const external = []
await ctx.route('**/*', (route) => {
  const url = route.request().url()
  if (!/^(file|data|about|blob):/.test(url)) external.push(url)
  route.continue()
})

const page = await ctx.newPage()
await page.addInitScript(shim)
await page.goto(mockUrl)
await page.evaluate(contentJs)

const framesDir = join(out, '_frames_browser')
await rm(framesDir, { recursive: true, force: true })
await mkdir(framesDir, { recursive: true })
let f = 0
const frame = async () => page.screenshot({ path: join(framesDir, `f${String(f++).padStart(4, '0')}.png`) })
const hold = async (n) => { for (let i = 0; i < n; i++) { await page.waitForTimeout(55); await frame() } }

const hud = (sel) =>
  page.evaluate((s) => document.getElementById('contextia-hud').shadowRoot.querySelector(s)?.click(), sel)

// 1. empty composer
await hold(6)
// 2. paste the prompt → detection appears (debounce + transition)
await page.evaluate((text) => {
  const c = document.getElementById('composer')
  c.focus(); c.textContent = text
  c.dispatchEvent(new InputEvent('input', { bubbles: true }))
}, PROMPT)
await hold(12)
// 3. open the popover
await hud('.cx-indicator')
await hold(16)
// 4. redact all → secrets replaced in place
await hud('.cx-go')
await hold(20)

// a clean static of the popover state, full frame
await hud('.cx-indicator')
await page.evaluate((text) => {
  const c = document.getElementById('composer')
  c.textContent = text
  c.dispatchEvent(new InputEvent('input', { bubbles: true }))
}, PROMPT)
await page.waitForTimeout(350)
await hud('.cx-indicator')
await page.waitForTimeout(200)
await page.screenshot({ path: join(out, 'ui-detect.png') })

await browser.close()
console.log('browser frames:', f, '→', framesDir)
console.log('external requests attempted:', external.length, external)
if (external.length > 0) { console.error('FAIL: network requests'); process.exit(1) }
