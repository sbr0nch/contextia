import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// Bounded as DNS is: labels of at most 63 characters, at most 127 of them. Unbounded, every
// start inside "a.a.a.a." walks the whole chain before failing: quadratic, 6 s on 80 KB.
const RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,127}(?:internal|local|corp|lan|intranet)\b/gi

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
