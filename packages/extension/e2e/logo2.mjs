import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const out = process.env.OUT ?? join(here, 'media')
await mkdir(out, { recursive: true })

const defs = `<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00E68F"/><stop offset="1" stop-color="#00A36A"/></linearGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`

// Concept D: terminal prompt ">" + redaction bar (CLI + DLP/secret)
const termbar = `<g filter="url(#glow)">
  <path d="M150 188 L236 256 L150 324" fill="none" stroke="url(#g)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="286" y="232" width="150" height="48" rx="24" fill="url(#g)"/>
</g>`

// Concept E: monospace bracket context holding a masked secret  [ •• ]
const bracket = `<g filter="url(#glow)" fill="none" stroke="url(#g)" stroke-width="38" stroke-linecap="round" stroke-linejoin="round">
  <path d="M196 150 H150 V362 H196"/>
  <path d="M316 150 H362 V362 H316"/>
  </g>
  <g fill="url(#g)" filter="url(#glow)"><circle cx="232" cy="256" r="26"/><circle cx="312" cy="256" r="26"/></g>`

// Concept F: redaction bar forming the cross-bar of a terminal cursor block
const cursor = `<g filter="url(#glow)">
  <rect x="120" y="150" width="210" height="212" rx="20" fill="none" stroke="url(#g)" stroke-width="26"/>
  <rect x="168" y="238" width="240" height="40" rx="20" fill="url(#g)"/>
  </g>`

const concepts = { 'logo-d-termbar': termbar, 'logo-e-bracket': bracket, 'logo-f-cursor': cursor }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [name, mark] of Object.entries(concepts)) {
  const ctx = await browser.newContext({ viewport: { width: 1040, height: 420 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.setContent(`<body style="margin:0;width:1040px;height:420px;display:flex;background:#07090c;font-family:'Inter',system-ui,sans-serif">
    <div style="width:420px;display:flex;align-items:center;justify-content:center">
      <div style="width:260px;height:260px;border-radius:58px;background:#0e1320;border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center">
        <svg width="176" height="176" viewBox="0 0 512 512">${defs}${mark}</svg></div></div>
    <div style="flex:1;display:flex;align-items:center;gap:20px">
      <svg width="76" height="76" viewBox="0 0 512 512">${defs}${mark}</svg>
      <div style="font-weight:800;font-size:54px;color:#fff;letter-spacing:-2px">Contextia</div></div>
  </body>`)
  await page.waitForTimeout(120)
  await page.screenshot({ path: join(out, `${name}.png`) })
  await ctx.close()
}
await browser.close(); console.log('done')
