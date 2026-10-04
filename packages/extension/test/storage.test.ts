import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SETTINGS,
  getSettings,
  setSettings,
  toEngineConfig,
  appendLog,
  getLog,
  getStats,
  bumpStats,
  clearAll,
  logEntryFor,
  type LogEntry,
} from '../src/storage.js'

const logEntry = (over: Partial<LogEntry> = {}): LogEntry => ({
  ts: 1,
  site: 'chatgpt.com',
  type: 'aws_access_key_id',
  severity: 'critical',
  action: 'flagged',
  ...over,
})

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
  })
  it('round-trips and merges over defaults', async () => {
    await setSettings({ ...DEFAULT_SETTINGS, mode: 'block' })
    expect((await getSettings()).mode).toBe('block')
  })
})

describe('toEngineConfig', () => {
  it('omits enabledDetectors when null (engine uses its defaults)', () => {
    expect('enabledDetectors' in toEngineConfig(DEFAULT_SETTINGS)).toBe(false)
  })
  it('includes enabledDetectors when set', () => {
    const c = toEngineConfig({ ...DEFAULT_SETTINGS, enabledDetectors: ['private_key'] })
    expect(c.enabledDetectors).toEqual(['private_key'])
  })
  it('forwards the allowlist', () => {
    const c = toEngineConfig({ ...DEFAULT_SETTINGS, allowlist: { values: ['a'], patterns: ['b'] } })
    expect(c.allowlist).toEqual({ values: ['a'], patterns: ['b'] })
  })
})

describe('detections log', () => {
  it('prepends newest and caps at 200', async () => {
    for (let i = 0; i < 210; i++) await appendLog([logEntry({ type: `t${i}` })])
    const log = await getLog()
    expect(log.length).toBe(200)
    expect(log[0]?.type).toBe('t209')
  })

  // The privacy invariant: the persisted log must never carry the secret value.
  it('stores only non-sensitive fields, never the matched secret', async () => {
    await appendLog([logEntry()])
    const log = await getLog()
    expect(Object.keys(log[0] ?? {}).sort()).toEqual(['action', 'severity', 'site', 'ts', 'type'])
    expect(JSON.stringify(log)).not.toMatch(/match|secret|value/i)
  })

  // Locked at the source: even handed a finding that carries a secret, the log
  // builder drops the value by construction.
  it('logEntryFor never lets the matched secret into the record', () => {
    const secret = 'AKIA_TOTALLY_SECRET_VALUE_1234567890'
    const finding = { type: 'aws_access_key_id', severity: 'critical' as const, match: secret }
    const e = logEntryFor(finding, 'chatgpt.com', 'flagged', 1)
    expect(JSON.stringify(e)).not.toContain(secret)
    expect(Object.keys(e).sort()).toEqual(['action', 'severity', 'site', 'ts', 'type'])
  })
})

describe('stats', () => {
  it('accumulates counters', async () => {
    await bumpStats({ caught: 2 })
    await bumpStats({ caught: 3, redacted: 1 })
    await bumpStats({ allowed: 2 })
    expect(await getStats()).toEqual({ caught: 5, redacted: 1, leaked: 0, allowed: 2 })
  })
})

describe('clearAll', () => {
  it('clears log and stats but keeps settings', async () => {
    await setSettings({ ...DEFAULT_SETTINGS, mode: 'off' })
    await bumpStats({ caught: 4 })
    await appendLog([logEntry()])
    await clearAll()
    expect(await getStats()).toEqual({ caught: 0, redacted: 0, leaked: 0, allowed: 0 })
    expect(await getLog()).toEqual([])
    expect((await getSettings()).mode).toBe('off')
  })
})

describe('defaults and stored shape', () => {
  // These are the promises the privacy policy makes, as values. The extension
  // makes no network request until the user turns the local dashboard on, it only
  // warns until the user picks a stricter mode, and it adds no note to the
  // user's text unless asked.
  it('ships with every opt-in off', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      mode: 'warn',
      enabledDetectors: null,
      severityOverrides: {},
      allowlist: { values: [], patterns: [] },
      redactlist: { values: [], patterns: [] },
      signature: false,
      localStatsEnabled: false,
      localStatsUrl: '',
    })
  })

  // Settings, the log and the counters live under these three names. Renaming one
  // in a release silently resets every user's settings and history on update.
  it('keeps the storage key names that existing installs already hold', async () => {
    await setSettings({ ...DEFAULT_SETTINGS, mode: 'block' })
    await appendLog([logEntry()])
    await bumpStats({ caught: 1 })
    const stored = await chrome.storage.local.get(null)
    expect(Object.keys(stored).sort()).toEqual(['log', 'settings', 'stats'])
  })

  it('loads settings saved by an older release that knew fewer fields, filling the rest from the defaults', async () => {
    await chrome.storage.local.set({ settings: { mode: 'block', enabledDetectors: ['private_key'] } })
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, mode: 'block', enabledDetectors: ['private_key'] })
  })

  it('adds a leaked count to the total, and every counter on its own', async () => {
    await bumpStats({ caught: 1, redacted: 2, leaked: 3, allowed: 4 })
    await bumpStats({ leaked: 1 })
    expect(await getStats()).toEqual({ caught: 1, redacted: 2, leaked: 4, allowed: 4 })
  })

  it('keeps only the newest 200 log entries, newest first', async () => {
    await appendLog(Array.from({ length: 150 }, (_, i) => logEntry({ ts: i })))
    await appendLog(Array.from({ length: 150 }, (_, i) => logEntry({ ts: 1000 + i })))
    const log = await getLog()
    expect(log).toHaveLength(200)
    expect(log[0]!.ts).toBe(1000)
    expect(log[150]!.ts).toBe(0) // then the oldest batch, cut at 200 in all
    expect(log[199]!.ts).toBe(49)
  })

  it('does not write when there is nothing to append', async () => {
    await appendLog([])
    expect(await chrome.storage.local.get(null)).toEqual({})
  })
})
