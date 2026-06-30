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

/** Luhn checksum — true if the digit string is Luhn-valid (e.g. a card number). */
export function luhn(digits: string): boolean {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (alt) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    alt = !alt
  }
  return sum % 10 === 0
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
