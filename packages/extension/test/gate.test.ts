import { describe, it, expect } from 'vitest'
import { shouldBlockSend, needsAttention } from '../src/gate.js'
import type { Finding } from '@sbr0nch/contextia-engine'

const finding = (): Finding => ({
  id: 'aws:0:20',
  type: 'aws_access_key_id',
  label: 'AWS access key id',
  severity: 'critical',
  start: 0,
  end: 20,
  match: 'AKIAIOSFODNN7EXAMPLE',
  rationale: 'test',
})

const clean = { findings: [], truncated: false }
const withSecret = { findings: [finding()], truncated: false }
// Nothing flagged, but the composer was longer than the engine could read.
const unread = { findings: [], truncated: true }

describe('shouldBlockSend', () => {
  it('stops a send in Block mode when a secret is present', () => {
    expect(shouldBlockSend(withSecret, 'block')).toBe(true)
  })

  it('stops a send in Block mode when part of the composer went unscanned', () => {
    // The regression this guards: an unread tail used to read as "clean", so
    // Block mode waved through text it had never looked at.
    expect(shouldBlockSend(unread, 'block')).toBe(true)
  })

  it('allows a send in Block mode only when the whole text was read and is clean', () => {
    expect(shouldBlockSend(clean, 'block')).toBe(false)
  })

  it('never stops a send outside Block mode', () => {
    for (const mode of ['warn', 'auto-redact', 'off'] as const) {
      expect(shouldBlockSend(withSecret, mode)).toBe(false)
      expect(shouldBlockSend(unread, mode)).toBe(false)
    }
  })
})

describe('needsAttention', () => {
  it('is true whenever something was flagged, in every mode', () => {
    for (const mode of ['warn', 'auto-redact', 'block', 'off'] as const) {
      expect(needsAttention(withSecret, mode)).toBe(true)
    }
  })

  it('is true for an unread tail only where it blocks', () => {
    expect(needsAttention(unread, 'block')).toBe(true)
    expect(needsAttention(unread, 'warn')).toBe(false)
  })

  it('is false for a clean, fully scanned composer', () => {
    expect(needsAttention(clean, 'block')).toBe(false)
  })
})
