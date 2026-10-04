import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib'
import {
  redact,
  customFindings,
  detectors,
  type Config,
  type Finding,
  type CustomRules,
} from '@sbr0nch/contextia-engine'
import { detectAll } from './core.js'
import { childPath, indexJson, patchJson, type JsonIndex } from './json.js'

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
  /** Largest request body that is read; above it the answer is 413. */
  maxBodyBytes?: number | undefined
  /** Largest body that is scanned; above it the body is unscannable. */
  maxScanBytes?: number | undefined
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

const mb = (n: number): string => `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`

const unscannableDetail = (limit: number): Record<UnscannableReason, string> => ({
  oversize: `larger than the ${mb(limit)} scan cap`,
  encoding: `unsupported content-encoding, or larger than the ${mb(limit)} scan cap once decompressed`,
  unparsable: 'not JSON we understand',
  ambiguous: 'a key appears twice, and parsers disagree about which value counts',
})

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

// Detector ids and site names arrive from the reporter, so their cardinality is
// not ours to assume. A proxy left running for days should not grow a key per
// distinct string it was ever sent: measured at 20,000 sites the stats payload
// reached 323 KB and the dashboard rendered 20,052 rows. Counting stops at the
// cap; everything already tracked keeps counting.
export const MAX_STAT_KEYS = 200

function bump(bucket: Record<string, number>, key: string, by: number): void {
  if (bucket[key] === undefined && Object.keys(bucket).length >= MAX_STAT_KEYS) return
  bucket[key] = (bucket[key] ?? 0) + by
}

