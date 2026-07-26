import { describe, it, expect } from 'vitest'
import { redact } from '../src/redact.js'
import type { Finding } from '../src/index.js'

const mk = (over: Partial<Finding>): Finding => ({
  id: 'x',
  type: 'secret',
  label: 'Secret',
  severity: 'critical',
  start: 0,
  end: 1,
  match: 'm',
  ...over,
})

describe('redact', () => {
  it('replaces a span with the default placeholder', () => {
    const text = 'key=ABCDEF done'
    const f = mk({ type: 'aws', start: 4, end: 10, match: 'ABCDEF' })
    expect(redact(text, [f])).toBe('key=⟨redacted:aws⟩ done')
  })

  it('returns text unchanged when there are no findings', () => {
    expect(redact('nothing here', [])).toBe('nothing here')
  })

  it('supports a custom token', () => {
    const f = mk({ start: 0, end: 3, match: 'abc' })
    expect(redact('abc!', [f], { token: () => '[X]' })).toBe('[X]!')
  })

  it('redacts multiple non-overlapping spans', () => {
    const text = 'aa bb cc'
    const f1 = mk({ start: 0, end: 2, match: 'aa' })
    const f2 = mk({ start: 6, end: 8, match: 'cc' })
    expect(redact(text, [f1, f2], { token: () => '#' })).toBe('# bb #')
  })

  it('on overlap, keeps higher severity then longer match', () => {
    const text = 'XXXXXXX'
    const warning = mk({ type: 'lo', severity: 'warning', start: 1, end: 4, match: 'XXX' })
    const critical = mk({ type: 'hi', severity: 'critical', start: 0, end: 5, match: 'XXXXX' })
    // critical (start 0, len 5) wins; the overlapping warning is dropped.
    expect(redact(text, [warning, critical], { token: (f) => `<${f.type}>` })).toBe('<hi>XX')
  })

  it('on equal severity overlap, keeps the longer match', () => {
    const text = 'YYYYYY'
    const short = mk({ type: 's', start: 0, end: 2, match: 'YY' })
    const long = mk({ type: 'l', start: 0, end: 4, match: 'YYYY' })
    expect(redact(text, [short, long], { token: (f) => `<${f.type}>` })).toBe('<l>YY')
  })
})

describe('redact: overlapping spans must not leak a tail', () => {
  it('covers the union when a shorter warning starts before a longer critical', () => {
    // Regression: greedy "first start wins" kept the warning at [0,10] and
    // dropped the critical at [5,30], leaving [10,30] of the secret in clear.
    const text = 'EMAILHERE_SECRETSECRETSECRET_tail'
    const warning = mk({ type: 'email', severity: 'warning', start: 0, end: 10, match: 'EMAILHERE_' })
    const critical = mk({ type: 'aws', severity: 'critical', start: 5, end: 28, match: 'ERE_SECRETSECRETSECRET_' })
    const out = redact(text, [warning, critical], { token: (f) => `<${f.type}>` })
    expect(out).toBe('<aws>_tail')
    expect(out).not.toContain('SECRET')
  })

  it('labels a merged cluster with its highest-severity member', () => {
    const text = 'ABCDEFGHIJ'
    const warning = mk({ type: 'lo', severity: 'warning', start: 0, end: 4, match: 'ABCD' })
    const critical = mk({ type: 'hi', severity: 'critical', start: 2, end: 8, match: 'CDEFGH' })
    expect(redact(text, [warning, critical], { token: (f) => `<${f.type}>` })).toBe('<hi>IJ')
  })

  it('keeps the critical label when the critical span comes first', () => {
    const text = 'ABCDEFGHIJ'
    const critical = mk({ type: 'hi', severity: 'critical', start: 0, end: 6, match: 'ABCDEF' })
    const warning = mk({ type: 'lo', severity: 'warning', start: 3, end: 10, match: 'DEFGHIJ' })
    expect(redact(text, [critical, warning], { token: (f) => `<${f.type}>` })).toBe('<hi>')
  })

  it('labels an equal-severity cluster with its longest member', () => {
    const text = '0123456789'
    const short = mk({ type: 'short', start: 0, end: 3, match: '012' })
    const long = mk({ type: 'long', start: 1, end: 10, match: '123456789' })
    expect(redact(text, [short, long], { token: (f) => `<${f.type}>` })).toBe('<long>')
  })

  it('merges a chain of overlaps into one span', () => {
    const text = '0123456789'
    const a = mk({ type: 'a', start: 0, end: 4, match: '0123' })
    const b = mk({ type: 'b', start: 3, end: 7, match: '3456' })
    const c = mk({ type: 'c', start: 6, end: 9, match: '678' })
    expect(redact(text, [a, b, c], { token: () => '#' })).toBe('#9')
  })
})
