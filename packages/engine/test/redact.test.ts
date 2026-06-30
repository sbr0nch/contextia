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
