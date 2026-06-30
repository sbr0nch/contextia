import { readFileSync } from 'node:fs'
import { detect, redact, detectors } from '@contextia/engine'
import { configFor, locate, maskValue, type ScanOptions } from './core.js'
import { startProxy, type ProxyMode } from './proxy.js'

declare const __CONTEXTIA_VERSION__: string

// Don't crash when the reader closes the pipe early (e.g. `… | head`).
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0)
  throw err
})

const argv = process.argv.slice(2)
const command = argv[0] ?? 'help'
const flags = new Set(argv.filter((a) => a.startsWith('--')))
const paths = argv.slice(1).filter((a) => !a.startsWith('--'))
const opts: ScanOptions = { all: flags.has('--all') }

const useColor = process.stdout.isTTY && !process.env['NO_COLOR']
const COLOR = { critical: '\x1b[31m', warning: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m' }
const paint = (code: string, s: string): string => (useColor ? code + s + COLOR.reset : s)

function flagValue(name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(name + '='))
  if (eq) return eq.slice(name.length + 1)
  const i = argv.indexOf(name)
  const next = argv[i + 1]
  if (i >= 0 && next !== undefined && !next.startsWith('--')) return next
  return undefined
}

function inputs(): Array<{ name: string; text: string }> {
  if (paths.length === 0) return [{ name: '(stdin)', text: readFileSync(0, 'utf8') }]
  return paths.map((p) => ({ name: p, text: readFileSync(p, 'utf8') }))
}

function cmdScan(): void {
  const config = configFor(opts)
  const json = flags.has('--json')
  const rows: Array<Record<string, unknown>> = []
  let total = 0
  for (const { name, text } of inputs()) {
    for (const f of locate(text, detect(text, config))) {
      total++
      if (json) {
        rows.push({ file: name, line: f.line, col: f.col, type: f.type, severity: f.severity, preview: maskValue(f.match) })
      } else {
        const loc = paint(COLOR.dim, `${name}:${f.line}:${f.col}`)
        const sev = paint(f.severity === 'critical' ? COLOR.critical : COLOR.warning, f.severity.padEnd(8))
        process.stdout.write(`${loc}  ${sev} ${f.type.padEnd(24)} ${maskValue(f.match)}\n`)
      }
    }
  }
  if (json) process.stdout.write(JSON.stringify(rows, null, 2) + '\n')
  else process.stderr.write(`\n${total} secret${total === 1 ? '' : 's'} found\n`)
  process.exit(total > 0 ? 1 : 0)
}

function cmdRedact(): void {
  const config = configFor(opts)
  for (const { text } of inputs()) process.stdout.write(redact(text, detect(text, config)))
}

function cmdProxy(): void {
  const port = Number(flagValue('--port') ?? '8787')
  const mode = (flagValue('--mode') ?? 'redact') as ProxyMode
  if (!['warn', 'redact', 'block'].includes(mode)) {
    process.stderr.write(`contextia: invalid --mode '${mode}' (use warn | redact | block)\n`)
    process.exit(2)
  }
  let custom: { values: string[]; patterns: string[] } | undefined
  const ruleFile = flagValue('--redact-file')
  if (ruleFile) {
    try {
      const parsed = JSON.parse(readFileSync(ruleFile, 'utf8')) as { values?: unknown; patterns?: unknown }
      custom = {
        values: Array.isArray(parsed.values) ? (parsed.values as string[]) : [],
        patterns: Array.isArray(parsed.patterns) ? (parsed.patterns as string[]) : [],
      }
    } catch {
      process.stderr.write(`contextia: cannot read --redact-file ${ruleFile} (expected JSON { "values": [], "patterns": [] })\n`)
      process.exit(2)
    }
  }
  startProxy({
    port,
    mode,
    upstream: flagValue('--upstream'),
    all: flags.has('--all'),
    custom,
    reversible: flags.has('--reversible'),
    onFinding: (f, info) => {
      const verb = mode === 'block' ? 'BLOCKED' : mode === 'redact' ? 'redacted' : 'flagged'
      const types = [...new Set(f.map((x) => x.type))].join(', ')
      process.stderr.write(`contextia: ${verb} ${f.length} secret(s) on ${info.path} — ${types}\n`)
    },
  })
}

function cmdList(): void {
  for (const d of detectors) {
    const sev = paint(d.severity === 'critical' ? COLOR.critical : COLOR.warning, d.severity.padEnd(8))
    process.stdout.write(`${sev} ${d.id.padEnd(24)} ${d.defaultEnabled ? 'on ' : 'off'}  ${d.label}\n`)
  }
}

function cmdVersion(): void {
  process.stdout.write(`contextia ${__CONTEXTIA_VERSION__}\n`)
}

function cmdHelp(): void {
  process.stdout.write(`contextia ${__CONTEXTIA_VERSION__} — keep secrets out of AI, from the terminal

Usage:
  contextia <command> [options]

Commands:
  scan [files...]      Scan files (or stdin) for secrets; exits 1 if any are found
  redact [files...]    Print the input with secrets replaced by placeholder tokens
  proxy                Run a local proxy that scans/redacts/blocks what your AI
                       agent sends to the LLM (the AI-DLP surface for the terminal)
  list                 List the available detectors
  version              Print the version
  help                 Show this help

Options:
  --all                Also enable the warning detectors (off by default)
  --json               (scan) machine-readable output
  --mode <m>           (proxy) warn | redact | block        (default: redact)
  --port <n>           (proxy) listen port                  (default: 8787)
  --upstream <url>     (proxy) force upstream API base URL  (default: auto)
  --redact-file <p>    (proxy) JSON { "values": [], "patterns": [] } of your own
                       data to always redact, on top of detected secrets
  --reversible         (proxy, redact mode) restore the original values in the
                       LLM's response via a local vault (buffers the response)

Examples:
  contextia scan .env src/                       # check files for secrets
  git diff | contextia scan                      # check a diff in a pre-commit hook
  contextia redact server.log > clean.log        # share a log without credentials

  # AI-DLP: redact secrets before your agent's requests leave the machine
  contextia proxy --mode redact
  ANTHROPIC_BASE_URL=http://localhost:8787 claude   # point the agent at the proxy
  #   live stats at http://localhost:8787/__contextia

Everything runs locally. No network requests beyond forwarding the agent's own
request to the LLM API it was already calling.
`)
}

if (command === 'version' || flags.has('--version') || argv.includes('-v')) {
  cmdVersion()
} else {
  switch (command) {
    case 'scan':
      cmdScan()
      break
    case 'redact':
      cmdRedact()
      break
    case 'proxy':
      cmdProxy()
      break
    case 'list':
      cmdList()
      break
    default:
      cmdHelp()
  }
}
