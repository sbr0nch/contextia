import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

const RE = /\bglpat-[0-9A-Za-z_-]{20}\b/g

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
