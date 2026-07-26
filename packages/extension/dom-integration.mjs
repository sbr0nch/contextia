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

import { chromium } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(here, 'dist')

function executablePath() {
  const pinned = chromium.executablePath()
  if (existsSync(pinned)) return undefined
  for (const p of ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(p)) return p
  }
  return undefined
}

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

async function main() {
  if (!existsSync(DIST)) {
    console.error('build the extension first: npm run build --workspace @sbr0nch/contextia-extension')
    process.exit(1)
  }
  const profile = await mkdtemp(join(tmpdir(), 'contextia-dom-'))
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 900, height: 700 },
    executablePath: executablePath(),
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-sandbox'],
  })

  let failed = 0
  try {
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
    await ctx.close()
    await rm(profile, { recursive: true, force: true })
  }

  console.log(failed ? `\n${failed} case(s) failed\n` : `\nall ${CASES.length} cases passed\n`)
  process.exit(failed ? 1 : 0)
}

await main()
