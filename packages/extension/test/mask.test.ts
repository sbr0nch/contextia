import { describe, it, expect } from 'vitest'
import { mask } from '../src/mask.js'

describe('mask', () => {
  it('bullets short values without revealing them', () => {
    expect(mask('abc')).toBe('••••')
    expect(mask('abcdefghij')).toBe('••••••••••')
  })
  it('previews long values without the middle', () => {
    const m = mask('AKIAIOSFODNN7EXAMPLE')
    expect(m).toContain('AKIA')
    expect(m).toContain('MPLE')
    expect(m).toContain('20 chars')
    expect(m).not.toContain('OSFODNN')
  })
})
