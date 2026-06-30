// Render terminal screenshots and an animated GIF of the Contextia CLI for the
// website. Uses Playwright to paint a styled terminal and the bundled ffmpeg to
// encode the GIF. No CLI colors are scraped; output is colorized for the web.
import { chromium } from 'playwright'
import { mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const out = process.env.OUT ?? join(here, 'media')
await mkdir(out, { recursive: true })

// esc(): HTML-escape. c(): wrap a token in a colour class.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const c = (cls, s) => `<span class="${cls}">${esc(s)}</span>`

// A finding row + its "why" line, colourised the way the site should show it.
const find = (loc, sev, type, prev, why) =>
  `${c('dim', loc)}  ${c(sev, sev.padEnd(8))} ${c('id', type.padEnd(22))} ${c('prev', prev)}\n` +
  `          ${c('dim', 'why:')} ${c('why', why)}`

const scenes = {
  scan: {
    title: 'contextia — scan',
    cmd: 'contextia scan --explain .env',
    lines: [
      find('.env:1:8', 'critical', 'db_connection_string', 'post…5432', 'Connection string with credentials — sharing it with an AI assistant could leak access.'),
      find('.env:2:19', 'critical', 'aws_access_key_id', 'AKIA…MPLE', 'AWS access key ID looks like a live credential.'),
      find('.env:3:14', 'critical', 'github_token', 'ghp_…aaaa', 'A GitHub token can read or push to your repositories — revoke it if it leaks.'),
      find('.env:4:8', 'critical', 'stripe_live_key', 'sk_l…aaaa', 'Stripe live key looks like a live credential.'),
      '',
      c('warn', '6 secrets found'),
    ],
  },
  redact: {
    title: 'contextia — redact',
    cmd: 'contextia redact .env',
    lines: [
      `DB_URL=${c('tok', '⟨redacted:db_connection_string⟩')}/prod`,
      `AWS_ACCESS_KEY_ID=${c('tok', '⟨redacted:aws_access_key_id⟩')}`,
      `GITHUB_TOKEN=${c('tok', '⟨redacted:github_token⟩')}`,
      `STRIPE=${c('tok', '⟨redacted:stripe_live_key⟩')}`,
    ],
  },
  proxy: {
    title: 'contextia — proxy (AI-DLP)',
    cmd: 'contextia proxy --mode redact',
    lines: [
      c('ok', 'contextia: proxy on http://localhost:8787  (mode: redact)'),
      c('dim', 'contextia: point your agent with ANTHROPIC_BASE_URL=http://localhost:8787'),
      c('dim', 'contextia: live stats at http://localhost:8787/__contextia'),
      '',
      `${c('warn', 'contextia: redact 3 secret(s)')} on /v1/messages — ${c('id', 'anthropic_key, aws_access_key_id, github_token')}`,
      `${c('warn', 'contextia: redact 1 secret(s)')} on /v1/messages — ${c('id', 'private_key')}`,
    ],
  },
}

function pageHtml(title) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{--bg:#0b0e14;--panel:#0e1320;--fg:#e6e7ea}
    *{box-sizing:border-box} body{margin:0;background:radial-gradient(120% 120% at 80% 0%,#0f2a20 0%,#070708 60%);
      display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:'Inter',system-ui,sans-serif}
    .term{width:900px;border-radius:14px;overflow:hidden;background:var(--bg);
      box-shadow:0 30px 80px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.07)}
    .bar{display:flex;align-items:center;gap:8px;padding:11px 14px;background:#11151f;border-bottom:1px solid rgba(255,255,255,.06);
      color:#8b93a7;font-size:12px}
    .d{width:12px;height:12px;border-radius:50%} .r{background:#ff5f57}.y{background:#febc2e}.g{background:#28c840}
    .bar .t{margin-left:8px}
    pre{margin:0;padding:20px 22px;font:14px/1.65 'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
      color:var(--fg);white-space:pre-wrap;word-break:break-word}
    .prompt{color:#00D084;font-weight:700} .cmd{color:#fff}
    .dim{color:#6b7280}.id{color:#c4b5fd}.prev{color:#7f8492}.why{color:#9aa0ad}
    .critical{color:#ff6b6e;font-weight:600}.warn{color:#f5a623;font-weight:600}
    .tok{color:#00D084}.ok{color:#34d399}
    .cur{display:inline-block;width:8px;height:17px;background:#00D084;vertical-align:-3px;margin-left:1px;animation:b 1s steps(1) infinite}
    @keyframes b{50%{opacity:0}}
  </style></head><body>
    <div class="term"><div class="bar"><span class="d r"></span><span class="d y"></span><span class="d g"></span>
      <span class="t">${esc(title)}</span></div>
      <pre id="scr"></pre></div>
    <script>
      window.paint = (cmd, body, showCursor) => {
        const scr = document.getElementById('scr')
        scr.innerHTML = '<span class="prompt">$</span> <span class="cmd">' + cmd + '</span>'
          + (showCursor ? '<span class="cur"></span>' : '')
          + (body ? '\\n' + body : '')
      }
    </script>
  </body></html>`
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
// deviceScaleFactor:1 keeps GIF frames light and avoids an over-zoomed look.
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 })

async function staticShot(name, scene) {
  const page = await ctx.newPage()
  await page.setContent(pageHtml(scene.title))
  await page.evaluate(([cmd, body]) => window.paint(cmd, body, false), [scene.cmd, scene.lines.join('\n')])
  await page.waitForTimeout(120)
  const term = page.locator('.term')
  await term.screenshot({ path: join(out, `${name}.png`) })
  await page.close()
  console.log('static:', name)
}

// Animated GIF: type the command, then reveal output lines, then hold.
async function gif(name, scene) {
  const framesDir = join(out, `_frames_${name}`)
  await rm(framesDir, { recursive: true, force: true })
  await mkdir(framesDir, { recursive: true })
  const page = await ctx.newPage()
  await page.setContent(pageHtml(scene.title))
  const term = page.locator('.term')
  let f = 0
  const cap = async () => {
    await term.screenshot({ path: join(framesDir, `f${String(f++).padStart(4, '0')}.png`) })
  }
  // type the command
  for (let i = 1; i <= scene.cmd.length; i++) {
    await page.evaluate(([cmd]) => window.paint(cmd, '', true), [scene.cmd.slice(0, i)])
    if (i % 2 === 0 || i === scene.cmd.length) await cap()
  }
  // small pause on full command
  for (let k = 0; k < 6; k++) await cap()
  // reveal output lines progressively
  const body = []
  for (const line of scene.lines) {
    body.push(line)
    await page.evaluate(([cmd, b]) => window.paint(cmd, b, false), [scene.cmd, body.join('\n')])
    await cap(); await cap()
  }
  // hold the final frame
  for (let k = 0; k < 24; k++) await cap()
  await page.close()
  // Frames are encoded to GIF by encode-gif.mjs (pure JS); the Playwright ffmpeg
  // build lacks a PNG decoder / GIF encoder, so we don't shell out here.
  console.log('frames:', f, '→', framesDir)
}

await staticShot('cli-scan', scenes.scan)
await staticShot('cli-redact', scenes.redact)
await staticShot('cli-proxy', scenes.proxy)
await gif('cli-scan', scenes.scan)
await gif('cli-proxy', scenes.proxy)

await browser.close()
console.log('done →', out)