/** Fold a browser event batch into the running stats (mirrors terminal catches). */
export function foldEvents(stats: ProxyStats, events: BrowserEvent[]): void {
  for (const e of events) {
    stats.withFindings += e.count
    bump(stats.byType, e.detector, e.count)
    bump(stats.bySite, e.site, e.count)
    if (e.action === 'redact') stats.redacted += e.count
    else if (e.action === 'block') stats.blocked += e.count
    else if (e.action === 'leaked') stats.leaked += e.count
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\//

/**
 * Whether a request for the proxy's own pages may be answered. The pages sit on a
 * loopback port that any web page the user has open can reach. A rebound domain
 * arrives with its own name in Host, so Host must be loopback; a page's POST
 * carries its site in Origin, so only the extension or a client with no Origin
 * may post. An operator who bound another interface on purpose is not held to Host.
 */
function localRequestAllowed(req: IncomingMessage, opts: ProxyOptions, post: boolean): boolean {
  const bound = opts.host ?? DEFAULT_HOST
  if (LOOPBACK_HOSTS.has(bound) || bound === 'localhost') {
    const host = (req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '')
    if (!LOOPBACK_HOSTS.has(host)) return false
  }
  const origin = req.headers.origin
  return !(post && origin !== undefined && !EXTENSION_ORIGIN.test(origin))
}

function isLoopbackAddr(addr: string | undefined): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

interface TextNode {
  get(): string
  set(value: string): void
  /** Conversational text (system prompt, message text). Only this carries the signature note. */
  prose: boolean
  /** Where it sits in the body, as json.ts indexes it: lets an edit be applied to the original text. */
  path: string
}

type Slot = { container: Record<string, unknown> | unknown[]; key: string | number }

const slotGet = (s: Slot): unknown => (s.container as Record<string | number, unknown>)[s.key]
const slotSet = (s: Slot, v: string): void => {
  ;(s.container as Record<string | number, unknown>)[s.key] = v
}

// Strings that are not text and must come back byte for byte. The signed parts of a
// thinking block: rewriting them makes the API reject the request. Base64 media:
// rewriting it corrupts the image, and random base64 trips detectors now and then.
//
// Each rule is narrow on purpose. Whatever it exempts is never scanned, so a rule
// that is too wide is a hole: a plain-text document puts its text in the same
// `source.data` an image puts base64 in, and a `data:` prefix says nothing about
// the rest of the string.
// Real base64 has no spaces (only the line breaks of MIME wrapping) and media is long,
// so a short string, or one with a space in it, is text and is read.
const BASE64_BODY = /^[A-Za-z0-9+/_=\r\n-]{128,}$/
const BASE64_URL = /^data:[^,]{0,100};base64,[A-Za-z0-9+/_=\r\n-]{128,}$/i
const MEDIA_TYPE = /^(image|audio|video)\/|^application\/pdf$/i
function isOpaque(container: unknown, key: string | number, value: string): boolean {
  if (BASE64_URL.test(value)) return true
  if (!container || typeof container !== 'object' || Array.isArray(container)) return false
  const o = container as Record<string, unknown>
  if (o['type'] === 'thinking') return key === 'thinking' || key === 'signature'
  if (o['type'] === 'redacted_thinking') return key === 'data'
  if (key !== 'data' || !BASE64_BODY.test(value)) return false
  const mime = o['media_type'] ?? o['mime_type']
  return o['type'] === 'base64' || (typeof mime === 'string' && MEDIA_TYPE.test(mime)) || typeof o['format'] === 'string'
}

// Where conversational text lives. Read first and in this order, so the
// signature note lands in prose whatever order the client wrote its keys in.
const LEAD_KEYS = ['system', 'instructions', 'messages', 'input', 'prompt']

/**
 * Every string a request can carry to the model.
 *
 * This used to read only `system` and `messages[].content` text, so anything
 * else an agent sent (a tool_result holding the .env it just read, a tool call's
 * arguments, the whole OpenAI Responses and Gemini shapes) went upstream
 * unscanned and unreported. A request has no fixed shape we can enumerate, so
 * the walk is generic and the exceptions are the strings that are not text.
 *
 * Iterative on purpose: the body is client-controlled and a deeply nested one
 * must not be able to overflow the stack.
 */
export function* textNodes(body: unknown): Generator<TextNode> {
  if (!body || typeof body !== 'object') return
  const root = body as Record<string, unknown>
  const lead = new Set(LEAD_KEYS)
  const order: Array<string | number> = Array.isArray(body)
    ? body.map((_, i) => i)
    : [...LEAD_KEYS.filter((k) => k in root), ...Object.keys(root).filter((k) => !lead.has(k))]

  const stack: Array<{ container: Record<string, unknown> | unknown[]; key: string | number; prose: boolean; path: string }> = []
  for (const k of [...order].reverse()) stack.push({ container: root, key: k, prose: k === 'system' || k === 'messages', path: childPath('', k) })

  while (stack.length) {
    const { container, key, prose, path } = stack.pop()!
    const value = (container as Record<string | number, unknown>)[key]
    if (typeof value === 'string') {
      if (isOpaque(container, key, value)) continue
      const slot: Slot = { container, key }
      yield { get: () => slotGet(slot) as string, set: (v) => slotSet(slot, v), prose, path }
    } else if (value && typeof value === 'object') {
      // Prose stays prose only along the path system/messages -> content -> text.
      // A tool call's input or a tool result's content is data, not conversation.
      const o = value as Record<string, unknown>
      const dataBlock = !Array.isArray(value) && (o['type'] === 'tool_use' || o['type'] === 'tool_result' || o['type'] === 'tool_call' || o['role'] === 'tool')
      const keys = Array.isArray(value) ? value.map((_, i) => i) : Object.keys(o)
      for (const k of [...keys].reverse()) {
        const childProse = prose && !dataBlock && (Array.isArray(value) || k === 'content' || k === 'text' || k === 'system')
        stack.push({ container: value as Record<string, unknown>, key: k, prose: childProse, path: childPath(path, k) })
      }
    }
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
  /** Receives each rewritten string by path, so the edit can be applied to the original text. */
  edits?: Map<string, string>,
): Finding[] {
  const findings: Finding[] = []
  let noted = false
  for (const node of textNodes(body)) {
    const text = node.get()
    // Windowed, so one long text (a file an agent read) is scanned to the end
    const found = [...detectAll(text, config), ...(custom ? customFindings(text, custom) : [])]
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
        if (signature && node.prose && !noted) {
          out = SIGNATURE + out
          noted = true
        }
        node.set(out)
        edits?.set(node.path, out)
      }
    }
  }
  return findings
}

/**
 * The object keys of a body. A key is a string a client can put anything in, and the walk
 * above reads values only: a secret used as a key (`{"AKIA...": 1}`) went upstream unseen.
 * Each distinct key is scanned once; a body repeats the same few ("role", "content").
 */
export function processKeys(
  index: JsonIndex,
  mode: ProxyMode,
  config: Config,
  custom?: CustomRules,
  vault?: Map<string, string>,
): { findings: Finding[]; edits: Map<number, string> } {
  const findings: Finding[] = []
  const edits = new Map<number, string>()
  const verdict = new Map<string, string | null>() // key -> its redacted form, or null when clean
  for (const tok of index.keys) {
    let redacted = verdict.get(tok.key)
    if (redacted === undefined) {
      const found = [...detectAll(tok.key, config), ...(custom ? customFindings(tok.key, custom) : [])]
      redacted = null
      if (found.length) {
        findings.push(...found)
        redacted =
          mode !== 'redact'
            ? null
            : vault
              ? redact(tok.key, found, {
                  token: (f) => {
                    const t = `⟨cx:${vault.size + 1}⟩`
                    vault.set(t, f.match)
                    return t
                  },
                })
              : redact(tok.key, found)
      }
      verdict.set(tok.key, redacted)
    }
    if (redacted !== null) edits.set(tok.start, redacted)
  }
  return { findings, edits }
}

/**
 * Restore original values in the LLM's response (reversible mode).
 *
 * `jsonEscaped` is for a reply that is JSON, or SSE lines of JSON: the token sits
 * inside a JSON string, so a value with a newline, a quote or a backslash has to
 * go back escaped or the reply stops parsing.
 */
export function detokenize(text: string, vault: Map<string, string>, jsonEscaped = false): string {
  let out = text
  for (const [token, original] of vault) {
    const value = jsonEscaped ? JSON.stringify(original).slice(1, -1) : original
    out = out.split(token).join(value)
  }
  return out
}

/**
 * Restore originals in a streamed (SSE) reply.
 *
 * A model streams its answer in small deltas and a placeholder is a few tokens long, so
 * it can arrive cut across events. Each text delta is a string at the same place in its
 * event, so the strings at one path are joined in order, the placeholders found in the
 * joined text, and the value written where the placeholder began (the rest of the
 * placeholder is removed from the deltas it was cut into). Events that need no change
 * are left byte for byte; the value goes back JSON-escaped, so every event stays valid.
 */
export function restoreStream(text: string, vault: Map<string, string>): string {
  const lines = text.split('\n')
  type Piece = { line: number; path: string; value: string }
  const indexes = new Map<number, { payload: string; index: NonNullable<ReturnType<typeof indexJson>>; prefix: string }>()
  const groups = new Map<string, Piece[]>()
  lines.forEach((l, i) => {
    const prefix = l.startsWith('data: ') ? 'data: ' : l.startsWith('data:') ? 'data:' : null
    const payload = prefix === null ? '' : l.slice(prefix.length)
    const index = prefix === null ? null : indexJson(payload)
    if (!index || prefix === null) {
      lines[i] = detokenize(l, vault, true) // not a JSON event: a whole placeholder in it is still restored
      return
    }
    indexes.set(i, { payload, index, prefix })
    for (const [path, tok] of index.strings) {
      const raw = payload.slice(tok.start, tok.end)
      const value = JSON.parse(raw) as string
      const list = groups.get(path)
      if (list) list.push({ line: i, path, value })
      else groups.set(path, [{ line: i, path, value }])
    }
  })

  const edits = new Map<number, Map<string, string>>()
  for (const pieces of groups.values()) {
    const joined = pieces.map((p) => p.value).join('')
    const found = [...joined.matchAll(/⟨cx:\d+⟩/g)].filter((m) => vault.has(m[0]))
    if (found.length === 0) continue
    const starts: number[] = []
    let at = 0
    for (const p of pieces) {
      starts.push(at)
      at += p.value.length
    }
    const pieceAt = (pos: number): number => {
      let k = pieces.length - 1
      while (k > 0 && starts[k]! > pos) k--
      return k
    }
    const out = pieces.map(() => '')
    const keep = (from: number, to: number): void => {
      // text that stays, assigned back to the piece each character came from
      let pos = from
      while (pos < to) {
        const k = pieceAt(pos)
        const end = Math.min(to, starts[k]! + pieces[k]!.value.length)
        out[k] += joined.slice(pos, end)
        pos = end
      }
    }
    let cursor = 0
    for (const m of found) {
      const s0 = m.index!
      keep(cursor, s0)
      out[pieceAt(s0)] += vault.get(m[0])!
      cursor = s0 + m[0].length
    }
    keep(cursor, joined.length)
    pieces.forEach((p, k) => {
      if (out[k] === p.value) return
      let m = edits.get(p.line)
      if (!m) edits.set(p.line, (m = new Map()))
      m.set(p.path, out[k]!)
    })
  }

  for (const [i, m] of edits) {
    const { payload, index, prefix } = indexes.get(i)!
    lines[i] = prefix + patchJson(payload, index, m)
  }
  return lines.join('\n')
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
/** Larger bodies are forwarded unscanned (warn, redact) or refused (block). */
export const DEFAULT_MAX_SCAN_BODY = 32 * 1024 * 1024
/** Larger bodies are not read at all: the proxy answers 413. Memory is about four times the body. */
export const DEFAULT_MAX_BODY = 64 * 1024 * 1024
/** The events route takes a counts-only batch; a thousand events is about 100 KB. */
const MAX_EVENTS_BODY = 1024 * 1024

/** Why a body could not be inspected. Null means it was scanned normally. */
export type UnscannableReason = 'oversize' | 'encoding' | 'unparsable' | 'ambiguous'

/**
 * Decode a request body for scanning. Returns null when the encoding is one we
 * cannot read, which must never be silently treated as "no secrets".
 */
export function decodeBody(body: Buffer, encoding?: string, maxOutput: number = DEFAULT_MAX_SCAN_BODY): Buffer | null {
  const enc = (encoding ?? '').trim().toLowerCase()
  try {
    if (enc === '' || enc === 'identity') return body
    // Capped: a 400 KB gzip expands to 400 MB, and the proxy used to allocate all of it.
    const cap = { maxOutputLength: maxOutput }
    if (enc === 'gzip' || enc === 'x-gzip') return gunzipSync(body, cap)
    if (enc === 'deflate') return inflateSync(body, cap)
    if (enc === 'br') return brotliDecompressSync(body, cap)
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
  const server = createServer((req, res) => {
    handle(req, res, opts, config, stats).catch((err: unknown) => {
      // A client that goes away mid-request rejects the body read. That is
      // routine (Ctrl+C in the agent, a timeout, a retry), but the rejection
      // used to escape unhandled and Node killed the whole proxy with it, so
      // the next request got ECONNREFUSED and the guard was simply gone.
      const gone = req.destroyed || res.destroyed || (err as NodeJS.ErrnoException)?.code === 'ECONNRESET'
      if (!gone) process.stderr.write(`contextia: request failed: ${String(err)}\n`)
      if (res.destroyed) return
      if (res.headersSent) {
        res.end()
        return
      }
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { type: 'contextia_proxy_error', message: String(err) } }))
    })
  })
  // Malformed requests reach the server before any handler runs. Without this
  // they surface as an uncaught 'clientError' and take the process down too.
  server.on('clientError', (_err, socket) => {
    if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
  })
  return server
}

