import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\bAIza[0-9A-Za-z_-]{35}\b/g

export const gcpKey: Detector = {
  id: 'gcp_key',
  label: 'Google API key',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'AIza' + 'a'.repeat(35),
      'key=AIza' + 'SyB0'.repeat(8) + 'xyz',
      'GOOGLE_API_KEY: AIza' + '0123456789'.repeat(3) + 'abcde',
    ],
    negatives: [
      'AIza-too-short',
      'this is not a google key',
      'AIzaSy lowercase prose without a token',
    ],
  },
}
