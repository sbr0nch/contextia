import type { Detector } from '../types.js'
import { matchAll, shannon } from './_util.js'

// Long base64/hex-ish tokens with high Shannon entropy. Off by default — broad
// and prone to false positives, so it is opt-in.
const TOKEN = /[A-Za-z0-9+/=_-]{20,}/g
const ENTROPY_THRESHOLD = 4.0

export const genericHighEntropy: Detector = {
  id: 'generic_high_entropy',
  label: 'High-entropy string',
  severity: 'warning',
  defaultEnabled: false,
  scan: (text) => matchAll(TOKEN, text).filter((m) => shannon(m.match) >= ENTROPY_THRESHOLD),
  fixtures: {
    positives: [
      'Z9x2Qw8pL3kF7mB1nV6cR4tY0sJ5hG2dW1eP8qA',
      'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUZ9x2Qw8p',
      'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0',
    ],
    negatives: [
      'aaaaaaaaaaaaaaaaaaaaaaaa', // long but no entropy
      'abcabcabcabcabcabcabcabc', // repeating, low entropy
      'this is just normal english prose here',
    ],
  },
}
