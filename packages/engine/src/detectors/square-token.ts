import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// Square access (sq0atp-) and OAuth (sq0csp-) tokens.
const RE = /\bsq0(?:atp|csp)-[0-9A-Za-z_-]{22,}\b/g

export const squareToken: Detector = {
  id: 'square_token',
  label: 'Square access token',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'sq0atp-' + 'a'.repeat(22),
      'sq0csp-A1b2C3d4E5f6G7h8I9j0Kl',
      'sq0atp-' + 'x'.repeat(40),
    ],
    negatives: ['sq0atp-short', 'sq0xyz-' + 'a'.repeat(22), 'a square payment link'],
  },
}
