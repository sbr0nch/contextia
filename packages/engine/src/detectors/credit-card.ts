import type { Detector, RawMatch } from '../types.js'
import { luhn } from './_util.js'

// 13–19 digit runs (optionally split by single spaces/dashes), then a Luhn check
// — the checksum keeps false positives near zero.
const CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g

export const creditCard: Detector = {
  id: 'credit_card',
  label: 'Credit card number',
  severity: 'warning',
  defaultEnabled: false,
  scan(text) {
    const out: RawMatch[] = []
    for (const m of text.matchAll(CANDIDATE)) {
      const digits = m[0].replace(/[ -]/g, '')
      if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
        const start = m.index!
        out.push({ start, end: start + m[0].length, match: m[0] })
      }
    }
    return out
  },
  fixtures: {
    positives: ['4242424242424242', '4111 1111 1111 1111', '5555-5555-5555-4444'],
    negatives: [
      '4242424242424241', // fails Luhn
      '4111111111111112', // fails Luhn
      'order 12345 placed today', // too short to be a card
    ],
  },
}
