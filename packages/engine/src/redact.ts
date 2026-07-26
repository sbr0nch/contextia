import type { Finding } from './types.js'

export interface RedactOptions {
  /** Produce the placeholder for a finding. Default: `⟨redacted:${type}⟩`. */
  token?: (finding: Finding) => string
}

const severityRank: Record<Finding['severity'], number> = { critical: 0, warning: 1 }

/** The finding that names a cluster: highest severity, then longest match. */
function representative(a: Finding, b: Finding): Finding {
  if (severityRank[a.severity] !== severityRank[b.severity]) {
    return severityRank[a.severity] < severityRank[b.severity] ? a : b
  }
  return b.end - b.start > a.end - a.start ? b : a
}

interface Cluster {
  start: number
  end: number
  pick: Finding
}

/**
 * Collapse overlapping findings into clusters covering the union of their spans.
 *
 * Redacting the union rather than picking one winner is what keeps a partially
 * overlapping secret from surviving: a short warning at [0,20] overlapping a
 * critical at [15,60] must not leave [20,60] in clear. The cluster is labelled
 * with its highest-severity, then longest, member.
 */
function clusterOverlaps(findings: readonly Finding[]): Cluster[] {
  const ordered = [...findings].sort(
    (a, b) => a.start - b.start || severityRank[a.severity] - severityRank[b.severity] || b.end - a.end,
  )
  const out: Cluster[] = []
  for (const f of ordered) {
    const last = out[out.length - 1]
    if (last && f.start < last.end) {
      last.end = Math.max(last.end, f.end)
      last.pick = representative(last.pick, f)
      continue
    }
    out.push({ start: f.start, end: f.end, pick: f })
  }
  return out
}

/** Replace each (clustered) finding's span with a placeholder token. Pure. */
export function redact(text: string, findings: readonly Finding[], opts: RedactOptions = {}): string {
  const tokenFor = opts.token ?? ((f: Finding) => `⟨redacted:${f.type}⟩`)
  let result = ''
  let cursor = 0
  for (const c of clusterOverlaps(findings)) {
    result += text.slice(cursor, c.start) + tokenFor(c.pick)
    cursor = c.end
  }
  return result + text.slice(cursor)
}
