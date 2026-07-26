import type { Finding } from './types.js'

export interface RedactOptions {
  /** Produce the placeholder for a finding. Default: `⟨redacted:${type}⟩`. */
  token?: (finding: Finding) => string
}

const severityRank: Record<Finding['severity'], number> = { critical: 0, warning: 1 }

/**
 * Pick a non-overlapping subset to redact. When findings overlap, prefer the
 * higher severity, then the longer match. Greedy over a deterministic order.
 */
function resolveOverlaps(findings: readonly Finding[]): Finding[] {
  const ordered = [...findings].sort(
    (a, b) =>
      a.start - b.start ||
      severityRank[a.severity] - severityRank[b.severity] ||
      b.end - a.end,
  )
  const kept: Finding[] = []
  let lastEnd = -1
  for (const f of ordered) {
    if (f.start < lastEnd) continue
    kept.push(f)
    lastEnd = f.end
  }
  return kept
}

/** Replace each (resolved) finding's span with a placeholder token. Pure. */
export function redact(text: string, findings: readonly Finding[], opts: RedactOptions = {}): string {
  const tokenFor = opts.token ?? ((f: Finding) => `⟨redacted:${f.type}⟩`)
  let result = ''
  let cursor = 0
  for (const f of resolveOverlaps(findings)) {
    result += text.slice(cursor, f.start) + tokenFor(f)
    cursor = f.end
  }
  return result + text.slice(cursor)
}
