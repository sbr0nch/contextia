import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\bgh[opusr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{82}\b/g

export const githubToken: Detector = {
  id: 'github_token',
  label: 'GitHub token',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'ghp_' + 'a'.repeat(36),
      'gho_' + '0123456789abcdefABCDEF0123456789abcd',
      'github_pat_' + 'A1b2'.repeat(20) + 'cd',
    ],
    negatives: [
      'ghp_short',
      'github_pat_too_short',
      'just a normal sentence about github',
    ],
  },
}
