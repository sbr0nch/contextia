import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'icons')
await mkdir(outDir, { recursive: true })

// Brand mark: a green sparkle (echoing contextia.dev) on near-black.
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#1a1a1a"/>
  <path d="M64 16 C67 47 81 61 112 64 C81 67 67 81 64 112 C61 81 47 67 16 64 C47 61 61 47 64 16 Z" fill="#00D084"/>
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
