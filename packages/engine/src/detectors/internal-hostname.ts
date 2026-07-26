import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:internal|local|corp|lan|intranet)\b/gi

export const internalHostname: Detector = {
  id: 'internal_hostname',
  label: 'Internal hostname',
  severity: 'warning',
  defaultEnabled: false,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: ['db01.internal', 'app.server.corp', 'gateway.intranet'],
    negatives: ['example.com', 'www.google.com', 'just some plain text'],
  },
}
