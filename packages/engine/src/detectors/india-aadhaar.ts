import type { Detector, RawMatch } from '../types.js'

// Verhoeff checksum tables (multiplication + permutation) used by Aadhaar.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

function verhoeffValid(num: string): boolean {
  let c = 0
  const digits = num.split('').reverse()
  for (let i = 0; i < digits.length; i++) {
    c = D[c]![P[i % 8]![Number(digits[i])]!]!
  }
  return c === 0
}

// Aadhaar: 12 digits (first 2-9), optionally in 4-4-4 groups, Verhoeff-valid.
// The checksum keeps a plain 12-digit number from false-positiving.
const CANDIDATE = /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/g

export const indiaAadhaar: Detector = {
  id: 'india_aadhaar',
  label: 'India Aadhaar number',
  severity: 'warning',
  defaultEnabled: false,
  rationale: 'A Verhoeff-valid Aadhaar number. Sharing national ID data with an AI assistant risks personal-data exposure.',
  scan(text) {
    const out: RawMatch[] = []
    for (const m of text.matchAll(CANDIDATE)) {
      const digits = m[0].replace(/\s/g, '')
      if (digits.length === 12 && verhoeffValid(digits)) {
        out.push({ start: m.index!, end: m.index! + m[0].length, match: m[0] })
      }
    }
    return out
  },
  fixtures: {
    positives: ['2341 2345 6783', '234123456796'],
    negatives: [
      '234123456784', // fails the Verhoeff checksum
      '1234 5678 9012', // starts with 1 (never issued)
      'order 1234 5678 placed', // too short
    ],
  },
}
