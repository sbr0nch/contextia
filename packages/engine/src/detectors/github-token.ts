import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// gh*_ tokens: prefix + 36 alphanumerics. Fine-grained PATs have the exact
// documented shape github_pat_<22>_<59> (GitHub docs).
const RE = /\bgh[opusr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[0-9A-Za-z]{22}_[0-9A-Za-z]{59}\b/g

export const githubToken: Detector = {
  id: 'github_token',
  label: 'GitHub token',
  severity: 'critical',
  defaultEnabled: true,
  rationale: 'A GitHub token can read or push to your repositories — revoke it if it leaks.',
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'ghp_' + 'a'.repeat(36),
      'gho_' + '0123456789abcdefABCDEF0123456789abcd',
      'github_pat_' + 'A'.repeat(22) + '_' + 'b'.repeat(59),
    ],
    negatives: [
      'ghp_short',
      'github_pat_too_short',
      'just a normal sentence about github',
    ],
  },
}