/** Longest the proxy keeps reading and discarding what a client sends after a 413. */
const DRAIN_MS = 30_000

/**
 * Read a request body, or return null after answering 413 when it passes `limit`.
 *
 * The rest of an oversized body is read and thrown away, not cut off. Closing the socket
 * while the client is still sending makes the client see a reset (ECONNRESET on Windows,
 * EPIPE on macOS) instead of the 413, found by running the tests there. Nothing is kept,
 * so memory stays flat; the drain stops after DRAIN_MS.
 */
async function readBody(req: IncomingMessage, res: ServerResponse, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let total = 0
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) total = declared
  if (total <= limit) {
    // destroyOnReturn: false, so leaving the loop at the limit does not tear the stream down
    for await (const c of req.iterator({ destroyOnReturn: false })) {
      total += (c as Buffer).length
      if (total > limit) break
      chunks.push(c as Buffer)
    }
  }
  if (total <= limit) return Buffer.concat(chunks)
  res.writeHead(413, { 'content-type': 'application/json' })
  res.end(
    JSON.stringify({
      error: { type: 'contextia_request_too_large', message: `Contextia does not read a request body over ${mb(limit)}; this one was larger.` },
    }),
  )
  req.resume()
  const stop = setTimeout(() => req.destroy(), DRAIN_MS)
  stop.unref()
  req.on('close', () => clearTimeout(stop))
  return null
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ProxyOptions,
  config: Config,
  stats: ProxyStats,
): Promise<void> {
  const path = req.url ?? '/'

  if (path.startsWith('/__contextia') && !localRequestAllowed(req, opts, req.method === 'POST')) {
    res.writeHead(403, { 'content-type': 'application/json' })
    res.end('{"error":"not for this origin or host"}')
    return
  }

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
    const raw = await readBody(req, res, MAX_EVENTS_BODY)
    if (raw === null) return
    let events: BrowserEvent[] | null = null
    try {
      events = parseEventBatch(JSON.parse(raw.toString('utf8')))
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

  const read = await readBody(req, res, opts.maxBodyBytes ?? DEFAULT_MAX_BODY)
  if (read === null) return
  let body = read
  stats.requests++

  const scanLimit = opts.maxScanBytes ?? DEFAULT_MAX_SCAN_BODY
  const vault = opts.reversible && opts.mode === 'redact' ? new Map<string, string>() : undefined
  const reqEncoding = req.headers['content-encoding']
  let dropContentEncoding = false
  let unscannable: UnscannableReason | null = null

  // Any method that carries a body. This was POST and PUT only: a PATCH or DELETE with
  // a prompt in it went upstream unscanned and unreported.
  if (req.method !== 'GET' && req.method !== 'HEAD' && body.length > 0) {
    if (body.length > scanLimit) {
      unscannable = 'oversize'
    } else {
      const decoded = decodeBody(body, Array.isArray(reqEncoding) ? reqEncoding[0] : reqEncoding, scanLimit)
      if (decoded === null) {
        unscannable = 'encoding'
      } else {
        const text = decoded.toString('utf8')
        let json: unknown
        let index: JsonIndex | null = null
        try {
          json = JSON.parse(text)
          // The reader that records where each string sits must agree that this is JSON
          // (it refuses only what is nested past 512 levels). If it does not, the body is
          // not scanned as if it were.
          index = indexJson(text)
        } catch {
          // not JSON
        }
        if (index === null) unscannable = 'unparsable'
        else if (index.duplicateKeys) unscannable = 'ambiguous'
        if (!unscannable && index !== null) {
          const edits = new Map<string, string>()
          const findings = processPayload(json, opts.mode, config, opts.custom, vault, opts.signature, edits)
          const keys = processKeys(index, opts.mode, config, opts.custom, vault)
          findings.push(...keys.findings)
          if (findings.length > 0) {
            stats.withFindings++
            for (const f of findings) bump(stats.byType, f.type, 1)
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
              // The edits are applied to the text the client sent, so numbers, spacing and
              // key order arrive as they were. The result is plain JSON: forward it decoded
              // and drop the stale content-encoding rather than re-compressing.
              body = Buffer.from(patchJson(text, index, edits, keys.edits))
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
    const detail = unscannableDetail(scanLimit)[unscannable]
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
    // fetch reports every network failure as "fetch failed"; the reason is on the cause
    const cause = (e as { cause?: { code?: string; message?: string } }).cause
    const why = cause?.code ?? cause?.message ?? String(e)
    res.end(JSON.stringify({ error: { type: 'contextia_upstream_error', message: `Contextia could not reach the upstream ${upstream}: ${why}` } }))
    return
  }

  const outHeaders: Record<string, string> = {}
  upstreamRes.headers.forEach((value, key) => {
    if (key !== 'content-encoding' && key !== 'content-length') outHeaders[key] = value
  })

  // Reversible mode: buffer the response and restore the originals so the LLM's
  // answer is usable. (Trades streaming for round-trip restoration.)
  if (vault && vault.size > 0) {
    const type = upstreamRes.headers.get('content-type') ?? ''
    const body = await upstreamRes.text()
    const restored = /event-stream/i.test(type) ? restoreStream(body, vault) : detokenize(body, vault, /json/i.test(type))
    res.writeHead(upstreamRes.status, outHeaders)
    res.end(restored)
    return
  }

  res.writeHead(upstreamRes.status, outHeaders)
  if (upstreamRes.body) {
    // Stop reading upstream the moment the client goes away, rather than
    // draining a response nobody is listening to.
    for await (const chunk of upstreamRes.body as unknown as AsyncIterable<Uint8Array>) {
      if (res.destroyed) return
      res.write(chunk)
    }
  }
  if (!res.destroyed) res.end()
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
  // Show the busiest, not everything: a page with thousands of rows is not a
  // dashboard, and it reloads every two seconds.
  const TOP = 25
  const table = (bucket: Record<string, number>): string =>
    Object.entries(bucket)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP)
      .map(([k, n]) => `<tr><td>${escapeHtml(k)}</td><td>${n}</td></tr>`)
      .join('')
  const rows = table(stats.byType)
  const siteRows = table(stats.bySite)
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
