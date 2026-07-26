import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\bnpm_[0-9A-Za-z]{36}\b/g

export const npmToken: Detector = {
  id: 'npm_token',
  label: 'npm access token',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'npm_' + 'a'.repeat(36),
      '//registry.npmjs.org/:_authToken=npm_' + 'A1b2'.repeat(9),
      'npm_' + '0123456789'.repeat(3) + 'abcdef',
    ],
    negatives: ['npm_short', 'npm install left-pad', 'just editing the npmrc'],
  },
}
