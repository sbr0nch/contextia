import type { Finding } from './types.js'

/** User-chosen values/patterns to always redact, on top of detected secrets. */
export interface CustomRules {
  /** Literal strings; every occurrence is flagged. */
  values: string[]
  /** Regex source strings; every match is flagged. Invalid patterns are skipped. */
  patterns: string[]
}

/**
 * Findings for the user's own sensitive data. These are always `critical` and
 * carry a stable `custom` type so callers can treat them like any other finding
 * (redact, count, log). Pure and deterministic.
 */
export function customFindings(text: string, rules: CustomRules): Finding[] {
  const out: Finding[] = []
  const add = (start: number, end: number, match: string): void => {
    out.push({
      id: `custom:${start}:${end}`,
      type: 'custom',
      label: 'Custom redaction',
      severity: 'critical',
      start,
      end,
      match,
      rationale: 'Matched a value you marked for redaction.',
    })
  }
  for (const v of rules.values) {
    if (!v) continue
    for (let i = text.indexOf(v); i !== -1; i = text.indexOf(v, i + v.length)) add(i, i + v.length, v)
  }
  for (const p of rules.patterns) {
    if (!p) continue
    let re: RegExp
    try {
      re = new RegExp(p, 'g')
    } catch {
      continue // skip an invalid user pattern rather than crash
    }
    for (const m of text.matchAll(re)) if (m[0]) add(m.index, m.index + m[0].length, m[0])
  }
  return out
}
