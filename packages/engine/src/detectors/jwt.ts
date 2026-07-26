import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// header.payload.signature, both header and payload base64url-encoded JSON (eyJ…).
// Warning, not critical: many JWTs in the wild are public, expired or sample tokens.
const RE = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g

export const jwt: Detector = {
  id: 'jwt',
  label: 'JSON Web Token',
  severity: 'warning',
  defaultEnabled: false,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      'eyJ' + 'a'.repeat(10) + '.eyJ' + 'b'.repeat(10) + '.' + 'c'.repeat(20),
      'token=eyJ0eXAiOiJKV1QifZ.eyJ1c2VyIjoiam9obiJ9.sig12345signature',
    ],
    negatives: [
      'eyJonlyonesegment',
      'not.a.jwt',
      'a normal sentence with dots. like this. one.',
    ],
  },
}
