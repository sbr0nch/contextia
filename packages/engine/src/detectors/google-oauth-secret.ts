import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\bGOCSPX-[0-9A-Za-z_-]{28}\b/g

export const googleOauthSecret: Detector = {
  id: 'google_oauth_secret',
  label: 'Google OAuth client secret',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'GOCSPX-' + 'a'.repeat(28),
      'client_secret=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',
      'GOCSPX-' + 'x'.repeat(28),
    ],
    negatives: ['GOCSPX-short', 'GOCSPX_' + 'a'.repeat(28), 'no google secret in here'],
  },
}
