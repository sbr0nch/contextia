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
  it('changes how much it shows at exactly 20 and 40 characters, and always says the length', () => {
    const v = (n: number) => 'abcdefghij'.repeat(5).slice(0, n)
    expect(mask(v(11))).toBe('a\u2026a \u00b7 11 chars')
    expect(mask(v(19))).toBe('a\u2026i \u00b7 19 chars')
    expect(mask(v(20))).toBe('ab\u2026ij \u00b7 20 chars')
    expect(mask(v(39))).toBe('ab\u2026hi \u00b7 39 chars')
    expect(mask(v(40))).toBe('abcd\u2026ghij \u00b7 40 chars')
  })
})
