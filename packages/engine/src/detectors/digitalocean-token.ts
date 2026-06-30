import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// DigitalOcean personal/OAuth/refresh tokens: do{o,p,r}_v1_ + 64 hex.
const RE = /\bdo[opr]_v1_[0-9a-f]{64}\b/g

export const digitaloceanToken: Detector = {
  id: 'digitalocean_token',
  label: 'DigitalOcean token',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'dop_v1_' + '0123456789abcdef'.repeat(4),
      'dor_v1_' + 'a'.repeat(64),
      'doo_v1_' + 'deadbeef'.repeat(8),
    ],
    negatives: ['dop_v1_short', 'dop_v1_' + 'g'.repeat(64), 'a digitalocean droplet'],
  },
}
