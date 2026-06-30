import { detectors, type Config, type Finding } from '@sbr0nch/contextia-engine'

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

/** A short, safe preview — never the whole secret. */
export function maskValue(v: string): string {
  if (v.length <= 10) return '•'.repeat(Math.max(4, v.length))
  return `${v.slice(0, 4)}…${v.slice(-4)}`
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
