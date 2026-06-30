import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

export const email: Detector = {
  id: 'email',
  label: 'Email address',
  severity: 'warning',
  defaultEnabled: false,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: ['john.doe@example.com', 'a_b+c@mail.co.uk', 'user@sub.domain.org'],
    negatives: [
      'not an email address',
      '@handle-without-local-part',
      'a@b', // no top-level domain
    ],
  },
}
