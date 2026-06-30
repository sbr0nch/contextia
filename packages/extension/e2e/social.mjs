import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const out = process.env.OUT ?? join(here, 'media')
await mkdir(out, { recursive: true })
const icon = (await readFile(join(here, '..', 'public', 'icons', 'icon-128.png'))).toString('base64')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.setContent(`<body style="margin:0;width:1280px;height:640px;overflow:hidden;
  background:radial-gradient(120% 120% at 50% 0%, #103a2b 0%, #070708 62%);
  font-family:'Inter',system-ui,sans-serif;color:#fff;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;text-align:center">
  <div style="display:flex;align-items:center;gap:30px">
    <img src="data:image/png;base64,${icon}" style="width:128px;height:128px;filter:drop-shadow(0 8px 26px rgba(0,208,132,.5))"/>
    <div style="font-weight:800;font-size:104px;letter-spacing:-2px;line-height:1">Contextia</div>
  </div>
  <div style="font-size:34px;font-weight:700;color:#00D084">Keep secrets out of AI</div>
  <div style="font-size:22px;color:#aeb4ae;max-width:840px;line-height:1.5">
    Catch API keys, tokens &amp; credentials before they reach an AI assistant — in your terminal and your browser. On-device, zero network.</div>
  <div style="margin-top:6px;font-size:16px;color:#5f6b63;letter-spacing:.5px">CLI · AI-DLP proxy · browser extension · MIT · open source</div>
</body>`)
await page.waitForTimeout(150)
await page.screenshot({ path: join(out, 'social-preview-1280x640.png') })
await browser.close()
console.log('wrote social-preview-1280x640.png')
