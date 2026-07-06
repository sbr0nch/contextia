import type { Detector, RawMatch } from '../types.js'

// US Social Security Number: 3-2-4 digits, dash- or space-separated. Beyond the
// shape we reject the ranges the SSA never issues (area 000/666/900+, group 00,
// serial 0000), which keeps a plain 9-digit dashed number from false-positiving.
const CANDIDATE = /\b(\d{3})[- ](\d{2})[- ](\d{4})\b/g

function isValidSsn(area: string, group: string, serial: string): boolean {
  const a = Number(area)
  if (a === 0 || a === 666 || a >= 900) return false
  if (Number(group) === 0 || Number(serial) === 0) return false
  return true
}

export const usSsn: Detector = {
  id: 'us_ssn',
  label: 'US Social Security Number',
  severity: 'warning',
  defaultEnabled: false,
  rationale: 'A structurally valid US SSN. Sharing it with an AI assistant risks exposing personal identity data.',
  scan(text) {
    const out: RawMatch[] = []
    for (const m of text.matchAll(CANDIDATE)) {
      if (!isValidSsn(m[1]!, m[2]!, m[3]!)) continue
      const start = m.index!
      out.push({ start, end: start + m[0].length, match: m[0] })
    }
    return out
  },
  fixtures: {
    positives: ['123-45-6789', '078-05-1120', '536 90 4399'],
    negatives: [
      '000-12-3456', // area 000 is never issued
      '666-12-3456', // area 666 is never issued
      '900-12-3456', // area 900+ is never issued (ITIN space)
      '123-00-6789', // group 00
      '123-45-0000', // serial 0000
      'call 123-456-7890', // phone shape, not 3-2-4
    ],
  },
}
