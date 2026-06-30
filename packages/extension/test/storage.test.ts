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
  it('stores only non-sensitive fields — never the matched secret', async () => {
    await appendLog([logEntry()])
    const log = await getLog()
    expect(Object.keys(log[0] ?? {}).sort()).toEqual(['action', 'severity', 'site', 'ts', 'type'])
    expect(JSON.stringify(log)).not.toMatch(/match|secret|value/i)
  })
})

describe('stats', () => {
  it('accumulates counters', async () => {
    await bumpStats({ caught: 2 })
    await bumpStats({ caught: 3, redacted: 1 })
    expect(await getStats()).toEqual({ caught: 5, redacted: 1, leaked: 0 })
  })
})

describe('clearAll', () => {
  it('clears log and stats but keeps settings', async () => {
    await setSettings({ ...DEFAULT_SETTINGS, mode: 'off' })
    await bumpStats({ caught: 4 })
    await appendLog([logEntry()])
    await clearAll()
    expect(await getStats()).toEqual({ caught: 0, redacted: 0, leaked: 0 })
    expect(await getLog()).toEqual([])
    expect((await getSettings()).mode).toBe('off')
  })
})
