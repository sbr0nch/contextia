export type Severity = 'critical' | 'warning'

export interface Finding {
  /** Unique per occurrence: `${type}:${start}:${end}`. */
  id: string
  /** The detector that produced this finding, e.g. "private_key". */
  type: string
  /** Human-readable label, e.g. "Private key block". */
  label: string
  severity: Severity
  /** Start offset (inclusive) into the scanned text, in UTF-16 code units. */
  start: number
  /** End offset (exclusive). */
  end: number
  /** The matched substring. This IS the secret — never persist it. */
  match: string
  /** Why this was flagged — safe to show/persist (contains no secret value). */
  rationale: string
}

/** A raw match from a detector, before the engine assigns identity/severity. */
export type RawMatch = Pick<Finding, 'start' | 'end' | 'match'>

export interface Detector {
  id: string
  label: string
  severity: Severity
  /** Runs unless a Config narrows the enabled set. */
  defaultEnabled: boolean
  /** Why a match matters — shown to the user. Falls back to a severity-based
   *  default when omitted. Must never contain a secret value. */
  rationale?: string
  /** Pure, deterministic: return every match in `text`. */
  scan(text: string): RawMatch[]
  /** Positives MUST match; negatives MUST NOT. Append-only — never weaken. */
  fixtures: { positives: string[]; negatives: string[] }
}

export interface Allowlist {
  /** Regex source strings; a finding whose match tests true is dropped. */
  patterns?: string[]
  /** Literal values; a finding whose match equals one of these is dropped. */
  values?: string[]
}

export interface Config {
  /** If set, only these detector ids run. If unset, every detector with
   *  defaultEnabled = true runs. */
  enabledDetectors?: string[]
  /** Override a detector's severity by id. */
  severityOverrides?: Record<string, Severity>
  allowlist?: Allowlist
}
