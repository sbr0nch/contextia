import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\blin_api_[0-9A-Za-z]{40}\b/g

export const linearKey: Detector = {
  id: 'linear_key',
  label: 'Linear API key',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: ['lin_api_' + 'a'.repeat(40), 'lin_api_' + 'A1b2'.repeat(10), 'lin_api_' + '0'.repeat(40)],
    negatives: ['lin_api_short', 'the linear app', 'lin_api_ has a space'],
  },
}
