import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib'
import {
  detectDetailed,
  redact,
  customFindings,
  detectors,
  type Config,
  type Finding,
  type CustomRules,
} from '@sbr0nch/contextia-engine'

export type ProxyMode = 'warn' | 'redact' | 'block'
export type { CustomRules }

/** Loopback only unless the operator opts out: the proxy carries plaintext prompts. */
export const DEFAULT_HOST = '127.0.0.1'

export interface ProxyOptions {
  port: number
  mode: ProxyMode
  /** Interface to bind. Defaults to 127.0.0.1; anything else exposes the proxy. */
  host?: string | undefined
  upstream?: string | undefined
  all?: boolean | undefined
  custom?: CustomRules | undefined
  reversible?: boolean | undefined
  /** Prepend a one-line note to redacted text. On by default; disable with --no-signature. */
  signature?: boolean | undefined
  onFinding?: ((findings: Finding[], info: { path: string }) => void) | undefined
}

// One functional line, added once per request: it signals to the model that the
// placeholders are deliberate redactions and carries attribution.
const SIGNATURE = '[Secrets redacted locally by Contextia, contextia.dev]\n'

export interface ProxyStats {
  startedAt: number
  requests: number
  withFindings: number
  redacted: number
  blocked: number
  leaked: number
  /** Bodies forwarded without being scanned (warn/redact only; block refuses). */
  unscanned: number
  byType: Record<string, number>
  bySite: Record<string, number>
}

const UNSCANNABLE_DETAIL: Record<UnscannableReason, string> = {
  oversize: 'larger than the 5 MB scan cap',
  encoding: 'unsupported content-encoding',
  unparsable: 'not JSON we understand',
  truncated: 'longer than the engine scan cap, so the tail was not read',
}

/** A secret-free browser catch, reported to the local dashboard. Counts only. */
export interface BrowserEvent {
  ts: string
  site: string
  detector: string
  action: 'warn' | 'redact' | 'block' | 'leaked'
  count: number
}

const EVENT_FIELDS = new Set(['ts', 'site', 'detector', 'action', 'count'])
const EVENT_ACTIONS = new Set(['warn', 'redact', 'block', 'leaked'])

/**
 * Parse a browser event batch. Returns null if the body carries any field we
 * don't expect, so by construction a matched secret value can never arrive
 * here, even if a caller tried to attach one.
 */
export function parseEventBatch(body: unknown): BrowserEvent[] | null {
  if (!body || typeof body !== 'object') return null
  const events = (body as Record<string, unknown>)['events']
  if (!Array.isArray(events) || events.length === 0 || events.length > 1000) return null
  const out: BrowserEvent[] = []
  for (const e of events) {
    if (!e || typeof e !== 'object') return null
    const rec = e as Record<string, unknown>
    for (const k of Object.keys(rec)) if (!EVENT_FIELDS.has(k)) return null
    const { ts, site, detector, action, count } = rec
    if (typeof ts !== 'string' || typeof site !== 'string' || typeof detector !== 'string') return null
    if (typeof action !== 'string' || !EVENT_ACTIONS.has(action)) return null
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 100000) return null
    out.push({ ts, site, detector, action: action as BrowserEvent['action'], count })
  }
  return out
}

/** Fold a browser event batch into the running stats (mirrors terminal catches). */
export function foldEvents(stats: ProxyStats, events: BrowserEvent[]): void {
  for (const e of events) {
    stats.withFindings += e.count
    stats.byType[e.detector] = (stats.byType[e.detector] ?? 0) + e.count
    stats.bySite[e.site] = (stats.bySite[e.site] ?? 0) + e.count
    if (e.action === 'redact') stats.redacted += e.count
    else if (e.action === 'block') stats.blocked += e.count
    else if (e.action === 'leaked') stats.leaked += e.count
  }
}

function isLoopbackAddr(addr: string | undefined): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

interface TextNode {
  get(): string
  set(value: string): void
}

// The user-authored text in an Anthropic or OpenAI request: system prompt and
// each message's content (string or an array of text blocks). We scan/redact
// exactly these and leave the rest of the payload untouched.
export function* textNodes(body: unknown): Generator<TextNode> {
  if (!body || typeof body !== 'object') return
  const b = body as Record<string, unknown>

  if (typeof b['system'] === 'string') {
    yield { get: () => b['system'] as string, set: (v) => (b['system'] = v) }
  } else if (Array.isArray(b['system'])) {
    for (const block of b['system']) yield* blockText(block)
  }

  if (Array.isArray(b['messages'])) {
    for (const m of b['messages']) {
      if (!m || typeof m !== 'object') continue
      const msg = m as Record<string, unknown>
      if (typeof msg['content'] === 'string') {
        yield { get: () => msg['content'] as string, set: (v) => (msg['content'] = v) }
      } else if (Array.isArray(msg['content'])) {
        for (const block of msg['content']) yield* blockText(block)
      }
    }
  }
}

