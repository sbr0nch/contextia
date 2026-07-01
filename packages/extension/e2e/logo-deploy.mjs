import { chromium } from 'playwright'
import { readFile, writeFile, copyFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const brand = join(repo, 'docs', 'brand')
const icons = join(repo, 'packages', 'extension', 'public', 'icons')
const storeAssets = join(repo, 'docs', 'store-assets')
const src = join(brand, 'same-logo--but-replace-the-center-spark-with-two-s.svg')
const srcPng = join(brand, 'same-logo--but-replace-the-center-spark-with-two-s.png')
const svg = await readFile(src, 'utf8')
const green = [...svg.matchAll(/<path fill="#11D4AB"[^>]*\/>/g)].map((m) => m[0]).join('')

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

// tight recentred viewBox around the mark
const probe = await (await browser.newContext()).newPage()
await probe.setContent(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g id="m">${green}</g></svg>`)
const vb = await probe.evaluate(() => {
  const b = document.getElementById('m').getBBox(), s = Math.max(b.width, b.height)
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2, pad = s * 0.16, side = s + pad * 2
  return { x: cx - side / 2, y: cy - side / 2, side }
})
await probe.close()
const box = `${vb.x} ${vb.y} ${vb.side} ${vb.side}`
const markTag = (px, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${vb.x - (vb.side * (1 / scale - 1)) / 2} ${vb.y - (vb.side * (1 / scale - 1)) / 2} ${vb.side / scale} ${vb.side / scale}"><g>${green}</g></svg>`

// clean vector mark (transparent)
await writeFile(join(brand, 'contextia-mark.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${box}"><g>${green}</g></svg>`)

async function render(path, html, w, h, transparent) {
  const p = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage()
  await p.setContent(html); await p.waitForTimeout(60)
  await p.screenshot({ path, omitBackground: !!transparent, clip: { x: 0, y: 0, width: w, height: h } })
  await p.close()
}
// dark rounded badge holding the mark; radius/mark scale tuned per size
const badge = (px) => {
  const r = Math.round(px * 0.22), m = Math.round(px * 0.6)
  return `<body style="margin:0;width:${px}px;height:${px}px"><div style="width:${px}px;height:${px}px;border-radius:${r}px;background:#161719;display:flex;align-items:center;justify-content:center">${markTag(m)}</div></body>`
}
const transparentMark = (px, fill = m => m) => `<body style="margin:0;width:${px}px;height:${px}px;display:flex;align-items:center;justify-content:center">${markTag(px)}</body>`

// extension + store icons (dark badge)
for (const s of [16, 48, 128]) {
  await render(join(icons, `icon-${s}.png`), badge(s), s, s, false)
  await render(join(brand, `icon-${s}.png`), badge(s), s, s, false)
}
// favicons
await render(join(brand, 'favicon-32.png'), badge(32), 32, 32, false)
await render(join(brand, 'favicon.png'), badge(48), 48, 48, false)
// transparent mark PNG
await render(join(brand, 'contextia-mark.png'), transparentMark(512), 512, 512, true)
// store icon 512 badge
await render(join(brand, 'contextia-icon-512.png'), badge(512), 512, 512, false)

// full logo lockup: keep the source as clean names
await copyFile(src, join(brand, 'contextia-logo.svg'))
await copyFile(srcPng, join(brand, 'contextia-logo.png'))

// social preview 1280x640 with the real mark + wordmark
await render(join(storeAssets, 'social-preview-1280x640.png'),
  `<body style="margin:0;width:1280px;height:640px;background:radial-gradient(120% 120% at 50% 0%, #103a2b 0%, #070708 62%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;font-family:system-ui">
     ${markTag(200)}
     <div style="font-weight:800;font-size:92px;color:#fff;letter-spacing:-2px">Contextia</div>
     <div style="font-size:26px;color:#00E68F;font-weight:600">Keep secrets out of AI</div>
     <div style="font-size:17px;color:#7c8a82">CLI · AI-DLP proxy · browser extension · MIT</div>
   </body>`, 1280, 640, false)

// animated loading spinner (brand: the two masked dots pulsing)
await writeFile(join(brand, 'contextia-spinner.svg'),
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Loading">
  <g fill="none" stroke="#11D4AB" stroke-width="11" stroke-linecap="round">
    <path d="M40 30 C24 30 24 42 24 60 C24 78 24 90 40 90"/>
    <path d="M80 30 C96 30 96 42 96 60 C96 78 96 90 80 90"/>
  </g>
  <circle cx="50" cy="60" r="7" fill="#11D4AB"><animate attributeName="opacity" values="1;.2;1" dur="1.1s" repeatCount="indefinite"/></circle>
  <circle cx="70" cy="60" r="7" fill="#11D4AB"><animate attributeName="opacity" values="1;.2;1" dur="1.1s" begin="0.55s" repeatCount="indefinite"/></circle>
</svg>`)

// drop the ugly originals and previews
await rm(src, { force: true }); await rm(srcPng, { force: true })
await rm(join(brand, '_preview-transparent.png'), { force: true }); await rm(join(brand, '_preview-badge.png'), { force: true })

await browser.close()
console.log('deployed brand assets')
