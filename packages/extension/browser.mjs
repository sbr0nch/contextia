// Launch Chromium with the built extension loaded. Shared by the browser checks.
//
// Playwright's default `headless: true` runs "chromium headless shell", a build that
// does not run extensions at all: no service worker, no content script. With Playwright
// 1.62 on GitHub's runners that is what the old call got, so test:dom could not test
// anything there, and the failure looked like a timeout in the test, not like a browser
// that never loaded the extension. `channel: 'chromium'` selects the full browser in
// new headless mode, which does. The check below turns the silent case into a clear one.

import { chromium } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A browser binary found on this machine, for sandboxes where Playwright's own download is not present. */
function localChromium() {
  if (process.env.CONTEXTIA_BROWSER) return process.env.CONTEXTIA_BROWSER // an explicit choice wins
  if (existsSync(chromium.executablePath())) return undefined // Playwright's own build is here: use the channel
  for (const p of ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(p)) return p
  }
  return undefined
}

/**
 * @param {string} dist  the built extension folder
 * @param {{ viewport?: {width:number,height:number} }} [opts]
 * @returns {Promise<{ ctx: import('playwright').BrowserContext, sw: import('playwright').Worker, close: () => Promise<void> }>}
 */
export async function launchWithExtension(dist, opts = {}) {
  if (!existsSync(dist)) throw new Error(`build the extension first: ${dist} does not exist`)
  const profile = await mkdtemp(join(tmpdir(), 'contextia-browser-'))
  const exe = localChromium()
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(exe ? { executablePath: exe } : { channel: 'chromium' }),
    ...(opts.viewport ? { viewport: opts.viewport } : {}),
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-sandbox'],
  })
  const close = async () => {
    await ctx.close()
    await rm(profile, { recursive: true, force: true })
  }
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null))
  if (!sw) {
    await close()
    throw new Error(
      'the browser started but did not load the extension (no service worker in 15 s). ' +
        'This is what chromium headless shell does; use the full browser (channel: chromium).',
    )
  }
  return { ctx, sw, close }
}
