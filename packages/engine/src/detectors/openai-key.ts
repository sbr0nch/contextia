import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// Precise: project keys (sk-proj-…) or the legacy 48-char form. The (?!ant-)
// lookahead keeps it from swallowing Anthropic keys; bare short sk- is ignored.
const RE = /\bsk-(?!ant-)(?:proj-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{48})\b/g

export const openaiKey: Detector = {
  id: 'openai_key',
  label: 'OpenAI API key',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'sk-proj-' + 'a'.repeat(24),
      'sk-' + 'a'.repeat(48),
      'OPENAI_API_KEY=sk-' + 'T3BlbkFJ'.repeat(6),
    ],
    negatives: [
      'sk-ant-api03-' + 'a'.repeat(20), // Anthropic, not OpenAI
      'sk-short',
      'just text, no key here',
    ],
  },
}
