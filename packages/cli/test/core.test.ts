import { describe, it, expect } from 'vitest'
import { detect, detectors } from '@sbr0nch/contextia-engine'
import { configFor, lineCol, maskValue, locate, detectAll } from '../src/core.js'
import { MAX_INPUT } from '@sbr0nch/contextia-engine'

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
  it('shows nothing of a short value', () => {
    expect(maskValue('abc')).toBe('••••')
    expect(maskValue('abcdefghij')).toBe('•'.repeat(10))
  })

  // The preview lands in CI logs and --json output. It used to show the first 4
  // and last 4 characters of anything over 10: 8 of the 12 characters of a
  // 12-character password, two thirds of it.
  it('never reveals more than a fifth of the value', () => {
    for (let len = 1; len <= 300; len++) {
      const shown = maskValue('x'.repeat(len)).replace(/[…•]/g, '').length
      expect(shown, `length ${len}`).toBeLessThanOrEqual(Math.floor(len / 5))
    }
  })

  it('still shows the two ends of a long value', () => {
    expect(maskValue('AKIAIOSFODNN7EXAMPLE')).toBe('AK…LE')
    expect(maskValue('abcdefghij'.repeat(5))).toBe('abcd…ghij')
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

describe('detectAll: a file longer than the engine cap is scanned to the end', () => {
  // The CLI used to scan the first MAX_INPUT characters, print a warning, and
  // exit 0 with "0 secrets found": a secret in the tail of a large log went
  // unreported, and `redact` printed it in clear.
  const KEY = 'AKIAIOSFODNN7EXAMPLE'
  const PEM = '-----BEGIN RSA PRIVATE KEY-----\n' + 'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX'.repeat(40) + '\n-----END RSA PRIVATE KEY-----'

  it('finds a secret that starts past the cap', () => {
    const text = 'x '.repeat(MAX_INPUT / 2 + 5000) + KEY
    expect(text.length).toBeGreaterThan(MAX_INPUT)
    const found = detectAll(text, {})
    expect(found.map((f) => f.type)).toEqual(['aws_access_key_id'])
    expect(text.slice(found[0]!.start, found[0]!.end)).toBe(KEY)
  })

  // Window k owns the matches that start in [k * STEP + HALF, k * STEP + HALF + STEP).
  // These are the first three ownership boundaries, where one window hands over to the next.
  const HALF = 250_000
  const STEP = MAX_INPUT - 2 * HALF
  const BOUNDARIES = [0, 1, 2].map((k) => k * STEP + MAX_INPUT - HALF)

  function withAt(total: number, pieces: Array<[number, string]>): string {
    const out: string[] = []
    let at = 0
    for (const [pos, piece] of pieces.sort((a, b) => a[0] - b[0])) {
      out.push('x '.repeat(Math.floor((pos - at) / 2)))
      at += Math.floor((pos - at) / 2) * 2
      out.push(piece)
      at += piece.length
    }
    out.push('x '.repeat(Math.ceil((total - at) / 2)))
    return out.join('')
  }

  it('finds a key at each ownership boundary and at each window edge, once each', () => {
    const spots = [...new Set([...BOUNDARIES, STEP, MAX_INPUT, STEP + MAX_INPUT])].sort((a, b) => a - b)
    for (const off of [-30, -10, -1, 0, 1]) {
      const text = withAt(3_300_000, spots.map((c) => [c + off, ` ${KEY} `] as [number, string]))
      const found = detectAll(text, {}).filter((f) => f.type === 'aws_access_key_id')
      expect(found, `offset ${off}`).toHaveLength(spots.length)
      for (const f of found) expect(text.slice(f.start, f.end)).toBe(KEY)
      expect(new Set(found.map((f) => f.start)).size).toBe(spots.length)
    }
  })

  it('does not report a variable-length value twice, or cut short, wherever it sits', () => {
    const value = 'Zk3' + 'q9Xv7'.repeat(14) // 73 characters, no placeholder shape
    for (const at of [STEP - 40, STEP, STEP + 40, BOUNDARIES[0]! - 40, BOUNDARIES[0]!, MAX_INPUT - 40, MAX_INPUT]) {
      const text = withAt(1_500_000, [[at, `\nAPI_KEY=${value}\n`]])
      const found = detectAll(text, {}).filter((f) => f.type === 'env_secret')
      expect(found.map((f) => f.match), `at ${at}`).toEqual([value])
    }
  })

  // The same token must give the same findings wherever in a large file it sits.
  it('reports a high-entropy token the same way at every position, including across a window start', () => {
    let seed = 7
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
    const token = Array.from({ length: 80 }, () => abc[(seed = (seed * 1664525 + 1013904223) % 4294967296) % 64]).join('')
    const line = `API_SECRET=${token}\n`
    const all = { enabledDetectors: detectors.map((d) => d.id) }
    const norm = (text: string) => detectAll(text, all).map((f) => `${f.type}:${text.slice(f.start, f.end)}`).sort()
    const reference = norm(withAt(1_200_000, [[100_000, line]]))
    expect(reference.length).toBeGreaterThanOrEqual(1)
    for (const at of [STEP - 80, STEP - 40, STEP, STEP + 40, BOUNDARIES[0]! - 40, BOUNDARIES[0]!, MAX_INPUT - 40, MAX_INPUT]) {
      expect(norm(withAt(1_200_000, [[at, line]])), `at ${at}`).toEqual(reference)
    }
  })

  // The contract, not the implementation: a private key of up to 200,000 characters is
  // found whole, once, wherever in a large file it starts. The grid steps across every
  // window edge and ownership boundary of any reasonable window size.
  it('finds a 200,000-character private key, whole and once, at every position of a 2.2 MB file', () => {
    const body = 'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX'.repeat(Math.ceil(200_000 / 36))
    const pem = `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`
    for (let at = 0; at + pem.length + 2 < 2_200_000; at += 83_000) {
      const text = withAt(2_200_000, [[at, ` ${pem} `]])
      const found = detectAll(text, {}).filter((f) => f.type === 'private_key')
      expect(found, `at ${at}`).toHaveLength(1)
      expect(found[0]!.match).toBe(pem)
    }
  })

  it('agrees with a plain scan below the cap', () => {
    const text = `a ${KEY} b`
    expect(detectAll(text, {}).map((f) => [f.type, f.start])).toEqual(detect(text).map((f) => [f.type, f.start]))
  })
})
