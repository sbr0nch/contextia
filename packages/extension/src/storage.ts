import type { Config, Severity } from '@sbr0nch/contextia-engine'
import { api } from './api.js'

export type Mode = 'warn' | 'auto-redact' | 'block' | 'off'

export interface Allowlist {
  values: string[]
  patterns: string[]
}

export interface Settings {
  mode: Mode
  /** null = engine defaults (criticals on, warnings off). */
  enabledDetectors: string[] | null
  severityOverrides: Record<string, Severity>
  allowlist: Allowlist
  /** The user's own values/patterns to always flag and redact. */
  redactlist: Allowlist
}

export type LogAction = 'flagged' | 'redacted' | 'allowed' | 'blocked'

/** A detection record. It deliberately never stores the matched secret value. */
export interface LogEntry {
  ts: number
  site: string
  type: string
  severity: Severity
  action: LogAction
}

export interface Stats {
  caught: number
  redacted: number
  leaked: number
  allowed: number
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'warn',
  enabledDetectors: null,
  severityOverrides: {},
  allowlist: { values: [], patterns: [] },
  redactlist: { values: [], patterns: [] },
}

const SETTINGS_KEY = 'settings'
const LOG_KEY = 'log'
const STATS_KEY = 'stats'
const LOG_MAX = 200

export async function getSettings(): Promise<Settings> {
  const r = await api.storage.local.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...((r[SETTINGS_KEY] as Partial<Settings>) ?? {}) }
}

export async function setSettings(settings: Settings): Promise<void> {
  await api.storage.local.set({ [SETTINGS_KEY]: settings })
}

/** Map persisted settings onto the engine's Config. */
export function toEngineConfig(s: Settings): Config {
  return {
    ...(s.enabledDetectors ? { enabledDetectors: s.enabledDetectors } : {}),
    severityOverrides: s.severityOverrides,
    allowlist: { values: s.allowlist.values, patterns: s.allowlist.patterns },
  }
}

export async function getLog(): Promise<LogEntry[]> {
  const r = await api.storage.local.get(LOG_KEY)
  return (r[LOG_KEY] as LogEntry[]) ?? []
}

export async function appendLog(entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return
  const current = await getLog()
  const next = [...entries, ...current].slice(0, LOG_MAX)
  await api.storage.local.set({ [LOG_KEY]: next })
}

export async function getStats(): Promise<Stats> {
  const r = await api.storage.local.get(STATS_KEY)
  return { caught: 0, redacted: 0, leaked: 0, allowed: 0, ...(r[STATS_KEY] as Partial<Stats> | undefined) }
}

export async function bumpStats(patch: Partial<Stats>): Promise<void> {
  const s = await getStats()
  await api.storage.local.set({
    [STATS_KEY]: {
      caught: s.caught + (patch.caught ?? 0),
      redacted: s.redacted + (patch.redacted ?? 0),
      leaked: s.leaked + (patch.leaked ?? 0),
      allowed: s.allowed + (patch.allowed ?? 0),
    },
  })
}

export async function clearAll(): Promise<void> {
  await api.storage.local.remove([LOG_KEY, STATS_KEY])
}
