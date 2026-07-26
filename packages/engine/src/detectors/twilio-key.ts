import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// Twilio API key SID: SK followed by 32 hex characters.
const RE = /\bSK[0-9a-f]{32}\b/g

export const twilioKey: Detector = {
  id: 'twilio_key',
  label: 'Twilio API key',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'SK' + '0123456789abcdef'.repeat(2),
      'twilio_key=SK' + 'a'.repeat(32),
      'SK' + 'deadbeef'.repeat(4),
    ],
    negatives: ['SKshort', 'SK' + 'g'.repeat(32), 'no twilio credentials here'],
  },
}
