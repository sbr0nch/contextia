import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\bhf_[0-9A-Za-z]{34}\b/g

export const huggingfaceToken: Detector = {
  id: 'huggingface_token',
  label: 'Hugging Face token',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: ['hf_' + 'a'.repeat(34), 'HF_TOKEN=hf_' + 'A1b2'.repeat(8) + 'cd', 'hf_' + 'x'.repeat(34)],
    negatives: ['hf_short', 'half of the dataset', 'a hugging face model card'],
  },
}
