import { readFileSync } from 'node:fs'
import { detect, redact, detectors } from '@contextia/engine'
import { configFor, locate, maskValue, type ScanOptions } from './core.js'

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

function cmdList(): void {
  for (const d of detectors) {
    const sev = paint(d.severity === 'critical' ? COLOR.critical : COLOR.warning, d.severity.padEnd(8))
    process.stdout.write(`${sev} ${d.id.padEnd(24)} ${d.defaultEnabled ? 'on ' : 'off'}  ${d.label}\n`)
  }
}

function cmdHelp(): void {
  process.stdout.write(`contextia — detect secrets in text, from the terminal

Usage:
  contextia scan [files...] [--all] [--json]   Scan files (or stdin); exit 1 if any secret is found
  contextia redact [files...] [--all]          Print the input with secrets replaced by tokens
  contextia list                               List the available detectors
  contextia help                               Show this help

Examples:
  contextia scan .env config.yml
  git diff | contextia scan
  contextia redact server.log > server.redacted.log

By default only critical detectors run; --all also enables the warning detectors.
Everything runs locally. No network requests.
`)
}

switch (command) {
  case 'scan':
    cmdScan()
    break
  case 'redact':
    cmdRedact()
    break
  case 'list':
    cmdList()
    break
  default:
    cmdHelp()
}
