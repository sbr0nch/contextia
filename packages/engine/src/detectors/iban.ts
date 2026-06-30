import type { Detector, RawMatch } from '../types.js'

const CANDIDATE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g

// ISO 7064 mod-97: move the first 4 chars to the end, map letters to numbers,
// and the whole number mod 97 must equal 1.
function mod97Valid(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0)
    const value = code >= 65 ? code - 55 : code - 48 // A-Z -> 10-35, 0-9 -> 0-9
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97
  }
  return remainder === 1
}

export const iban: Detector = {
  id: 'iban',
  label: 'IBAN',
  severity: 'warning',
  defaultEnabled: false,
  rationale: 'A checksum-valid bank account number (IBAN) — treat as personal financial data.',
  scan(text) {
    const out: RawMatch[] = []
    for (const m of text.matchAll(CANDIDATE)) {
      if (mod97Valid(m[0])) {
        const start = m.index!
        out.push({ start, end: start + m[0].length, match: m[0] })
      }
    }
    return out
  },
  fixtures: {
    positives: ['DE89370400440532013000', 'GB82WEST12345698765432', 'FR1420041010050500013M02606'],
    negatives: [
      'DE89370400440532013001', // fails mod-97
      'XX00NOTAREALIBANVALUE99', // fails mod-97
      'no iban in this sentence',
    ],
  },
}
