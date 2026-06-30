import type { Config, Finding } from './types.js'
import { detectors } from './detectors/index.js'

function resolveEnabled(config: Config): Set<string> {
  if (config.enabledDetectors) return new Set(config.enabledDetectors)
  return new Set(detectors.filter((d) => d.defaultEnabled).map((d) => d.id))
}

function compileAllowlist(config: Config): (match: string) => boolean {
  const allow = config.allowlist
  const values = new Set(allow?.values ?? [])
  const patterns = (allow?.patterns ?? []).map((p) => new RegExp(p))
  return (match: string) => values.has(match) || patterns.some((re) => re.test(match))
}

/**
 * Deterministic order: by start offset ascending, then longer match first,
 * then detector type. Stable so identical inputs always yield identical output.
 * Exported for direct testing of the tie-breakers.
 */
export function sortFindings(findings: Finding[]): Finding[] {
  return findings.sort(
    (a, b) => a.start - b.start || b.end - a.end || a.type.localeCompare(b.type),
  )
}

export function detect(text: string, config: Config = {}): Finding[] {
  const enabled = resolveEnabled(config)
  const isAllowed = compileAllowlist(config)
  const out: Finding[] = []
  for (const d of detectors) {
    if (!enabled.has(d.id)) continue
    const severity = config.severityOverrides?.[d.id] ?? d.severity
    for (const m of d.scan(text)) {
      if (isAllowed(m.match)) continue
      out.push({
        id: `${d.id}:${m.start}:${m.end}`,
        type: d.id,
        label: d.label,
        severity,
        start: m.start,
        end: m.end,
        match: m.match,
      })
    }
  }
  return sortFindings(out)
}
