import { describe, it, expect } from 'vitest'
import { detect } from '@sbr0nch/contextia-engine'
import { configFor, lineCol, maskValue, locate } from '../src/core.js'

describe('lineCol', () => {
  it('maps offsets to 1-based line/col', () => {
    const t = 'abc\ndefg\nhi'
    expect(lineCol(t, 0)).toEqual({ line: 1, col: 1 })
    expect(lineCol(t, 4)).toEqual({ line: 2, col: 1 })
    expect(lineCol(t, 6)).toEqual({ line: 2, col: 3 })
    expect(lineCol(t, 9)).toEqual({ line: 3, col: 1 })
  })
})

describe('maskValue', () => {
  it('masks short and long values without revealing the whole secret', () => {
    expect(maskValue('abc')).toBe('••••')
    expect(maskValue('AKIAIOSFODNN7EXAMPLE')).toBe('AKIA…MPLE')
  })
})

describe('configFor', () => {
  it('defaults to criticals; --all enables every detector', () => {
    expect(configFor({})).toEqual({})
    expect(configFor({ all: true }).enabledDetectors?.length).toBeGreaterThan(20)
  })
})

describe('locate', () => {
  it('annotates engine findings with line and column', () => {
    const text = 'line one\nkey AKIAIOSFODNN7EXAMPLE here'
    const found = locate(text, detect(text))
    expect(found).toHaveLength(1)
    expect(found[0]?.line).toBe(2)
    expect(found[0]?.type).toBe('aws_access_key_id')
  })
})
