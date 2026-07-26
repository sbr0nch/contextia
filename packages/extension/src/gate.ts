import type { Finding } from '@sbr0nch/contextia-engine'
import type { Mode } from './storage.js'

/** What the last scan of the composer produced. */
export interface ScanState {
  findings: readonly Finding[]
  /**
   * The composer was longer than the engine's input cap, so its tail was never
   * read. Not the same as "no secrets found".
   */
  truncated: boolean
}

/**
 * Whether a send must be stopped.
 *
 * Block mode treats an unread tail as unresolved. Text the engine never looked
 * at is unknown, not clean, and letting it through would break the one promise
 * this mode makes. Warn and auto-redact never stop a send.
 */
export function shouldBlockSend(state: ScanState, mode: Mode): boolean {
  if (mode !== 'block') return false
  return state.findings.length > 0 || state.truncated
}

/**
 * Whether the submit handlers have anything to do. Findings always matter (warn
 * mode records a leak); a truncated scan only matters where it blocks.
 */
export function needsAttention(state: ScanState, mode: Mode): boolean {
  return state.findings.length > 0 || shouldBlockSend(state, mode)
}
