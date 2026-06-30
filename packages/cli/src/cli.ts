import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { detect, redact, detectors, type Finding } from '@sbr0nch/contextia-engine'
import { configFor, locate, maskValue, type ScanOptions } from './core.js'
import { startProxy, createProxyServer, type ProxyMode, type CustomRules } from './proxy.js'

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
        rows.push({ file: name, line: f.line, col: f.col, type: f.type, severity: f.severity, preview: maskValue(f.match), rationale: f.rationale })
      } else {
        const loc = paint(COLOR.dim, `${name}:${f.line}:${f.col}`)
        const sev = paint(f.severity === 'critical' ? COLOR.critical : COLOR.warning, f.severity.padEnd(8))
        process.stdout.write(`${loc}  ${sev} ${f.type.padEnd(24)} ${maskValue(f.match)}\n`)
        if (flags.has('--explain')) process.stdout.write(`${paint(COLOR.dim, '          why:')} ${f.rationale}\n`)
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

function validMode(mode: string): mode is ProxyMode {
  if (['warn', 'redact', 'block'].includes(mode)) return true
  process.stderr.write(`contextia: invalid --mode '${mode}' (use warn | redact | block)\n`)
  process.exit(2)
}

function parseCustom(ruleFile: string | undefined): CustomRules | undefined {
  if (!ruleFile) return undefined
  try {
    const parsed = JSON.parse(readFileSync(ruleFile, 'utf8')) as { values?: unknown; patterns?: unknown }
    return {
      values: Array.isArray(parsed.values) ? (parsed.values as string[]) : [],
      patterns: Array.isArray(parsed.patterns) ? (parsed.patterns as string[]) : [],
    }
  } catch {
    process.stderr.write(`contextia: cannot read --redact-file ${ruleFile} (expected JSON { "values": [], "patterns": [] })\n`)
    process.exit(2)
  }
}

function findingLogger(mode: ProxyMode): (f: Finding[], info: { path: string }) => void {
  return (f, info) => {
    const verb = mode === 'block' ? 'BLOCKED' : mode === 'redact' ? 'redacted' : 'flagged'
    const types = [...new Set(f.map((x) => x.type))].join(', ')
    process.stderr.write(`contextia: ${verb} ${f.length} secret(s) on ${info.path} — ${types}\n`)
  }
}

function cmdProxy(): void {
  const mode = flagValue('--mode') ?? 'redact'
  if (!validMode(mode)) return
  startProxy({
    port: Number(flagValue('--port') ?? '8787'),
    mode,
    upstream: flagValue('--upstream'),
    all: flags.has('--all'),
    custom: parseCustom(flagValue('--redact-file')),
    reversible: flags.has('--reversible'),
    onFinding: findingLogger(mode),
  })
}

// `contextia run [opts] -- <cmd>`: start the proxy on an ephemeral port, point the
// child's ANTHROPIC/OPENAI base URL at it, and run the agent — no manual setup.
function cmdRun(): void {
  const sep = argv.indexOf('--')
  if (sep === -1 || sep === argv.length - 1) {
    process.stderr.write('contextia: usage: contextia run [--mode m] [--all] [--reversible] [--redact-file p] -- <command> [args...]\n')
    process.exit(2)
  }
  const left = argv.slice(1, sep)
  const cmd = argv[sep + 1] as string
  const cmdArgs = argv.slice(sep + 2)
  const lflag = (n: string): boolean => left.includes(n)
  const lval = (n: string): string | undefined => {
    const eq = left.find((a) => a.startsWith(n + '='))
    if (eq) return eq.slice(n.length + 1)
    const i = left.indexOf(n)
    const next = left[i + 1]
    return i >= 0 && next !== undefined && !next.startsWith('--') ? next : undefined
  }
  const mode = lval('--mode') ?? 'redact'
  if (!validMode(mode)) return

  const server = createProxyServer({
    port: 0,
    mode,
    upstream: lval('--upstream'),
    all: lflag('--all'),
    custom: parseCustom(lval('--redact-file')),
    reversible: lflag('--reversible'),
    onFinding: findingLogger(mode),
  })
  server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    process.stderr.write(`contextia: guarding (mode=${mode}) → ${cmd} ${cmdArgs.join(' ')}\n`)
    const child = spawn(cmd, cmdArgs, {
      stdio: 'inherit',
      env: { ...process.env, ANTHROPIC_BASE_URL: url, OPENAI_BASE_URL: url, OPENAI_API_BASE: url },
    })
    const stop = (): void => { child.kill('SIGTERM') }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    child.on('error', (e) => {
      server.close()
      process.stderr.write(`contextia: cannot launch '${cmd}': ${e.message}\n`)
      process.exit(127)
    })
    child.on('exit', (code, signal) => {
      server.close()
      process.exit(signal ? 1 : code ?? 0)
    })
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
  run -- <cmd>         Launch a command (an AI agent) with the proxy already wired
                       in — no manual base-URL setup. e.g. contextia run -- claude
  list                 List the available detectors
  version              Print the version
  help                 Show this help

Options:
  --all                Also enable the warning detectors (off by default)
  --json               (scan) machine-readable output
  --explain            (scan) print why each match was flagged
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

  # AI-DLP: wrap your agent so secrets are redacted before requests leave (one step)
  contextia run -- claude
  contextia run --mode block -- cursor              # or hard-block on a secret

  # …or run the proxy yourself and point an agent at it manually
  contextia proxy --mode redact
  ANTHROPIC_BASE_URL=http://localhost:8787 claude
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
    case 'run':
      cmdRun()
      break
    case 'list':
      cmdList()
      break
    default:
      cmdHelp()
  }
}
