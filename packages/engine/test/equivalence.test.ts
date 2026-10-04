import { describe, it, expect } from 'vitest'
import { detectorsById } from '../src/detectors/index.js'

// email, db_connection_string and private_key stopped being a single regex so
// they could stop being quadratic on hostile input. They must still find exactly
// what the regex they replaced found. The originals are kept here as the
// reference, and the two are compared on random text built from the fragments
// that matter to them. (Measured when the change was made: 800,000 comparisons,
// 0 differences.)
const REFERENCE: Record<string, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  db_connection_string: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]*:[^\s:@/]+@[^\s/]+/gi,
  private_key:
    /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )?PRIVATE KEY-----/g,
}

const FRAGMENTS = [
  '-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----', '-----END PRIVATE KEY-----',
  '-----END EC PRIVATE KEY-----', '-----BEGIN CERTIFICATE-----', '\n', '\r\n', ' ', 'MIIBOgIBAAJB', 'abc',
  'john.doe', '@', 'example.com', 'x.y.internal', 'a-b.c.local', '.', '-', '_', '%', '+', 'EMAIL@HOST.ORG',
  'postgres://', 'u:p@h', 'mongodb+srv://', ':', '/', '"', "'", 'https://user:pw@host/db', 'http://', '1.2.3.4',
  'é', '😀',
]

function rng(seed: number): () => number {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
}

const spans = (re: RegExp, text: string): Array<[number, number]> =>
  [...text.matchAll(re)].map((m) => [m.index!, m.index! + m[0].length])

describe('single-pass detectors find what the regex they replaced found', () => {
  for (const id of Object.keys(REFERENCE)) {
    it(id, () => {
      const next = rng(20260704)
      const det = detectorsById.get(id)!
      for (let i = 0; i < 20_000; i++) {
        let text = ''
        for (let k = 1 + Math.floor(next() * 12); k > 0; k--) text += FRAGMENTS[Math.floor(next() * FRAGMENTS.length)]
        const got = det.scan(text).map((m) => [m.start, m.end])
        expect(got, JSON.stringify(text)).toEqual(spans(REFERENCE[id]!, text))
      }
    })
  }

  it('edge: an @ with nothing before it, and a :// with no scheme before it', () => {
    expect(detectorsById.get('email')!.scan('@example.com and mail me@')).toEqual([])
    expect(detectorsById.get('db_connection_string')!.scan('://u:p@h and ://')).toEqual([])
  })

  it('internal_hostname still matches a chain up to the 127 labels DNS allows, and not past a 63-character label', () => {
    const scan = detectorsById.get('internal_hostname')!.scan
    expect(scan('db01.internal')).toHaveLength(1)
    expect(scan('a.'.repeat(100) + 'corp')).toHaveLength(1)
    expect(scan('x'.repeat(63) + '.internal')).toHaveLength(1)
    expect(scan('x'.repeat(70) + '.internal')).toHaveLength(0)
  })
})
