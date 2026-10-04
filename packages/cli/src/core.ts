import { detect, detectors, MAX_INPUT, type Config, type Finding } from '@sbr0nch/contextia-engine'

export interface ScanOptions {
  all?: boolean
}

/** Default = critical detectors only; --all turns on the warning detectors too. */
export function configFor(opts: ScanOptions): Config {
  return opts.all ? { enabledDetectors: detectors.map((d) => d.id) } : {}
}

/** 1-based line and column for a character offset. */
export function lineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++
      lineStart = i + 1
    }
  }
  return { line, col: offset - lineStart + 1 }
}

/**
 * A short preview that does not give the secret away. It ends up in CI logs and
 * --json output, so it shows at most a fifth of the value: nothing up to 10
 * characters, 2 up to 19, 4 up to 39, then 8.
 */
export function maskValue(v: string): string {
  if (v.length <= 10) return '•'.repeat(Math.max(4, v.length))
  const shown = v.length < 20 ? 2 : v.length < 40 ? 4 : 8
  const head = Math.ceil(shown / 2)
  return `${v.slice(0, head)}…${v.slice(v.length - (shown - head))}`
}

// A window owns the matches that start in its middle, and sees HALF characters on each
// side of any of them. So every match up to HALF long is seen whole, with its left
// context, by exactly one window: nothing is cut, nothing is counted twice. (The
// first version overlapped windows by 65,536 and kept what each found: a private key
// longer than that was missed, and a token that straddled a window start was reported
// again from its tail.)
const HALF = 250_000

/**
 * Scan text of any length. The engine reads at most MAX_INPUT characters per
 * call, so a longer file is scanned in overlapping windows. The CLI used to scan
 * the first MAX_INPUT and report "0 secrets found" for a secret in the tail.
 * A single match longer than 250,000 characters is not found.
 */
export function detectAll(text: string, config: Config): Finding[] {
  if (text.length <= MAX_INPUT) return detect(text, config)
  const out: Finding[] = []
  for (let off = 0; ; off += MAX_INPUT - 2 * HALF) {
    const last = off + MAX_INPUT >= text.length
    const lo = off === 0 ? 0 : off + HALF
    const hi = last ? Infinity : off + MAX_INPUT - HALF
    for (const f of detect(text.slice(off, off + MAX_INPUT), config)) {
      const start = f.start + off
      if (start < lo || start >= hi) continue
      const end = f.end + off
      out.push({ ...f, id: `${f.type}:${start}:${end}`, start, end })
    }
    if (last) break
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end || a.type.localeCompare(b.type))
}

export interface LocatedFinding extends Finding {
  line: number
  col: number
}

export function locate(text: string, findings: Finding[]): LocatedFinding[] {
  return findings.map((f) => {
    const { line, col } = lineCol(text, f.start)
    return { ...f, line, col }
  })
}
