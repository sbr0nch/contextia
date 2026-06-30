import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// Shopify access / custom-app / private-app / shared-secret tokens: prefix + 32 hex.
const RE = /\bshp(?:at|ca|pa|ss)_[0-9a-f]{32}\b/g

export const shopifyToken: Detector = {
  id: 'shopify_token',
  label: 'Shopify access token',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'shpat_' + 'a'.repeat(32),
      'shpss_' + '0123456789abcdef'.repeat(2),
      'shpca_' + 'deadbeef'.repeat(4),
    ],
    negatives: ['shpat_short', 'shpat_' + 'g'.repeat(32), 'a shopify store url'],
  },
}
