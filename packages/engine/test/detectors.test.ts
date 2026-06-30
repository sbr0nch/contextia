import { describe, it, expect } from 'vitest'
import { detect } from '../src/detect.js'
import { detectors } from '../src/detectors/index.js'

// Drives every detector over its own fixture corpus. This both documents intent
// and keeps each detector's scan() covered.
describe('detector fixtures', () => {
  for (const d of detectors) {
    describe(d.id, () => {
      it.each(d.fixtures.positives)('matches positive #%#', (pos) => {
        expect(detect(pos, { enabledDetectors: [d.id] }).some((f) => f.type === d.id)).toBe(true)
      })
      it.each(d.fixtures.negatives)('rejects negative #%#', (neg) => {
        expect(detect(neg, { enabledDetectors: [d.id] }).some((f) => f.type === d.id)).toBe(false)
      })
    })
  }
})

describe('input cap', () => {
  const key = '-----BEGIN PRIVATE KEY-----\nMIICexample\n-----END PRIVATE KEY-----'
  const overCap = 'x'.repeat(1_000_001)

  it('does not scan past the 1 MB cap', () => {
    expect(detect(overCap + key)).toEqual([])
  })
  it('scans content within the cap', () => {
    expect(detect(key + overCap)).toHaveLength(1)
  })
})
