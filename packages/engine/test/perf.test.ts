import { describe, it, expect } from 'vitest'
import { detect } from '../src/detect.js'

// Coarse guards, not microbenchmarks: they exist to catch a catastrophic
// regression (e.g. an O(n^2) or backtracking regex would take seconds on 256 KB),
// not to assert a tight millisecond figure. The first detect() compiles every
// regex and warms the JIT, so we warm up once before timing and keep the ceiling
// generous enough to be stable across machines.
describe('performance budget', () => {
  it('scans 256 KB quickly', () => {
    const text = ('lorem ipsum dolor sit amet AKIAIOSFODNN7EXAMPLE ')
      .repeat(6000)
      .slice(0, 256 * 1024)
    detect(text) // warm up: compile regexes + JIT
    const t0 = performance.now()
    detect(text)
    expect(performance.now() - t0).toBeLessThan(250)
  })

  it('handles pathological input without catastrophic backtracking', () => {
    const evil = '-----BEGIN PRIVATE KEY-----' + 'A'.repeat(200_000)
    detect(evil) // warm up
    const t0 = performance.now()
    detect(evil)
    expect(performance.now() - t0).toBeLessThan(250)
  })
})
