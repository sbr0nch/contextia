import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\bPMAK-[0-9a-f]{24}-[0-9a-f]{34}\b/g

export const postmanKey: Detector = {
  id: 'postman_key',
  label: 'Postman API key',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'PMAK-' + 'a'.repeat(24) + '-' + 'b'.repeat(34),
      'PMAK-' + '0123456789abcdef01234567' + '-' + 'f'.repeat(34),
      'key=PMAK-' + '1'.repeat(24) + '-' + '2'.repeat(34),
    ],
    negatives: ['PMAK-short', 'PMAK-' + 'g'.repeat(24) + '-' + 'b'.repeat(34), 'a postman collection'],
  },
}
