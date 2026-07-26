import { describe, it, expect } from 'vitest'
import { detect, sortFindings } from '../src/detect.js'
import type { Finding } from '../src/index.js'

const KEY =
  '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX\n-----END RSA PRIVATE KEY-----'

describe('detect', () => {
  it('finds a default-enabled critical detector', () => {
    const f = detect(`prefix ${KEY} suffix`)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ type: 'private_key', severity: 'critical' })
    expect(f[0]!.match).toBe(KEY)
    expect(f[0]!.id).toBe(`private_key:${f[0]!.start}:${f[0]!.end}`)
    expect(`prefix ${KEY} suffix`.slice(f[0]!.start, f[0]!.end)).toBe(KEY)
  })

  it('returns nothing for clean text', () => {
    expect(detect('just a normal sentence')).toEqual([])
  })

  it('honors an explicit enabledDetectors allowlist', () => {
    expect(detect(KEY, { enabledDetectors: [] })).toEqual([])
    expect(detect(KEY, { enabledDetectors: ['private_key'] })).toHaveLength(1)
  })

  it('applies severityOverrides', () => {
    const [f] = detect(KEY, { severityOverrides: { private_key: 'warning' } })
    expect(f!.severity).toBe('warning')
  })

  it('drops findings allowlisted by literal value', () => {
    expect(detect(KEY, { allowlist: { values: [KEY] } })).toEqual([])
  })

  it('drops findings allowlisted by pattern', () => {
    expect(detect(KEY, { allowlist: { patterns: ['BEGIN RSA PRIVATE KEY'] } })).toEqual([])
  })

  it('keeps findings when allowlist matches nothing', () => {
    expect(detect(KEY, { allowlist: { values: ['nope'], patterns: ['zzz'] } })).toHaveLength(1)
  })

  it('finds multiple disjoint matches in document order', () => {
    const f = detect(`${KEY}\n---\n${KEY}`)
    expect(f).toHaveLength(2)
    expect(f[0]!.start).toBeLessThan(f[1]!.start)
  })
})

describe('sortFindings tie-breakers', () => {
  const mk = (over: Partial<Finding>): Finding => ({
    id: 'x',
    type: 'a',
    label: 'A',
    severity: 'critical',
    start: 0,
    end: 1,
    match: 'm',
    ...over,
  })

  it('orders by start, then longer match, then type', () => {
    const sorted = sortFindings([
      mk({ type: 'b', start: 5, end: 6 }),
      mk({ type: 'a', start: 0, end: 2 }),
      mk({ type: 'z', start: 0, end: 10 }),
      mk({ type: 'a', start: 0, end: 2 }),
    ])
    expect(sorted.map((f) => [f.start, f.end, f.type])).toEqual([
      [0, 10, 'z'], // same start, longest first
      [0, 2, 'a'], // then by type asc
      [0, 2, 'a'],
      [5, 6, 'b'],
    ])
  })
})
