import { describe, it, expect } from 'vitest'
import { mask } from '../src/mask.js'

describe('mask', () => {
  it('bullets short values without revealing them', () => {
    expect(mask('abc')).toBe('••••')
    expect(mask('abcdefghij')).toBe('••••••••••')
  })
  it('previews long values without the middle', () => {
    const m = mask('AKIAIOSFODNN7EXAMPLE')
    expect(m).toBe('AK\u2026LE \u00b7 20 chars')
    expect(m).not.toContain('OSFODNN')
  })
  it('never reveals more than a fifth of the value', () => {
    for (let len = 1; len <= 300; len++) {
      const shown = mask('x'.repeat(len)).split(' \u00b7 ')[0]!.replace(/[\u2026\u2022]/g, '').length
      expect(shown, `length ${len}`).toBeLessThanOrEqual(Math.floor(len / 5))
    }
  })
})
