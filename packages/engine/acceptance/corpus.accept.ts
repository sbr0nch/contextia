import { describe, it, expect } from 'vitest'
import { detect } from '../src/index.js'
import { detectors, detectorsById } from '../src/detectors/index.js'
import type { Detector } from '../src/index.js'

// SPEC §8/§9 — the engine "done" bar. This gate is intentionally red until the
// full v1 roster is implemented; it is what loop/check.sh enforces.

const MIN_FIXTURES = 3
const FP_RATE_THRESHOLD = 0.02

// Critical detectors: on by default (SPEC §4). aws_secret_access_key only fires
// when paired with an access key id, but its fixtures still encode that.
const REQUIRED_CRITICAL = [
  'aws_access_key_id',
  'aws_secret_access_key',
  'gcp_key',
  'azure_key',
  'github_token',
  'anthropic_key',
  'openai_key',
  'slack_token',
  'stripe_live_key',
  'private_key',
  'env_secret',
  'db_connection_string',
]

// Warning detectors: implemented but OFF by default (SPEC §9). JWT is a warning,
// not a critical (too many public/expired sample tokens to call it a credential).
const REQUIRED_WARNING = ['jwt', 'generic_high_entropy', 'internal_hostname', 'private_ip', 'email']

function findsOwnType(d: Detector, text: string): boolean {
  return detect(text, { enabledDetectors: [d.id] }).some((f) => f.type === d.id)
}

describe('roster: every required detector exists with fixtures', () => {
  for (const [ids, severity, defaultEnabled] of [
    [REQUIRED_CRITICAL, 'critical', true],
    [REQUIRED_WARNING, 'warning', false],
  ] as const) {
    for (const id of ids) {
      it(`${id} (${severity}, default ${defaultEnabled ? 'on' : 'off'})`, () => {
        const d = detectorsById.get(id)
        expect(d, `detector "${id}" is not implemented`).toBeDefined()
        expect(d!.severity).toBe(severity)
        expect(d!.defaultEnabled).toBe(defaultEnabled)
        expect(d!.fixtures.positives.length).toBeGreaterThanOrEqual(MIN_FIXTURES)
        expect(d!.fixtures.negatives.length).toBeGreaterThanOrEqual(MIN_FIXTURES)
      })
    }
  }
})

describe('corpus: 0 missed criticals, false positives under threshold', () => {
  it('meets the acceptance metrics', () => {
    const missedCritical: string[] = []
    let falsePositives = 0
    let criticalFalsePositives = 0
    let negativeCount = 0

    for (const d of detectors) {
      for (const pos of d.fixtures.positives) {
        if (!findsOwnType(d, pos) && d.severity === 'critical') {
          missedCritical.push(`${d.id}: ${JSON.stringify(pos.slice(0, 40))}`)
        }
      }
      for (const neg of d.fixtures.negatives) {
        negativeCount++
        if (findsOwnType(d, neg)) {
          falsePositives++
          if (d.severity === 'critical') criticalFalsePositives++
        }
      }
    }

    const fpRate = negativeCount === 0 ? 0 : falsePositives / negativeCount
    expect(missedCritical, 'critical false negatives').toEqual([])
    expect(criticalFalsePositives, 'critical false positives').toBe(0)
    expect(fpRate, `FP rate ${fpRate} must be < ${FP_RATE_THRESHOLD}`).toBeLessThan(FP_RATE_THRESHOLD)
  })
})
