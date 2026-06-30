import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\b[sprk]k_live_[A-Za-z0-9]{16,}\b/g

export const stripeLiveKey: Detector = {
  id: 'stripe_live_key',
  label: 'Stripe live key',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'sk_live_' + 'a'.repeat(24),
      'pk_live_0123456789abcdef',
      'rk_live_' + 'A'.repeat(20),
    ],
    negatives: [
      'sk_test_abcdefghijklmnop', // test, not live
      'pk_live_short',
      'no stripe key in this sentence',
    ],
  },
}
