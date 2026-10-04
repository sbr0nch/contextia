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

// A match is never longer than this, so a window that overlaps the next by this
// much sees every match that the cut splits, whole, in the next window.
const OVERLAP = 65_536

/**
 * Scan text of any length. The engine reads at most MAX_INPUT characters per
 * call, so a longer file is scanned in overlapping windows. The CLI used to scan
 * the first MAX_INPUT and report "0 secrets found" for a secret in the tail.
 */
export function detectAll(text: string, config: Config): Finding[] {
  if (text.length <= MAX_INPUT) return detect(text, config)
  const found = new Map<string, Finding>()
  for (let off = 0; ; off += MAX_INPUT - OVERLAP) {
    const win = text.slice(off, off + MAX_INPUT)
    const last = off + MAX_INPUT >= text.length
    for (const f of detect(win, config)) {
      // A match touching the cut may be cut short; the next window has it whole.
      if (!last && f.end === win.length) continue
      const start = f.start + off
      const end = f.end + off
      const id = `${f.type}:${start}:${end}`
      if (!found.has(id)) found.set(id, { ...f, id, start, end })
    }
    if (last) break
  }
  return [...found.values()].sort((a, b) => a.start - b.start || b.end - a.end || a.type.localeCompare(b.type))
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
