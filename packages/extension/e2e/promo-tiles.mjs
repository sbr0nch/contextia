import { chromium } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const out = process.env.OUT ?? join(here, 'store')
await mkdir(out, { recursive: true })
const icon = (await readFile(join(here, '..', 'public', 'icons', 'icon-128.png'))).toString('base64')
const iconUrl = `data:image/png;base64,${icon}`

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})

async function tile(name, w, h, opts) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.setContent(`
    <body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;
      background:radial-gradient(130% 130% at 78% 12%, #0f3326 0%, #0a0a0c 58%);
      display:flex;align-items:center;gap:${opts.gap}px;${opts.pad};
      font-family:'Inter',system-ui,sans-serif;color:#fff">
      <img src="${iconUrl}" style="width:${opts.icon}px;height:${opts.icon}px;filter:drop-shadow(0 6px 18px rgba(0,208,132,.45))"/>
      <div>
        <div style="font-weight:800;font-size:${opts.title}px;letter-spacing:-.5px;line-height:1">Contextia</div>
        <div style="margin-top:${opts.gap2}px;font-size:${opts.sub}px;color:#00D084;font-weight:600">Keep secrets out of AI</div>
        ${opts.tagline ? `<div style="margin-top:8px;font-size:${opts.tag}px;color:#aab2ad;max-width:${opts.tw}px">Catch API keys, tokens & credentials before they reach ChatGPT or Claude. Local, on-device, zero network.</div>` : ''}
      </div>
    </body>`)
  await page.waitForTimeout(120)
  await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 92 })
  await ctx.close()
  console.log('tile:', name, `${w}x${h}`)
}

await tile('promo-small-440x280', 440, 280, { gap: 18, gap2: 6, pad: 'flex-direction:column;justify-content:center;text-align:center;padding:24px', icon: 84, title: 34, sub: 15, tagline: false })
await tile('promo-marquee-1400x560', 1400, 560, { gap: 48, gap2: 12, pad: 'padding:0 90px', icon: 220, title: 96, sub: 34, tagline: true, tag: 24, tw: 760 })

await browser.close()
