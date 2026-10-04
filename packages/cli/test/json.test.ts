import { describe, it, expect } from 'vitest'
import { indexJson, patchJson, childPath, MAX_DEPTH } from '../src/json.js'

// The reader must agree with JSON.parse about what is JSON, and find every string where
// JSON.parse says it is, because a redaction is applied to the text through those positions.
function rng(seed: number): () => number {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
}
const accepts = (t: string): boolean => {
  try {
    JSON.parse(t)
    return true
  } catch {
    return false
  }
}

const NUMBERS = ['0', '-0', '1', '-1', '10', '1.10', '0.5', '1e5', '1E+2', '1e-7', '9007199254740993', '123456789012345678901234567890', '-0.0e0']
const STRINGS = ['', 'plain', 'sp ace', 'qu"ote', 'back\\slash', 'new\nline', 'tab\t', 'nul\u0000', 'é', '日本語', '😀', 'lone\ud800', ' ', '<script>', 'AKIAIOSFODNN7EXAMPLE', '/slash/']

/** One string literal, escaped in one of several equivalent ways. */
function lit(s: string, next: () => number): string {
  let out = '"'
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    const r = next()
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (c < 32 || r < 0.1) out += c > 0xffff ? '\\u' + ((c - 0x10000 >> 10) + 0xd800).toString(16) + '\\u' + ((c - 0x10000 & 1023) + 0xdc00).toString(16) : '\\u' + c.toString(16).padStart(4, '0')
    else if (ch === '/' && r < 0.4) out += '\\/'
    else out += ch
  }
  return out + '"'
}

function gen(next: () => number, depth: number): { text: string; value: unknown } {
  const pick = <T>(a: T[]): T => a[Math.floor(next() * a.length)]!
  const sp = () => pick(['', '', ' ', '\n', '\t ', '\r\n  '])
  const r = next()
  if (depth > 4 || r < 0.3) {
    const k = next()
    if (k < 0.45) {
      const s = pick(STRINGS)
      return { text: lit(s, next), value: s }
    }
    if (k < 0.75) {
      const n = pick(NUMBERS)
      return { text: n, value: JSON.parse(n) }
    }
    const w = pick(['true', 'false', 'null'])
    return { text: w, value: JSON.parse(w) }
  }
  if (r < 0.65) {
    const items = Array.from({ length: Math.floor(next() * 4) }, () => gen(next, depth + 1))
    return { text: '[' + sp() + items.map((i) => i.text).join(sp() + ',' + sp()) + sp() + ']', value: items.map((i) => i.value) }
  }
  const entries: Array<[string, { text: string; value: unknown }]> = []
  const used = new Set<string>()
  for (let n = Math.floor(next() * 4); n > 0; n--) {
    const k = pick(STRINGS)
    if (used.has(k)) continue
    used.add(k)
    entries.push([k, gen(next, depth + 1)])
  }
  return {
    text: '{' + sp() + entries.map(([k, v]) => lit(k, next) + sp() + ':' + sp() + v.text).join(sp() + ',' + sp()) + sp() + '}',
    value: Object.fromEntries(entries.map(([k, v]) => [k, v.value])),
  }
}

function leaves(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') out.push([path, value])
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, childPath(path, i), out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) leaves(v, childPath(path, k), out)
}

describe('indexJson agrees with JSON.parse', () => {
  it('on 20,000 random documents: valid, with every string where JSON.parse puts it', () => {
    const next = rng(11)
    for (let i = 0; i < 20_000; i++) {
      const { text, value } = gen(next, 0)
      expect(accepts(text), text).toBe(true)
      const idx = indexJson(text)
      expect(idx, text).not.toBeNull()
      const found: Array<[string, string]> = []
      leaves(JSON.parse(text), '', found)
      for (const [path, str] of found) {
        const tok = idx!.strings.get(path)
        expect(tok, `${JSON.stringify(path)} in ${text}`).toBeDefined()
        expect(JSON.parse(text.slice(tok!.start, tok!.end)), text).toBe(str)
      }
      expect(idx!.strings.size).toBe(found.length)
      expect(JSON.parse(text)).toEqual(value)
    }
  })

  it('on 60,000 documents with one character deleted, replaced or inserted: the same verdict', () => {
    const next = rng(23)
    const junk = ['{', '}', '[', ']', ',', ':', '"', '\\', ' ', '0', '1', 'e', 'E', '.', '-', '+', 't', 'n', 'u', '\n', '\u0000', ' ', '﻿']
    let valid = 0
    for (let i = 0; i < 60_000; i++) {
      const { text } = gen(next, 0)
      if (!text.length) continue
      const at = Math.floor(next() * text.length)
      const mode = next()
      const bad = mode < 0.34 ? text.slice(0, at) + text.slice(at + 1) : mode < 0.67 ? text.slice(0, at) + junk[Math.floor(next() * junk.length)] + text.slice(at + 1) : text.slice(0, at) + junk[Math.floor(next() * junk.length)] + text.slice(at)
      const want = accepts(bad)
      if (want) valid++
      expect(indexJson(bad) !== null, JSON.stringify(bad)).toBe(want)
    }
    expect(valid).toBeGreaterThan(2000) // the corpus holds both kinds, not just garbage
  })

  it('on the classic corner cases', () => {
    const cases = ['', ' ', '{}', '[]', '""', '0', '-', '-0', '01', '1.', '.5', '1e', '1e+', '+1', 'NaN', 'Infinity', 'null', 'nul', 'nullx', 'true false', '[1,]', '{"a":1,}', '{"a"}', '{"a":}', "{'a':1}", '"\\x"', '"\\u12"', '"\\u12G4"', '"\n"', '"\t"', '[1 2]', '{"a":1 "b":2}', '﻿{}', ' {}', '{"a":1}}', '[[[]]]', '"\\ud800"', '"\\ud800\\udc00"', '1E400', '-1e-400', '{"":1}', '{"a":{"b":{"c":[]}}}']
    for (const c of cases) expect(indexJson(c) !== null, JSON.stringify(c)).toBe(accepts(c))
  })

  it('refuses a document nested past MAX_DEPTH, and accepts one at it', () => {
    const nest = (n: number) => '['.repeat(n) + ']'.repeat(n)
    expect(indexJson(nest(MAX_DEPTH))).not.toBeNull()
    expect(indexJson(nest(MAX_DEPTH + 2))).toBeNull()
    expect(indexJson(nest(200_000))).toBeNull() // and does not overflow the stack
  })
})