function* blockText(block: unknown): Generator<TextNode> {
  if (block && typeof block === 'object' && typeof (block as Record<string, unknown>)['text'] === 'string') {
    const b = block as Record<string, unknown>
    yield { get: () => b['text'] as string, set: (v) => (b['text'] = v) }
  }
}

export function configFor(all?: boolean): Config {
  return all ? { enabledDetectors: detectors.map((d) => d.id) } : {}
}

/**
 * Scan and, in redact mode, rewrite the user text in place. When a `vault` is
 * given (reversible mode), each secret is replaced with a unique token and the
 * token→original mapping is recorded, so the LLM's response can be restored.
 */
export function processPayload(
  body: unknown,
  mode: ProxyMode,
  config: Config,
  custom?: CustomRules,
  vault?: Map<string, string>,
  signature?: boolean,
  /** Set to true when any node exceeded the engine scan cap, so part went unread. */
  meta?: { truncated: boolean },
): Finding[] {
  const findings: Finding[] = []
  let noted = false
  for (const node of textNodes(body)) {
    const text = node.get()
    const scan = detectDetailed(text, config)
    if (scan.truncated && meta) meta.truncated = true
    const found = [...scan.findings, ...(custom ? customFindings(text, custom) : [])]
    if (found.length) {
      findings.push(...found)
      if (mode === 'redact') {
        let out = vault
          ? redact(text, found, {
              token: (f) => {
                const t = `⟨cx:${vault.size + 1}⟩`
                vault.set(t, f.match)
                return t
              },
            })
          : redact(text, found)
        if (signature && !noted) {
          out = SIGNATURE + out
          noted = true
        }
        node.set(out)
      }
    }
  }
  return findings
}

/** Restore original values in the LLM's response (reversible mode). */
export function detokenize(text: string, vault: Map<string, string>): string {
  let out = text
  for (const [token, original] of vault) out = out.split(token).join(original)
  return out
}

export function resolveUpstream(url: string, configured?: string): string {
  if (configured) return configured.replace(/\/$/, '')
  if (url.includes('/chat/completions') || url.includes('/responses')) return 'https://api.openai.com'
  return 'https://api.anthropic.com'
}

// Hop-by-hop and framing headers must not be relayed. `expect` in particular:
// clients such as curl add `Expect: 100-continue` for larger bodies, and passing
// it through to fetch makes the upstream call fail outright.
const SKIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'expect',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'te',
  'trailer',
  'proxy-connection',
])
const MAX_SCAN_BODY = 5 * 1024 * 1024 // larger bodies cannot be scanned in one pass

/** Why a body could not be inspected. Null means it was scanned normally. */
export type UnscannableReason = 'oversize' | 'encoding' | 'unparsable' | 'truncated'

/**
 * Decode a request body for scanning. Returns null when the encoding is one we
 * cannot read, which must never be silently treated as "no secrets".
 */
export function decodeBody(body: Buffer, encoding?: string): Buffer | null {
  const enc = (encoding ?? '').trim().toLowerCase()
  try {
    if (enc === '' || enc === 'identity') return body
    if (enc === 'gzip' || enc === 'x-gzip') return gunzipSync(body)
    if (enc === 'deflate') return inflateSync(body)
    if (enc === 'br') return brotliDecompressSync(body)
  } catch {
    return null
  }
  return null
}

