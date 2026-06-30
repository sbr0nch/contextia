import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const out = process.env.OUT ?? join(here, 'media')
await mkdir(out, { recursive: true })

const defs = `<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#00E68F"/><stop offset="1" stop-color="#00A36A"/>
  </linearGradient>
  <filter id="glow"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`

// Concept A: refined 4-point sparkle (current identity)
const sparkle = `<path filter="url(#glow)" fill="url(#g)" d="M256 56 C292 196 316 220 456 256 C316 292 292 316 256 456 C220 316 196 292 56 256 C196 220 220 196 256 56 Z"/>`

// Concept B: shield guarding a sparkle (protection)
const shield = `<path fill="none" stroke="url(#g)" stroke-width="26" stroke-linejoin="round" d="M256 70 L430 138 V270 C430 366 354 426 256 456 C158 426 82 366 82 270 V138 Z"/>
  <path filter="url(#glow)" fill="url(#g)" d="M256 158 C278 244 286 252 372 274 C286 296 278 304 256 390 C234 304 226 296 140 274 C226 252 234 244 256 158 Z"/>`

// Concept C: aperture "C" ring with a redaction gap (catch + redact)
const aperture = `<circle cx="256" cy="256" r="150" fill="none" stroke="url(#g)" stroke-width="60" stroke-linecap="round" stroke-dasharray="640 300" transform="rotate(36 256 256)"/>
  <circle cx="256" cy="256" r="34" fill="url(#g)" filter="url(#glow)"/>`

const concepts = { 'logo-a-sparkle': sparkle, 'logo-b-shield': shield, 'logo-c-aperture': aperture }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

for (const [name, mark] of Object.entries(concepts)) {
  const ctx = await browser.newContext({ viewport: { width: 1040, height: 520 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  // left: badge on dark; right: wordmark lockup
  await page.setContent(`<body style="margin:0;width:1040px;height:520px;display:flex;background:#07090c;font-family:'Inter',system-ui,sans-serif">
    <div style="width:520px;display:flex;align-items:center;justify-content:center">
      <div style="width:300px;height:300px;border-radius:64px;background:#0e1320;border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;box-shadow:0 30px 70px rgba(0,0,0,.5)">
        <svg width="200" height="200" viewBox="0 0 512 512">${defs}${mark}</svg>
      </div>
    </div>
    <div style="flex:1;display:flex;align-items:center;gap:22px">
      <svg width="84" height="84" viewBox="0 0 512 512">${defs}${mark}</svg>
      <div style="font-weight:800;font-size:60px;color:#fff;letter-spacing:-2px">Contextia</div>
    </div>
  </body>`)
  await page.waitForTimeout(120)
  await page.screenshot({ path: join(out, `${name}.png`) })
  await ctx.close()
}
await browser.close()
console.log('logo concepts written')
