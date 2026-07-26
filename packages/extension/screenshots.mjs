// Regenerate the store screenshots from the current build.
//
// The previous set was captured by hand once and never again, so it drifted:
// old logo, an older badge, a detector roster from two majors ago. Assets that
// cannot be rebuilt go stale silently, exactly like version numbers do.
//
//   npm run screenshots --workspace @sbr0nch/contextia-extension
//
// Writes 1280x800 JPEGs into docs/store-assets/, the size both stores want.
//
// The demo page is deliberately generic. It is not a copy of any real chat
// product's interface: a store listing that mocks up someone else's UI is
// misleading whatever the intent, and reviewers treat it that way.

import { chromium } from 'playwright'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(here, 'dist')
const OUT = resolve(here, '../../docs/store-assets')
const SIZE = { width: 1280, height: 800 }

// Playwright pins a Chromium build that may not be the one installed. Prefer an
// explicit path when the pinned one is absent.
function executablePath() {
  const pinned = chromium.executablePath()
  if (existsSync(pinned)) return undefined
  for (const p of ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(p)) return p
  }
  return undefined
}

const DEMO = `<!doctype html>
<html><head><meta charset="utf-8"><title>New chat</title><style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body { margin:0; background:#0d0d0f; color:#ececf1;
         font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
         height:100vh; display:flex; flex-direction:column }
  header { padding:16px 24px; border-bottom:1px solid #232327; font-weight:600; font-size:14px; color:#c9c9d1 }
  main { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; padding:0 24px 28px; gap:22px }
  .thread { width:100%; max-width:760px; display:flex; flex-direction:column; gap:18px }
  .turn { max-width:78%; padding:12px 16px; border-radius:14px; font-size:14.5px }
  .turn.you { align-self:flex-end; background:#2a2a31 }
  .turn.bot { align-self:flex-start; background:#17171b; color:#c9c9d1 }
  .composer { width:100%; max-width:760px; display:flex; gap:10px; align-items:flex-end;
              background:#1b1b1f; border:1px solid #2e2e34; border-radius:14px; padding:14px 14px 14px 18px }
  #prompt { flex:1; min-height:26px; outline:none; white-space:pre-wrap; word-break:break-word }
  .send { width:34px; height:34px; flex:0 0 34px; border-radius:9px; border:0; background:#ececf1;
          color:#0d0d0f; font-size:16px; cursor:pointer }
</style></head>
<body>
  <header>New chat</header>
  <main>
    <div class="thread">
      <div class="turn you">Can you review this deploy script and tell me what is wrong with it?</div>
      <div class="turn bot">Happy to. Paste the script and any config it reads, and I will walk through it.</div>
    </div>
    <div class="composer">
      <div id="prompt" contenteditable="true" role="textbox" aria-label="Message"></div>
      <button class="send" aria-label="Send">&#8593;</button>
    </div>
  </main>
</body></html>`

const SAMPLE =
  'Deploy creds: AKIAIOSFODNN7EXAMPLE plus token ghp_' + 'a'.repeat(36)

async function type(page, text) {
  const el = page.locator('#prompt')
  await el.click()
  await el.evaluate((n, t) => {
    n.textContent = t
    n.dispatchEvent(new InputEvent('input', { bubbles: true }))
  }, text)
  await page.waitForTimeout(600) // the content script debounces input by 150ms
}

async function shot(page, name, caption) {
  await mkdir(OUT, { recursive: true })
  await page.screenshot({ path: join(OUT, name), type: 'jpeg', quality: 92 })
  console.log(`  ${name.padEnd(28)} ${caption}`)
}

/**
 * The popup is about 320px wide and the options page not much more. Screenshot
 * either at 1280x800 and you get a small panel stranded on a black field, which
 * reads as a broken page rather than a deliberate one. Capture the content at
 * its own size and compose it centred, with room around it.
 */
async function framed(ctx, url, name, caption) {
  const page = await ctx.newPage()
  await page.goto(url)
  await page.waitForTimeout(700)
  const box = await page.evaluate(() => {
    const b = document.body
    return { w: Math.ceil(Math.max(b.scrollWidth, 360)), h: Math.ceil(Math.max(b.scrollHeight, 200)) }
  })
  await page.setViewportSize({ width: box.w, height: box.h })
  await page.waitForTimeout(250)
  const panel = (await page.screenshot({ type: 'png' })).toString('base64')
  await page.close()

  const canvas = await ctx.newPage()
  await canvas.setViewportSize(SIZE)
  await canvas.setContent(`<style>
    html,body{margin:0;height:100%;background:#0d0d0f}
    body{display:flex;align-items:center;justify-content:center}
    img{max-width:76%;max-height:82%;border-radius:12px;
        box-shadow:0 24px 70px rgba(0,0,0,.65), 0 0 0 1px #26262c}
  </style><img src="data:image/png;base64,${panel}">`)
  await canvas.waitForTimeout(400)
  await shot(canvas, name, caption)
  await canvas.close()
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('contextia: build the extension first (npm run build --workspace @sbr0nch/contextia-extension)')
    process.exit(1)
  }

  const profile = await mkdtemp(join(tmpdir(), 'contextia-shots-'))
  const demoFile = join(profile, 'demo.html')
  await writeFile(demoFile, DEMO, 'utf8')

  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: SIZE,
    executablePath: executablePath(),
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-sandbox',
      '--hide-scrollbars',
    ],
  })

  try {
    // The extension only runs on its declared hosts, so route one of them to the
    // local demo page rather than loading a real chat product.
    const page = await ctx.newPage()
    await page.route('**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: DEMO }),
    )
    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)

    console.log('contextia: capturing')

    await type(page, SAMPLE)
    await shot(page, '1-detected.jpg', 'findings underlined in the composer')

    const mark = page.locator('.cx-underline, [data-cx-finding], mark').first()
    if (await mark.count()) {
      await mark.hover().catch(() => {})
      await page.waitForTimeout(500)
    }
    await shot(page, '2-review.jpg', 'the popover for a single finding')

    // Redaction through the extension's own path, so the shot shows real output.
    const redact = page.getByRole('button', { name: /redact/i }).first()
    if (await redact.count()) {
      await redact.click().catch(() => {})
      await page.waitForTimeout(700)
    }
    await shot(page, '3-redacted.jpg', 'the prompt after redacting')

    const id = ctx
      .serviceWorkers()
      .map((w) => new URL(w.url()).host)
      .find(Boolean)

    if (id) {
      await framed(ctx, `chrome-extension://${id}/popup.html`, '4-popup.jpg', 'stats and recent detections')
      await framed(ctx, `chrome-extension://${id}/options.html`, '5-settings.jpg', 'modes, detectors, lists')
    } else {
      console.error('contextia: no service worker found, skipped the popup and options shots')
    }
  } finally {
    await ctx.close()
    await rm(profile, { recursive: true, force: true })
  }
  console.log(`contextia: written to ${OUT}`)
}

await main()
