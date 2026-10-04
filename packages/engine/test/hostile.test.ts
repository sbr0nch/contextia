import { describe, it, expect } from 'vitest'
import { detectors } from '../src/detectors/index.js'
import { detect } from '../src/detect.js'

// Hostile input, one detector at a time. The engine runs synchronously on
// whatever a user pastes or an agent sends, in the browser's main thread, in the
// proxy's event loop and in the hook that blocks a prompt, so one regex that is
// quadratic on some shape freezes all of them.
//
// Measured before this law existed: 80 KB of "1-1-1-" or "a.a.a." took 6 s in
// `email` and `internal_hostname`, 3.6 s in `db_connection_string`, and 1 MB of
// repeated PEM headers took `private_key` 11.8 s. The old perf test tried one
// header and 200 KB of "A", neither of which reaches any of them.
//
// The check is the growth rate, not a millisecond figure, so it holds on a slow
// CI machine: doubling the input must not much more than double the time.
const SHAPES: Record<string, (n: number) => string> = {
  'repeated a': (n) => 'a'.repeat(n),
  'repeated A': (n) => 'A'.repeat(n),
  'repeated 0': (n) => '0'.repeat(n),
  'spaces': (n) => ' '.repeat(n),
  'newlines': (n) => '\n'.repeat(n),
  'dashes': (n) => '-'.repeat(n),
  'equals': (n) => '='.repeat(n),
  'dots': (n) => '.'.repeat(n),
  'digit-dash runs': (n) => '1-'.repeat(n / 2),
  'dotted labels': (n) => 'a.'.repeat(n / 2),
  'jwt-like dots': (n) => 'eyJ' + 'a.'.repeat(n / 2),
  'ip-like': (n) => '10.0.0.'.repeat(n / 7),
  'host-like': (n) => 'a.internal'.repeat(n / 10),
  'hyphenated 63-char labels': (n) => ('a-'.repeat(31) + 'a.').repeat(n / 64),
  'thirty-char labels': (n) => ('a'.repeat(30) + '.').repeat(n / 31),
  'repeated KEY=': (n) => 'API_KEY='.repeat(n / 8),
  'keyword run, no equals': (n) => 'AUTH'.repeat(n / 4),
  'keyword run, lower case': (n) => 'token'.repeat(n / 5),
  'keyword run after a newline': (n) => '\nSECRET_TOKEN_AUTH_'.repeat(n / 19) + 'A'.repeat(100),
  'long upper line, many lines': (n) => ('\n' + 'A'.repeat(999)).repeat(n / 1000),
  'BEGIN PRIVATE, no END': (n) => '-----BEGIN PRIVATE KEY-----\n'.repeat(n / 28),
  'BEGIN RSA, no END': (n) => '-----BEGIN RSA PRIVATE KEY-----'.repeat(n / 31),
  'scheme://user:pass@ repeated': (n) => 'a://b:c@'.repeat(n / 8),
  'http://a: repeated': (n) => 'http://a:'.repeat(n / 9),
  'colon-slash noise': (n) => 'a:/'.repeat(n / 3),
  'AKIA + 39 chars, repeated': (n) => ('AKIAIOSFODNN7EXAMPLE ' + 'A'.repeat(39) + ' ').repeat(n / 61),
  'long base64 run': (n) => 'A'.repeat(n - 1) + '/',
  'email-like': (n) => 'a@a.'.repeat(n / 4),
  'at in the middle': (n) => 'x'.repeat(n / 2) + '@' + 'y'.repeat(n / 2),
  'card-like': (n) => '4111 1111 1111 1111 '.repeat(n / 20),
  'astral unicode': (n) => '😀'.repeat(n / 2),
}

function timeOf(scan: (t: string) => unknown, text: string): number {
  const t0 = performance.now()
  scan(text)
  return performance.now() - t0
}

// Take the best of three, so one scheduling hiccup does not look like a slope. A scan
// that is already past 2 s is not a hiccup, and re-running it only slows the failure.
function best(scan: (t: string) => unknown, text: string): number {
  const first = timeOf(scan, text)
  return first > 2000 ? first : Math.min(first, timeOf(scan, text), timeOf(scan, text))
}

const SMALL = 40_000
const LARGE = 160_000 // 4x

// Each detector is timed on 28 shapes at two sizes, three times each: seconds on a busy
// runner. The default 5 s timeout failed `internal_hostname` on a loaded GitHub runner
// (5.5 s) while the growth law itself held. The law is the ratio, not the wall clock.
const SLOW = 120_000

describe('no detector is superlinear on hostile input', () => {
  for (const d of detectors) {
    it(d.id, { timeout: SLOW }, () => {
      const offenders: string[] = []
      for (const [name, make] of Object.entries(SHAPES)) {
        const small = make(SMALL)
        const large = make(LARGE)
        d.scan(small) // warm up
        const a = best((t) => d.scan(t), small)
        const b = best((t) => d.scan(t), large)
        // 4x the input: linear is 4x, quadratic is 16x. 8x is the line, with a
        // floor so a 0.1 ms scan cannot trip it on noise.
        if (b > 40 && b / Math.max(a, 1) > 8) offenders.push(`${name}: ${a.toFixed(0)} ms -> ${b.toFixed(0)} ms for 4x the input`)
      }
      expect(offenders, offenders.join('\n')).toEqual([])
    })
  }
})

describe('the whole engine on a 1 MB hostile input', () => {
  // Linear growth is not enough: 63-character labels were linear and still took 20 s per MB.
  for (const name of ['dotted labels', 'digit-dash runs', 'BEGIN PRIVATE, no END', 'jwt-like dots', 'host-like', 'hyphenated 63-char labels', 'thirty-char labels']) {
    it(`${name} finishes in under 3 s with every detector on`, { timeout: SLOW }, () => {
      const text = SHAPES[name]!(1_000_000)
      const all = { enabledDetectors: detectors.map((d) => d.id) }
      const t0 = performance.now()
      detect(text, all)
      expect(performance.now() - t0).toBeLessThan(3000)
    })
  }
})