export function createProxyServer(opts: ProxyOptions): Server {
  const config = configFor(opts.all)
  const stats: ProxyStats = {
    startedAt: Date.now(),
    requests: 0,
    withFindings: 0,
    redacted: 0,
    blocked: 0,
    leaked: 0,
    unscanned: 0,
    byType: {},
    bySite: {},
  }
  return createServer((req, res) => void handle(req, res, opts, config, stats))
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ProxyOptions,
  config: Config,
  stats: ProxyStats,
): Promise<void> {
  const path = req.url ?? '/'

  // The proxy's own local dashboard / stats, never forwarded upstream.
  if (path === '/__contextia/stats') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(stats, null, 2))
    return
  }
  if (path === '/__contextia' || path === '/__contextia/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(dashboardHtml(stats, opts.mode))
    return
  }

  // Secret-free browser catches, folded into the same local dashboard. Loopback
  // only, and rejected outright if the body carries anything but counts.
  if (path === '/__contextia/events') {
    if (req.method !== 'POST' || !isLoopbackAddr(req.socket.remoteAddress)) {
      res.writeHead(405)
      res.end()
      return
    }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    let events: BrowserEvent[] | null = null
    try {
      events = parseEventBatch(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    } catch {
      events = null
    }
    if (!events) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end('{"error":"invalid event batch"}')
      return
    }
    foldEvents(stats, events)
    res.writeHead(204)
    res.end()
    return
  }

  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  let body = Buffer.concat(chunks)
  stats.requests++

  const vault = opts.reversible && opts.mode === 'redact' ? new Map<string, string>() : undefined
  const reqEncoding = req.headers['content-encoding']
  let dropContentEncoding = false
  let unscannable: UnscannableReason | null = null

  if ((req.method === 'POST' || req.method === 'PUT') && body.length > 0) {
    if (body.length > MAX_SCAN_BODY) {
      unscannable = 'oversize'
    } else {
      const decoded = decodeBody(body, Array.isArray(reqEncoding) ? reqEncoding[0] : reqEncoding)
      if (decoded === null) {
        unscannable = 'encoding'
      } else {
        let json: unknown
        try {
          json = JSON.parse(decoded.toString('utf8'))
        } catch {
          unscannable = 'unparsable'
        }
        if (!unscannable) {
          const meta = { truncated: false }
          const findings = processPayload(json, opts.mode, config, opts.custom, vault, opts.signature, meta)
          if (meta.truncated) unscannable = 'truncated'
          if (findings.length > 0) {
            stats.withFindings++
            for (const f of findings) stats.byType[f.type] = (stats.byType[f.type] ?? 0) + 1
            opts.onFinding?.(findings, { path })
            if (opts.mode === 'block') {
              stats.blocked++
              res.writeHead(403, { 'content-type': 'application/json' })
              res.end(
                JSON.stringify({
                  error: {
                    type: 'contextia_blocked',
                    message: `Blocked by Contextia: ${findings.length} secret(s) detected`,
                    secrets: [...new Set(findings.map((f) => f.type))],
                  },
                }),
              )
              return
            }
            if (opts.mode === 'redact') {
              stats.redacted++
              // The rewritten body is plain JSON: forward it decoded and drop the
              // stale content-encoding rather than re-compressing.
              body = Buffer.from(JSON.stringify(json))
              dropContentEncoding = true
            }
          }
        }
      }
    }
  }

  // A body we could not read is unknown, not clean. Block mode must fail closed,
  // otherwise its one promise is broken by anything gzipped or oversized.
  if (unscannable) {
    const detail = UNSCANNABLE_DETAIL[unscannable]
    if (opts.mode === 'block') {
      stats.blocked++
      process.stderr.write(`contextia: blocked an unscannable request body (${detail})\n`)
      res.writeHead(403, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          error: {
            type: 'contextia_unscannable',
            message: `Blocked by Contextia: request body could not be scanned (${detail}). Block mode fails closed.`,
            reason: unscannable,
          },
        }),
      )
      return
    }
    stats.unscanned++
    process.stderr.write(
      `contextia: WARNING request body forwarded UNSCANNED (${detail}); secrets in it were not checked\n`,
    )
  }

  const upstream = resolveUpstream(path, opts.upstream)
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined || SKIP_REQUEST_HEADERS.has(k.toLowerCase())) continue
    if (dropContentEncoding && k.toLowerCase() === 'content-encoding') continue
    headers[k] = Array.isArray(v) ? v.join(', ') : v
  }
  headers['accept-encoding'] = 'identity'

  const init: RequestInit = { method: req.method ?? 'GET', headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    ;(init as { body?: unknown }).body = body
  }
  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstream + path, init)
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { type: 'contextia_upstream_error', message: String(e) } }))
    return
  }

  const outHeaders: Record<string, string> = {}
  upstreamRes.headers.forEach((value, key) => {
    if (key !== 'content-encoding' && key !== 'content-length') outHeaders[key] = value
  })

  // Reversible mode: buffer the response and restore the originals so the LLM's
  // answer is usable. (Trades streaming for round-trip restoration.)
  if (vault && vault.size > 0) {
    const restored = detokenize(await upstreamRes.text(), vault)
    res.writeHead(upstreamRes.status, outHeaders)
    res.end(restored)
    return
  }

  res.writeHead(upstreamRes.status, outHeaders)
  if (upstreamRes.body) {
    for await (const chunk of upstreamRes.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk)
  }
  res.end()
}

