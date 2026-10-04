import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// (?!\w) rather than \b after a class that holds "-": \b needs a word character next, so a
// token ending in "-" was not matched whole. Same as \b after a letter or a digit.
const RE = /\bglpat-[0-9A-Za-z_-]{20}(?!\w)/g

export const gitlabPat: Detector = {
  id: 'gitlab_pat',
  label: 'GitLab personal access token',
  severity: 'critical',
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      'glpat-' + 'a'.repeat(20),
      'GITLAB_TOKEN=glpat-A1b2C3d4E5f6G7h8I9j0',
      'glpat-xZ_-xZ_-xZ_-xZ_-xZ12',
    ],
    negatives: ['glpat-short', 'glpat_' + 'a'.repeat(20), 'not a gitlab token here'],
  },
}
