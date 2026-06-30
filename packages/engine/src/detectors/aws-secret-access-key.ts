import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// A bare 40-char base64 string is undetectable on its own. We only flag one when
// an AWS access key id is present nearby — the paired form that actually leaks.
const ACCESS_KEY_ID = /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|A3T[A-Z2-7])[A-Z2-7]{16}\b/
const SECRET = /(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/g

export const awsSecretAccessKey: Detector = {
  id: 'aws_secret_access_key',
  label: 'AWS secret access key',
  severity: 'critical',
  defaultEnabled: true,
  scan(text) {
    if (!ACCESS_KEY_ID.test(text)) return []
    return matchAll(SECRET, text)
  },
  fixtures: {
    positives: [
      'AKIAIOSFODNN7EXAMPLE secret=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      'ASIAJ4ZEXAMPLE7QABCD ' + 'a'.repeat(40),
      'AKIAIOSFODNN7EXAMPLE ' + 'Ab3dEf01'.repeat(5),
    ],
    negatives: [
      'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', // lone secret, no access key id
      'AKIAIOSFODNN7EXAMPLE is only the key id here', // id present, no secret
      'nothing sensitive at all in this text line',
    ],
  },
}
