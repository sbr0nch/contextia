import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\bxox[baprs]-[A-Za-z0-9-]{10,}/g

export const slackToken: Detector = {
  id: 'slack_token',
  label: 'Slack token',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'xoxb-' + '12345678901234567890',
      'xoxp-abcdefghij-klmnopqrst',
      'token: xoxs-' + 'A'.repeat(15),
    ],
    negatives: [
      'xox-nope',
      'xoxz-1234567890', // z is not a valid token type
      'normal text without a token',
    ],
  },
}
