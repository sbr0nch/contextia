import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|A3T[A-Z0-9])[A-Z0-9]{16}\b/g

export const awsAccessKeyId: Detector = {
  id: 'aws_access_key_id',
  label: 'AWS access key ID',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'AKIAIOSFODNN7EXAMPLE',
      'aws_access_key_id = ASIAJEXAMPLE7SIGNIN1',
      'key: AGPAIOSFODNN7EXAMPLE',
    ],
    negatives: [
      'AKIA123', // too short
      'akiaiosfodnn7example', // lowercase, not a key
      'no aws credentials in this sentence',
    ],
  },
}
