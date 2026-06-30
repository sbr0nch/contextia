import type { Detector } from '../types.js'
import { matchAll, shannon } from './_util.js'

// Long base64/hex-ish tokens with high Shannon entropy. Off by default — broad
// and prone to false positives, so it is opt-in. Precision techniques adapted
// (clean-room) from gitleaks (MIT) and detect-secrets (Apache-2.0): per-charset
// entropy thresholds, plus rejection of the dominant noise classes (pure digits,
// repeated/sequential runs, UUIDs) before scoring.
const TOKEN = /[A-Za-z0-9+/=_-]{20,}/g
const HEX = /^[0-9a-fA-F]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEQUENTIAL = 'abcdefghijklmnopqrstuvwxyz0123456789'

function isNoise(s: string): boolean {
  if (/^\d+$/.test(s)) return true // pure digits (IDs, phone numbers)
  if (/^(.)\1+$/.test(s)) return true // a single repeated character
  if (UUID.test(s)) return true
  return SEQUENTIAL.includes(s.toLowerCase()) // a run like abcdef…/012345…
}

function threshold(s: string): number {
  return HEX.test(s) ? 3.0 : 4.5 // hex packs less entropy per char than base64
}

export const genericHighEntropy: Detector = {
  id: 'generic_high_entropy',
  label: 'High-entropy string',
  severity: 'warning',
  defaultEnabled: false,
  scan: (text) => matchAll(TOKEN, text).filter((m) => !isNoise(m.match) && shannon(m.match) >= threshold(m.match)),
  fixtures: {
    positives: [
      'Z9x2Qw8pL3kF7mB1nV6cR4tY0sJ5hG2dW1eP8qA',
      'aB3dE6gH9jK2mN5pQ8rS1tV4wX7yZ0cF3hL6oR9u',
      'Kp7Lm2Qx9Rt4Vy8Zb3Nc6Wd1Sf5Gh0Jk4Pl8Mn2',
      'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', // hex secret (lower per-char threshold)
    ],
    negatives: [
      '123456789012345678901234', // pure digits
      'aaaaaaaaaaaaaaaaaaaaaaaa', // single repeated char
      '014df517-39d1-4453-b7b3-9930c563627c', // UUID
      'abcdefghijklmnopqrstuvwx', // sequential run
      'abcabcabcabcabcabcabcabc', // low entropy, not flagged
    ],
  },
}
