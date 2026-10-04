import { describe, it, expect } from 'vitest'
import { detect, detectDetailed, MAX_INPUT } from '../src/detect.js'
import { redact } from '../src/redact.js'
import { customFindings } from '../src/custom.js'
import { detectors, detectorsById } from '../src/detectors/index.js'
import { luhn, shannon } from '../src/detectors/_util.js'
import type { Finding } from '../src/index.js'

// Laws added after mutation testing the engine core: 191 small rewrites of
// detect, redact, custom and the shared helpers (a < turned into <=, a - into a +)
// and 36 of them went unnoticed, with 100% line coverage. Each test below pins
// the behaviour one of those survivors was free to change.

const KEY = 'AKIAIOSFODNN7EXAMPLE'
const pad = (n: number): string => 'x '.repeat(Math.ceil(n / 2)).slice(0, n)

describe('the input cap is exact', () => {
  it('a text of exactly MAX_INPUT is fully scanned; one character more is truncated', () => {
    const exact = pad(MAX_INPUT - KEY.length - 1) + ' ' + KEY
    expect(exact.length).toBe(MAX_INPUT)
    const a = detectDetailed(exact)
    expect(a.truncated).toBe(false)
    expect(a.scannedLength).toBe(MAX_INPUT)
    expect(a.findings).toHaveLength(1)

    const over = exact + ' '
    const b = detectDetailed(over)
    expect(b.truncated).toBe(true)
    expect(b.scannedLength).toBe(MAX_INPUT)
    expect(b.findings).toHaveLength(1) // the key ends at the cap, so it is still read
  })

  it('a secret that starts before the cap and ends after it is not reported, whole or in part', () => {
    const text = pad(MAX_INPUT - 10) + KEY
    expect(detect(text)).toEqual([])
    expect(detectDetailed(text).truncated).toBe(true)
  })

  it('findings of a truncated scan point inside the text', () => {
    const text = KEY + ' ' + pad(MAX_INPUT)
    for (const f of detect(text)) expect(text.slice(f.start, f.end)).toBe(f.match)
  })
})

describe('what a finding says about itself', () => {
  it('uses the detector’s own rationale when it has one', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nMIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAw\n-----END PRIVATE KEY-----'
    const f = detect(pem).find((x) => x.type === 'private_key')!
    expect(f.rationale).toBe(detectorsById.get('private_key')!.rationale)
  })

  it('falls back to a rationale by severity, which names the label and never the value', () => {
    const noRationale = detectors.find((d) => d.rationale === undefined && d.defaultEnabled)!
    const sample = noRationale.fixtures.positives[0]!
    const asCritical = detect(sample, { enabledDetectors: [noRationale.id], severityOverrides: { [noRationale.id]: 'critical' } })[0]!
    const asWarning = detect(sample, { enabledDetectors: [noRationale.id], severityOverrides: { [noRationale.id]: 'warning' } })[0]!
    expect(asCritical.rationale).toBe(`${noRationale.label} looks like a live credential; sharing it with an AI assistant could leak access.`)
    expect(asWarning.rationale).toBe(`${noRationale.label} may be sensitive; review before sending.`)
    expect(asCritical.rationale).not.toContain(asCritical.match)
  })
})

describe('every detector reports spans that point at its own match', () => {
  for (const d of detectors) {
    it(d.id, () => {
      for (const sample of d.fixtures.positives) {
        const found = detect(sample, { enabledDetectors: [d.id] })
        expect(found.length, sample).toBeGreaterThan(0)
        for (const f of found) {
          expect(f.start).toBeGreaterThanOrEqual(0)
          expect(f.end).toBeGreaterThan(f.start)
          expect(sample.slice(f.start, f.end), `${d.id} on ${JSON.stringify(sample)}`).toBe(f.match)
        }
      }
    })
  }
})