// Brand loading/live mark: the two masked dots pulsing between brackets.
const SPINNER = `<svg viewBox="0 0 120 120" width="22" height="22" style="vertical-align:-4px;margin-right:8px"><g fill="none" stroke="#00D084" stroke-width="11" stroke-linecap="round"><path d="M40 30 C24 30 24 42 24 60 C24 78 24 90 40 90"/><path d="M80 30 C96 30 96 42 96 60 C96 78 96 90 80 90"/></g><circle cx="50" cy="60" r="7" fill="#00D084"><animate attributeName="opacity" values="1;.2;1" dur="1.1s" repeatCount="indefinite"/></circle><circle cx="70" cy="60" r="7" fill="#00D084"><animate attributeName="opacity" values="1;.2;1" dur="1.1s" begin="0.55s" repeatCount="indefinite"/></circle></svg>`

/**
 * Escape text interpolated into the dashboard. Detector and site labels arrive
 * from the browser reporter, so they are untrusted input, not our own strings.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function dashboardHtml(stats: ProxyStats, mode: ProxyMode): string {
  const rows = Object.entries(stats.byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `<tr><td>${escapeHtml(t)}</td><td>${n}</td></tr>`)
    .join('')
  const siteRows = Object.entries(stats.bySite)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `<tr><td>${escapeHtml(s)}</td><td>${n}</td></tr>`)
    .join('')
  const mins = Math.max(1, Math.round((Date.now() - stats.startedAt) / 60000))
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="2">
<title>Contextia proxy</title><style>
body{margin:0;background:#0a0a0a;color:#e8e8ea;font:14px/1.5 'Inter',system-ui,sans-serif;padding:28px}
.brand{color:#00D084;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
.sub{color:#8b90a0;margin-bottom:22px}
.cards{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:22px}
.card{background:#16181d;border:1px solid #2a2a2a;border-radius:12px;padding:16px 20px;min-width:120px}
.n{font-size:28px;font-weight:800}.n.g{color:#00D084}.n.r{color:#ff5d5f}
.l{color:#8b90a0;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
table{border-collapse:collapse;width:100%;max-width:440px}td{padding:7px 10px;border-bottom:1px solid #21242c}
td:last-child{text-align:right;color:#00D084;font-variant-numeric:tabular-nums}
</style></head><body>
<div class="brand">${SPINNER}Contextia proxy</div>
<div class="sub">mode <b>${mode}</b> · up ~${mins} min · live</div>
<div class="cards">
<div class="card"><div class="n">${stats.requests}</div><div class="l">requests</div></div>
<div class="card"><div class="n r">${stats.withFindings}</div><div class="l">with secrets</div></div>
<div class="card"><div class="n g">${stats.redacted}</div><div class="l">redacted</div></div>
<div class="card"><div class="n r">${stats.blocked}</div><div class="l">blocked</div></div>
<div class="card"><div class="n r">${stats.leaked}</div><div class="l">leaked</div></div>
<div class="card"><div class="n r">${stats.unscanned}</div><div class="l">unscanned</div></div>
</div>
<table>${rows || '<tr><td class="l">no secrets seen yet</td><td></td></tr>'}</table>
${siteRows ? `<div class="sub" style="margin:22px 0 8px">by site (browser)</div><table>${siteRows}</table>` : ''}
</body></html>`
}

export function startProxy(opts: ProxyOptions): Server {
  const server = createProxyServer(opts)
  const host = opts.host ?? DEFAULT_HOST
  server.listen(opts.port, host, () => {
    process.stderr.write(
      `contextia proxy: http://localhost:${opts.port} -> ${opts.upstream ?? 'auto (anthropic/openai)'}  mode=${opts.mode}\n` +
        `point your agent at it:  ANTHROPIC_BASE_URL=http://localhost:${opts.port}  (or OPENAI_BASE_URL)\n` +
        `live stats:              http://localhost:${opts.port}/__contextia\n`,
    )
    if (host !== DEFAULT_HOST && host !== 'localhost') {
      process.stderr.write(
        `contextia: WARNING bound to ${host}, not loopback. Prompts and the stats\n` +
          `dashboard are reachable from the network. Use the default unless you mean this.\n`,
      )
    }
  })
  return server
}
