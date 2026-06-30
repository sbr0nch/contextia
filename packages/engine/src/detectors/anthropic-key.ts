import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\bsk-ant-[A-Za-z0-9_-]{20,}/g

export const anthropicKey: Detector = {
  id: 'anthropic_key',
  label: 'Anthropic API key',
  severity: 'critical',
  defaultEnabled: true,
  rationale: 'An Anthropic API key grants billable access to your account — never paste it into a prompt.',
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'sk-ant-api03-' + 'a'.repeat(20),
      'sk-ant-' + 'AbCd12_-'.repeat(4),
      'key sk-ant-' + 'x'.repeat(30),
    ],
    negatives: [
      'sk-ant-short',
      'sk-something-else-entirely',
      'no anthropic key in this line',
    ],
  },
}
