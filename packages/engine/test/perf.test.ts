import { describe, it, expect } from 'vitest'
import { detect } from '../src/detect.js'

describe('performance budget', () => {
  it('scans 256 KB in well under 50 ms', () => {
    const text = ('lorem ipsum dolor sit amet AKIAIOSFODNN7EXAMPLE ')
      .repeat(6000)
      .slice(0, 256 * 1024)
    const t0 = performance.now()
    detect(text)
    expect(performance.now() - t0).toBeLessThan(50)
  })

  it('handles pathological input without catastrophic backtracking', () => {
    const evil = '-----BEGIN PRIVATE KEY-----' + 'A'.repeat(200_000)
    const t0 = performance.now()
    detect(evil)
    expect(performance.now() - t0).toBeLessThan(50)
  })
})
