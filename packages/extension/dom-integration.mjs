// End-to-end check of the content script against the DOM shapes the supported
// sites actually use.
//
//   npm run test:dom --workspace @sbr0nch/contextia-extension
//
// This loads the built extension into Chromium and drives real composers, which
// is the only way to catch the class of bug it exists for. `getText` used to
// read `textContent`, and because every one of these editors is block-based,
// that concatenated a multi-line prompt into one unbroken run of characters:
// secrets at a block boundary stopped matching and nothing was flagged. The unit
// suite was green throughout, because happy-dom and a hand-built fixture agreed
// with the implementation about what a composer looks like.
//
// Each case asserts against the badge the extension itself renders, so what is
// verified is what a user would see.

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { launchWithExtension } from './browser.mjs'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(here, 'dist')

const AWS = 'AKIAIOSFODNN7EXAMPLE'
const GH = 'ghp_' + 'a'.repeat(36)

const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>chat</title>
<style>body{margin:0;background:#111;color:#eee;font:15px system-ui}
 .box{width:640px;margin:120px auto;padding:12px;border:1px solid #333;border-radius:10px}
 .ProseMirror p, .ql-editor p{margin:.5em 0}</style></head>
<body><div class="box">${body}</div></body></html>`

// Every case holds two secrets split across separate blocks, which is where
// concatenation without a separator destroys the match.
const CASES = [
  {
    name: 'Lexical, paragraphs',
    html: `<div id="prompt-textarea" contenteditable="true"><p>deploy with ${AWS}</p><p>token ${GH}</p></div>`,
    expect: 2,
  },
  {
    name: 'ProseMirror, paragraphs',
    html: `<div class="ProseMirror" contenteditable="true"><p>deploy with ${AWS}</p><p>token ${GH}</p></div>`,
    expect: 2,
  },
  {
    name: 'Quill, paragraphs',
    html: `<div class="ql-editor" contenteditable="true"><p>deploy with ${AWS}</p><p>token ${GH}</p></div>`,
    expect: 2,
  },
  {
    name: 'contenteditable, div blocks',
    html: `<div contenteditable="true">deploy with ${AWS}<div>token ${GH}</div></div>`,
    expect: 2,
  },
  {
    name: 'textarea, newlines',
    html: `<main><textarea style="width:600px;height:80px">deploy with ${AWS}\ntoken ${GH}</textarea></main>`,
    expect: 2,
  },
  {
    name: 'single block, one secret',
    html: `<div class="ProseMirror" contenteditable="true"><p>deploy with ${AWS}</p></div>`,
    expect: 1,
  },
  {
    name: 'clean prompt stays quiet',
    html: `<div class="ProseMirror" contenteditable="true"><p>hello there</p><p>how are you</p></div>`,
    expect: 0,
  },
]

async function badgeCount(pg) {
  // The indicator lives in the page; its count element carries the number the
  // user sees. Empty means nothing flagged.
  return pg.evaluate(() => {
    const walk = (root) => {
      const hit = root.querySelector?.('.cx-count')
      if (hit) return hit.textContent?.trim() ?? ''
      for (const el of root.querySelectorAll?.('*') ?? []) {
        if (el.shadowRoot) {
          const inner = walk(el.shadowRoot)
          if (inner !== null) return inner
        }
      }
      return null
    }
    const found = walk(document)
    return found === null ? null : found === '' ? 0 : Number(found)
  })
}

// Block mode must stop a send that comes right after the secret appears. The
// content script rescans on a 150 ms debounce, so the findings it decided from
// could be stale: measured in Chromium, an Enter pressed 0 to 100 ms after the
// secret landed reached the site, and one at 200 ms did not. Each case types the
// secret, presses Enter after the delay, and asks whether the page saw the Enter.
const RACE_DELAYS = [0, 20, 100]
async function blockRace(ctx, sw) {
  let failed = 0
  await sw.evaluate(() => chrome.storage.local.set({ settings: { mode: 'block' } }))
  try {
    for (const delay of RACE_DELAYS) {
      const pg = await ctx.newPage()
      await pg.route('**/*', (r) =>
        r.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: page(`<form><textarea id="t" style="width:600px;height:80px"></textarea></form>
<script>window.sent=0;document.getElementById('t').addEventListener('keydown',e=>{if(e.key==='Enter')window.sent++})</script>`),
        }),
      )
      await pg.goto('https://claude.ai/', { waitUntil: 'domcontentloaded' })
      await pg.waitForTimeout(700)
      await pg.focus('#t')
      await pg.keyboard.insertText('token ' + GH)
      if (delay) await pg.waitForTimeout(delay)
      await pg.keyboard.press('Enter')
      await pg.waitForTimeout(300)
      const sent = await pg.evaluate(() => window.sent)
      const ok = sent === 0
      if (!ok) failed++
      console.log(`  ${ok ? 'ok  ' : 'FAIL'}  block, Enter ${String(delay).padStart(3)} ms after the secret   reached the site ${sent} time(s)`)
      await pg.close()
    }
  } finally {
    await sw.evaluate(() => chrome.storage.local.remove('settings'))
  }
  return failed
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('build the extension first: npm run build --workspace @sbr0nch/contextia-extension')
    process.exit(1)
  }
  const { ctx, sw, close } = await launchWithExtension(DIST, { viewport: { width: 900, height: 700 } })

  let failed = 0
  try {
    failed += await blockRace(ctx, sw) // first: the service worker is awake right after launch
    for (const c of CASES) {
      const pg = await ctx.newPage()
      await pg.route('**/*', (r) =>
        r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page(c.html) }),
      )
      await pg.goto('https://claude.ai/', { waitUntil: 'domcontentloaded' })
      await pg.waitForTimeout(700)

      // Nudge the composer so the content script scans, the way typing would.
      await pg.evaluate(() => {
        const el = document.querySelector('textarea, [contenteditable="true"]')
        el?.dispatchEvent(new InputEvent('input', { bubbles: true }))
      })
      await pg.waitForTimeout(700)

      const got = await badgeCount(pg)
      const ok = got === c.expect
      if (!ok) failed++
      console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(30)} expected ${c.expect}, flagged ${got}`)
      await pg.close()
    }
  } finally {
    await close()
  }

  console.log(failed ? `\n${failed} case(s) failed\n` : `\nall ${CASES.length + RACE_DELAYS.length} cases passed\n`)
  process.exit(failed ? 1 : 0)
}

await main()
