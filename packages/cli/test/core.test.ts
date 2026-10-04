import { describe, it, expect } from 'vitest'
import { detect } from '@sbr0nch/contextia-engine'
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

  // Window k covers [k * STEP, k * STEP + MAX_INPUT). These are the ends of the first three.
  const STEP = MAX_INPUT - 65_536
  const CUTS = [MAX_INPUT, STEP + MAX_INPUT, 2 * STEP + MAX_INPUT]

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

  it('finds a key that straddles each of the first three cuts, once each', () => {
    for (const off of [-30, -10, -1]) {
      const text = withAt(3_300_000, CUTS.map((c) => [c + off, ` ${KEY} `] as [number, string]))
      const found = detectAll(text, {}).filter((f) => f.type === 'aws_access_key_id')
      expect(found.map((f) => text.slice(f.start, f.end)), `offset ${off}`).toEqual([KEY, KEY, KEY])
      expect(new Set(found.map((f) => f.start)).size).toBe(3)
    }
  })

  it('does not report a variable-length value twice when the cut shortens it', () => {
    const value = 'Zk3' + 'q9Xv7'.repeat(14) // 73 characters, no placeholder shape
    for (const off of [-60, -30, -10]) {
      const text = withAt(1_500_000, [[MAX_INPUT + off, `\nAPI_KEY=${value}\n`]])
      const found = detectAll(text, {}).filter((f) => f.type === 'env_secret')
      expect(found.map((f) => f.match), `offset ${off}`).toEqual([value])
    }
  })

  it('finds a private key that straddles the first cut, whole, once', () => {
    for (const off of [-1400, -755, -100]) {
      const text = withAt(1_200_000, [[MAX_INPUT + off, ` ${PEM} `]])
      const found = detectAll(text, {}).filter((f) => f.type === 'private_key')
      expect(found, `offset ${off}`).toHaveLength(1)
      expect(found[0]!.match).toBe(PEM)
    }
  })

  it('agrees with a plain scan below the cap', () => {
    const text = `a ${KEY} b`
    expect(detectAll(text, {}).map((f) => [f.type, f.start])).toEqual(detect(text).map((f) => [f.type, f.start]))
  })
})
