import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'icons')
await mkdir(outDir, { recursive: true })

const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#16181d"/>
  <path d="M64 18 L102 34 V66 C102 92 84 106 64 112 C44 106 26 92 26 66 V34 Z" fill="none" stroke="#ff4d4f" stroke-width="7"/>
  <circle cx="64" cy="62" r="13" fill="#ff4d4f"/>
</svg>`

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const page = await browser.newPage()
for (const size of [16, 48, 128]) {
  await page.setViewportSize({ width: size, height: size })
  await page.goto('data:image/svg+xml,' + encodeURIComponent(svg(size)))
  await page.screenshot({ path: join(outDir, `icon-${size}.png`), omitBackground: true })
  console.log('icon', size)
}
await browser.close()
