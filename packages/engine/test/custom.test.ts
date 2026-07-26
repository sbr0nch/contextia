import { describe, it, expect } from 'vitest'
import { customFindings, redact } from '../src/index.js'

describe('customFindings', () => {
  it('flags every occurrence of a literal value', () => {
    const fs = customFindings('id 42 and id 42 again', { values: ['42'], patterns: [] })
    expect(fs).toHaveLength(2)
    expect(fs.every((f) => f.type === 'custom' && f.severity === 'critical')).toBe(true)
  })

  it('flags regex pattern matches', () => {
    const fs = customFindings('ACME-001 ACME-002', { values: [], patterns: ['ACME-\\d+'] })
    expect(fs.map((f) => f.match)).toEqual(['ACME-001', 'ACME-002'])
  })

  it('skips empty values, empty patterns, and invalid patterns without throwing', () => {
    const fs = customFindings('anything', { values: [''], patterns: ['', '('] })
    expect(fs).toEqual([])
  })

  it('produces findings redact() can apply', () => {
    const fs = customFindings('project Zephyr ships', { values: ['Zephyr'], patterns: [] })
    expect(redact('project Zephyr ships', fs)).toBe('project ⟨redacted:custom⟩ ships')
  })
})