describe('keys, duplicates and paths', () => {
  it('records every key with its decoded text and position', () => {
    const text = '{"a":1,"b\\u0041":{"c":2}}'
    const idx = indexJson(text)!
    expect(idx.keys.map((k) => k.key)).toEqual(['a', 'bA', 'c'])
    for (const k of idx.keys) expect(JSON.parse(text.slice(k.start, k.end))).toBe(k.key)
  })

  it('flags a duplicate key, including one spelled with an escape, and not the same key in two objects', () => {
    expect(indexJson('{"a":1,"a":2}')!.duplicateKeys).toBe(true)
    expect(indexJson('{"a":1,"\\u0061":2}')!.duplicateKeys).toBe(true)
    expect(indexJson('{"a":{"x":1},"b":{"x":2}}')!.duplicateKeys).toBe(false)
    expect(indexJson('[{"a":1},{"a":2}]')!.duplicateKeys).toBe(false)
  })

  it('keeps paths apart even when a key holds the separator', () => {
    const idx = indexJson('{"a\\u0000b":"x","a":{"b":"y"}}')!
    expect(idx.strings.size).toBe(2)
    expect(idx.strings.has(childPath(childPath('', 'a\u0000b'), 'x'))).toBe(false)
    expect(idx.strings.has(childPath('', 'a\u0000b'))).toBe(true)
    expect(idx.strings.has(childPath(childPath('', 'a'), 'b'))).toBe(true)
  })
})

describe('patchJson changes the named strings and nothing else', () => {
  it('leaves numbers, whitespace, key order and escapes byte for byte', () => {
    const text = '{ "id" : 9007199254740993,\n  "price":1.10, "big":123456789012345678901234567890,\n  "note" : "keep\\/this" , "msg":"secret AKIA" , "n":-0.0e0 }'
    const idx = indexJson(text)!
    const out = patchJson(text, idx, new Map([[childPath('', 'msg'), 'redacted']]))
    expect(out).toBe(text.replace('"secret AKIA"', '"redacted"'))
    for (const keep of ['9007199254740993', '1.10', '123456789012345678901234567890', '-0.0e0', 'keep\\/this']) expect(out).toContain(keep)
  })

  it('applied to random documents and random strings, gives the same value JSON.parse would for a replaced tree', () => {
    const next = rng(31)
    for (let i = 0; i < 5000; i++) {
      const { text } = gen(next, 0)
      const idx = indexJson(text)!
      const found: Array<[string, string]> = []
      leaves(JSON.parse(text), '', found)
      const edits = new Map<string, string>()
      for (const [p] of found) if (next() < 0.5) edits.set(p, STRINGS[Math.floor(next() * STRINGS.length)]! + '⟨x⟩')
      const out = patchJson(text, idx, edits)
      const after: Array<[string, string]> = []
      leaves(JSON.parse(out), '', after)
      expect(after, text).toEqual(found.map(([p, v]) => [p, edits.get(p) ?? v]))
      // numbers and literals are untouched: strip every string and compare what is left
      const strip = (t: string) => t.replace(/"(?:[^"\\]|\\.)*"/g, '""')
      expect(strip(out), text).toBe(strip(text))
    }
  })

  it('renames a key by its position', () => {
    const text = '{"AKIAIOSFODNN7EXAMPLE":1,"b":2}'
    const idx = indexJson(text)!
    const out = patchJson(text, idx, new Map(), new Map([[idx.keys[0]!.start, '⟨redacted⟩']]))
    expect(out).toBe('{"⟨redacted⟩":1,"b":2}')
  })
})
