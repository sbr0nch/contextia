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

// A page can hold more than one editor: the chat composer, and the box that opens when a
// sent message is edited. The handlers decided from the first visible composer, so a send
// from the second one was judged on the first one's (empty) text and went through.
const TWO_EDITORS = [
  { name: 'Enter in the edit box, which holds the secret', press: '#edit', secretIn: '#edit', expectSent: 0 },
  { name: 'click on the edit box\'s own send button', click: '#edit-send', secretIn: '#edit', expectSent: 0 },
  { name: 'Enter in the main composer, which holds the secret', press: '#prompt-textarea', secretIn: '#prompt-textarea', expectSent: 0 },
  { name: 'Enter in the edit box when only the main composer holds a secret', press: '#edit', secretIn: '#prompt-textarea', expectSent: 1 },
  { name: 'Enter in the edit box, nothing anywhere', press: '#edit', secretIn: null, expectSent: 1 },
]
async function twoEditors(ctx, sw) {
  let failed = 0
  await sw.evaluate(() => chrome.storage.local.set({ settings: { mode: 'block' } }))
  try {
    for (const c of TWO_EDITORS) {
      const pg = await ctx.newPage()
      await pg.route('**/*', (r) =>
        r.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: page(`<textarea id="prompt-textarea" style="width:500px;height:50px"></textarea>
<form id="f" onsubmit="event.preventDefault(); window.sent++"><textarea id="edit" style="width:500px;height:50px"></textarea><button id="edit-send" type="submit">Send</button></form>
<script>window.sent=0
for (const id of ['prompt-textarea','edit']) document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')window.sent++})</script>`),
        }),
      )
      await pg.goto('https://claude.ai/', { waitUntil: 'domcontentloaded' })
      await pg.waitForTimeout(700)
      if (c.secretIn) {
        await pg.focus(c.secretIn)
        await pg.keyboard.insertText('token ' + GH)
        await pg.waitForTimeout(400) // past the debounce: this case is about WHICH editor, not about timing
      }
      if (c.press) {
        await pg.focus(c.press)
        await pg.keyboard.press('Enter')
      } else {
        await pg.click(c.click)
      }
      await pg.waitForTimeout(300)
      const sent = await pg.evaluate(() => window.sent)
      const ok = sent === c.expectSent
      if (!ok) failed++
      console.log(`  ${ok ? 'ok  ' : 'FAIL'}  two editors: ${c.name.padEnd(62)} reached the site ${sent} time(s), expected ${c.expectSent}`)
      await pg.close()
    }
  } finally {
    await sw.evaluate(() => chrome.storage.local.remove('settings'))
  }
  return failed
}

// One form, two editors: a system prompt and the message box. A send carries both, so a secret in
// either must stop it, whichever has the focus. The first editor in the form used to be the only one read.
const FORM_EDITORS = [
  { name: 'secret in the message box, focus on the button', secretIn: '#msg', focus: '#go', expectSent: 0 },
  { name: 'secret in the system prompt, message box focused', secretIn: '#sys', focus: '#msg', expectSent: 0 },
  { name: 'secret in the system prompt, nothing focused', secretIn: '#sys', focus: '#go', expectSent: 0 },
  { name: 'nothing secret in either', secretIn: null, focus: '#go', expectSent: 1 },
]
async function formEditors(ctx, sw) {
  let failed = 0
  await sw.evaluate(() => chrome.storage.local.set({ settings: { mode: 'block' } }))
  try {
    for (const c of FORM_EDITORS) {
      const pg = await ctx.newPage()
      await pg.route('**/*', (r) =>
        r.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: page(`<form id="f" onsubmit="event.preventDefault(); window.sent++"><textarea id="sys" style="width:500px;height:50px"></textarea><textarea id="msg" style="width:500px;height:50px"></textarea><button id="go" type="submit" aria-label="Send message">Send</button></form><script>window.sent=0</script>`),
        }),
      )
      await pg.goto('https://claude.ai/', { waitUntil: 'domcontentloaded' })
      await pg.waitForTimeout(700)
      if (c.secretIn) {
        await pg.focus(c.secretIn)
        await pg.keyboard.insertText('token ' + GH)
        await pg.waitForTimeout(400)
      }
      await pg.focus(c.focus)
      await pg.click('#go')
      await pg.waitForTimeout(300)
      const sent = await pg.evaluate(() => window.sent)
      const ok = sent === c.expectSent
      if (!ok) failed++
      console.log(`  ${ok ? 'ok  ' : 'FAIL'}  one form, two editors: ${c.name.padEnd(52)} reached the site ${sent} time(s), expected ${c.expectSent}`)
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
    failed += await twoEditors(ctx, sw)
    failed += await formEditors(ctx, sw)
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

  console.log(failed ? `\n${failed} case(s) failed\n` : `\nall ${CASES.length + RACE_DELAYS.length + TWO_EDITORS.length + FORM_EDITORS.length} cases passed\n`)
  process.exit(failed ? 1 : 0)
}

await main()
