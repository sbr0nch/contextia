import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// The 16 chars after the prefix are Base32 (A-Z, 2-7) — never 0/1/8/9. Tightening
// to the real alphabet rejects lookalikes without any liveness check (technique
// from independent public research; clean-room).
const RE = /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|A3T[A-Z2-7])[A-Z2-7]{16}\b/g

export const awsAccessKeyId: Detector = {
  id: 'aws_access_key_id',
  label: 'AWS access key ID',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'AKIAIOSFODNN7EXAMPLE',
      'aws_access_key_id = ASIAJ4ZEXAMPLE7QABCD',
      'key: AGPAIOSFODNN7EXAMPLE',
    ],
    negatives: [
      'AKIA0123456789ABCDEF', // 0/1/8/9 are not valid Base32 — not a real key id
      'akiaiosfodnn7example', // lowercase, not a key
      'no aws credentials in this sentence',
    ],
  },
}
