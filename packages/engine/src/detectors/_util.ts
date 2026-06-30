import type { RawMatch } from '../types.js'

/** Collect every match of a global regex as raw spans. */
export function matchAll(re: RegExp, text: string): RawMatch[] {
  const out: RawMatch[] = []
  for (const m of text.matchAll(re)) {
    const start = m.index!
    out.push({ start, end: start + m[0].length, match: m[0] })
  }
  return out
}

/** Shannon entropy (bits per character) of a string. */
export function shannon(s: string): number {
  const freq = new Map<string, number>()
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let h = 0
  for (const count of freq.values()) {
    const p = count / s.length
    h -= p * Math.log2(p)
  }
  return h
}
