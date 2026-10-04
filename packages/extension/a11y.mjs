// Accessibility of what a person sees, in a real browser: axe-core on the toolbar popup,
// the settings page and the in-page indicator, in light and dark colour schemes and at
// phone, tablet and desktop widths.
//
//   npm run test:a11y --workspace @sbr0nch/contextia-extension
//
// Measured when this was written: the popup had no title, no main landmark and a mode
// menu with no accessible name; the settings page had 85 checkboxes with no label (every
// detector toggle), which a screen reader announces as "checkbox, not checked" and nothing
// else. axe also checks colour contrast on the text it can see; it reported none.
//
// What axe cannot judge is not covered: whether the wording is clear, focus order in the
// in-page panel, and anything a screen reader does with the page that a rule does not name.

import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchWithExtension } from './browser.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(here, 'dist')
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
if (!existsSync(DIST)) {
  console.error('build the extension first: npm run build --workspace @sbr0nch/contextia-extension')
  process.exit(1)
}

const SCHEMES = ['light', 'dark']
const WIDTHS = [320, 768, 1280]
const PAGES = ['popup.html', 'options.html']

async function violations(pg) {
  await pg.evaluate(axeSource)
  return pg.evaluate(async () => {
    const r = await axe.run(document, { resultTypes: ['violations'] })
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, html: v.nodes[0].html.slice(0, 100) }))
  })
}

const { ctx, sw, close } = await launchWithExtension(DIST)
const id = new URL(sw.url()).host
let failed = 0
const results = []
const check = (name, found) => {
  const ok = found.length === 0
  if (!ok) failed++
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`)
  for (const v of found) results.push(`          [${v.impact}] ${v.id} (x${v.count}): ${v.help}\n            ${v.html}`)
}

try {
  await sw.evaluate(() => chrome.storage.local.set({ settings: { mode: 'block' } }))
  for (const scheme of SCHEMES) {
    for (const width of WIDTHS) {
      for (const file of PAGES) {
        const pg = await ctx.newPage()
        await pg.emulateMedia({ colorScheme: scheme })
        await pg.setViewportSize({ width, height: 800 })
        await pg.goto(`chrome-extension://${id}/${file}`)
        await pg.waitForTimeout(400)
        check(`${file}, ${scheme}, ${width}px`, await violations(pg))
        await pg.close()
      }
    }
  }

  // The in-page indicator, closed and with its panel open, on pages of every background it
  // can land on: it floats over the host page, so its contrast is only as good as its
  // background is independent of that page. A white page (the light theme of every chat
  // site) turned it grey and the secondary text measured 1.6:1.
  for (const [name, bg] of [['white page', '#ffffff'], ['mid-grey page', '#888888'], ['dark page', '#111111']]) {
    const pg = await ctx.newPage()
    await pg.route('**/*', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html lang="en"><head><title>chat</title></head><body style="margin:0;background:${bg};color:${bg === '#111111' ? '#fff' : '#000'}"><main><h1>Chat</h1><textarea aria-label="Message" style="width:400px;height:60px"></textarea></main></body></html>`,
      }),
    )
    await pg.goto('https://claude.ai/', { waitUntil: 'domcontentloaded' })
    await pg.waitForTimeout(600)
    await pg.focus('textarea')
    await pg.keyboard.insertText('deploy with AKIAIOSFODNN7EXAMPLE and ghp_' + 'aB3dE6gH9jK2mN5pQ8rS1tV4wX7yZ0cF3hL6')
    await pg.waitForTimeout(600)
    check(`in-page indicator, panel closed, on a ${name}`, await violations(pg))
    await pg.locator('.cx-indicator').first().click().catch(() => {})
    await pg.waitForTimeout(400)
    check(`in-page indicator, panel open, on a ${name}`, await violations(pg))
    await pg.close()
  }

  // What axe has no rule for: that the indicator can be used without a mouse, and that a
  // blocked send is announced to someone who cannot see the banner.
  {
    const pg = await ctx.newPage()
    await pg.route('**/*', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html lang="en"><head><title>chat</title></head><body><main><h1>Chat</h1><textarea aria-label="Message" style="width:400px;height:60px"></textarea></main></body></html>',
      }),
    )
    await pg.goto('https://claude.ai/', { waitUntil: 'domcontentloaded' })
    await pg.waitForTimeout(600)
    await pg.focus('textarea')
    await pg.keyboard.insertText('token ghp_' + 'aB3dE6gH9jK2mN5pQ8rS1tV4wX7yZ0cF3hL6')
    await pg.waitForTimeout(600)
    const probe = (fn) => pg.evaluate(fn)
    const ind = pg.locator('.cx-indicator').first()
    const problems = []
    const role = await ind.getAttribute('role')
    if (role !== 'button') problems.push(`the indicator has role "${role}", not "button"`)
    if ((await ind.getAttribute('tabindex')) !== '0') problems.push('the indicator cannot take keyboard focus (no tabindex=0)')
    if (!(await ind.getAttribute('aria-label'))) problems.push('the indicator has no accessible name that says what it found')
    await ind.focus().catch(() => {})
    await pg.keyboard.press('Enter')
    await pg.waitForTimeout(250)
    if ((await ind.getAttribute('aria-expanded')) !== 'true') problems.push('Enter on the indicator does not open the panel (aria-expanded is not "true")')
    if (!(await pg.locator('.cx-pop.cx-on').count())) problems.push('Enter on the indicator does not show the panel')
    if ((await pg.locator('.cx-pop').first().getAttribute('role')) !== 'dialog') problems.push('the panel is not a dialog')
    await pg.keyboard.press('Escape')
    await pg.waitForTimeout(250)
    if (await pg.locator('.cx-pop.cx-on').count()) problems.push('Escape does not close the panel')
    // a blocked send: the page must hold an alert with the message
    await pg.focus('textarea')
    await pg.keyboard.press('Enter')
    await pg.waitForTimeout(300)
    const alertText = await pg.locator('[role="alert"]').first().textContent().catch(() => null)
    if (!alertText || !/blocked/i.test(alertText)) problems.push(`a blocked send is not announced: role=alert text is ${JSON.stringify(alertText)}`)
    check('in-page indicator works from the keyboard and announces a blocked send', problems.map((p) => ({ impact: 'serious', id: 'keyboard-and-announcements', help: p, count: 1, html: '' })))
    await pg.close()
  }
} finally {
  await sw.evaluate(() => chrome.storage.local.remove('settings')).catch(() => {})
  await close()
}

const line = '-'.repeat(70)
console.log(`\n${line}\nAccessibility (axe-core)\n${line}`)
console.log(results.join('\n'))
console.log(failed ? `\n${failed} check(s) with problems\n` : `\nall ${SCHEMES.length * WIDTHS.length * PAGES.length + 3 * 2 + 1} checks clean\n`)
process.exit(failed ? 1 : 0)