describe('luhn and shannon', () => {
  it('accepts valid numbers and refuses a changed digit, a non-digit and a swapped pair', () => {
    // each of these would pass if a character that is not a digit were counted as one
    for (const bad of ['00:', '03 ', '04x', '05a', '06-', '0 2']) expect(luhn(bad), bad).toBe(false)
    for (const ok of ['4111111111111111', '5500005555555559', '378282246310005', '79927398713']) expect(luhn(ok), ok).toBe(true)
    for (const bad of ['4111111111111112', '5500005555555558', '79927398710', '4111 1111 1111 1111', '41111111x1111111', 'abcdefghijklmnop', '4111111111111111a']) {
      expect(luhn(bad), bad).toBe(false)
    }
    expect(luhn('0')).toBe(true)
    expect(luhn('18')).toBe(true) // 8 + (1 doubled = 2) = 10
    expect(luhn('19')).toBe(false)
    expect(luhn('59')).toBe(true) // 9 doubled is 18, minus 9 is 9
  })

  it('computes entropy in bits per character', () => {
    expect(shannon('aaaa')).toBe(0)
    expect(shannon('abab')).toBe(1)
    expect(shannon('abcd')).toBe(2)
    expect(shannon('aabc')).toBeCloseTo(1.5, 10)
  })
})

describe('customFindings has a stable shape', () => {
  it('reports id, label, rationale, severity and a span that slices back to the match', () => {
    const text = 'Zephyr and ticket 42-7 and Zephyr'
    const found = customFindings(text, { values: ['Zephyr'], patterns: ['\\d+-\\d+'] })
    expect(found.map((f) => f.id)).toEqual(['custom:0:6', 'custom:27:33', 'custom:18:22'])
    for (const f of found) {
      expect(text.slice(f.start, f.end)).toBe(f.match)
      expect(f.type).toBe('custom')
      expect(f.label).toBe('Custom redaction')
      expect(f.severity).toBe('critical')
      expect(f.rationale).toBe('Matched a value you marked for redaction.')
    }
  })

  it('ignores an empty value, an empty pattern and a pattern that does not compile', () => {
    expect(customFindings('abc', { values: [''], patterns: ['', '('] })).toEqual([])
  })
})

describe('redact picks and joins spans in a fixed way', () => {
  const f = (type: string, severity: Finding['severity'], start: number, end: number): Finding => ({
    id: `${type}:${start}:${end}`, type, label: type, severity, start, end, match: 'm'.repeat(end - start), rationale: '',
  })
  const text = 'a'.repeat(60)

  it('names an overlap by its higher severity, whichever came first', () => {
    expect(redact(text, [f('warn', 'warning', 0, 20), f('crit', 'critical', 10, 30)])).toContain('⟨redacted:crit⟩')
    expect(redact(text, [f('crit', 'critical', 0, 20), f('warn', 'warning', 10, 30)])).toContain('⟨redacted:crit⟩')
  })

  it('at equal severity, names it by the longer span, whichever came first', () => {
    expect(redact(text, [f('short', 'critical', 0, 12), f('long', 'critical', 5, 30)])).toContain('⟨redacted:long⟩')
    expect(redact(text, [f('long', 'critical', 0, 25), f('short', 'critical', 10, 20)])).toContain('⟨redacted:long⟩')
  })

  it('at equal severity, a longer span wins even when both sit far from the start of the text', () => {
    expect(redact(text, [f('short', 'critical', 20, 30), f('long', 'critical', 25, 50)])).toContain('⟨redacted:long⟩')
    expect(redact(text, [f('long', 'critical', 25, 50), f('short', 'critical', 20, 30)])).toContain('⟨redacted:long⟩')
  })

  it('at equal severity and length, names it by the span that starts first', () => {
    expect(redact(text, [f('second', 'critical', 5, 15), f('first', 'critical', 0, 10)])).toContain('⟨redacted:first⟩')
  })

  it('at the same start, sorts critical before warning, then the longer span', () => {
    expect(redact(text, [f('warn', 'warning', 0, 20), f('crit', 'critical', 0, 10)])).toBe('⟨redacted:crit⟩' + 'a'.repeat(40))
    expect(redact(text, [f('b', 'critical', 0, 10), f('a', 'critical', 0, 20)])).toBe('⟨redacted:a⟩' + 'a'.repeat(40))
  })

  it('keeps two spans that touch as two tokens, and joins two that overlap by one character', () => {
    expect(redact(text, [f('one', 'critical', 0, 10), f('two', 'critical', 10, 20)])).toBe('⟨redacted:one⟩⟨redacted:two⟩' + 'a'.repeat(40))
    expect(redact(text, [f('one', 'critical', 0, 10), f('two', 'critical', 9, 20)])).toBe('⟨redacted:two⟩' + 'a'.repeat(40))
  })
})
