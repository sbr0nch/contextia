import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// (?!\w) rather than \b after a class that holds "-": \b needs a word character next, so a
// token ending in "-" was not matched whole. Same as \b after a letter or a digit.
const RE = /\bSG\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z_-]{43}(?!\w)/g

export const sendgridKey: Detector = {
  id: 'sendgrid_key',
  label: 'SendGrid API key',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'SG.' + 'a'.repeat(22) + '.' + 'b'.repeat(43),
      'key=SG.A1b2C3d4E5f6G7h8I9j0Kl.' + 'M'.repeat(43),
      'SG.' + 'x'.repeat(22) + '.' + 'y'.repeat(43),
    ],
    negatives: ['SG.tooshort.x', 'SG.' + 'a'.repeat(22), 'not a sendgrid key'],
  },
}
