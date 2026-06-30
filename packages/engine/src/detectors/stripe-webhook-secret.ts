import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\bwhsec_[0-9A-Za-z]{32,}\b/g

export const stripeWebhookSecret: Detector = {
  id: 'stripe_webhook_secret',
  label: 'Stripe webhook secret',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'whsec_' + 'a'.repeat(32),
      'STRIPE_WEBHOOK_SECRET=whsec_' + 'A1b2'.repeat(9),
      'whsec_' + 'x'.repeat(40),
    ],
    negatives: ['whsec_short', 'whsec_ with a space', 'no webhook secret here'],
  },
}
