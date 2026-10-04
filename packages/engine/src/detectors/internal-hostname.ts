import type { Detector } from '../types.js'
import { matchAll } from './_util.js'

// Bounded as DNS is: labels of at most 63 characters, at most 253 characters in all.
//
// Two things keep this linear in practice. A label must be followed by a dot, so it can
// only be the whole run of [a-z0-9-] up to that dot; the lookahead + backreference takes
// that run in one step and cannot be backtracked into. And a start is only tried when a
// ".tld" is within DNS reach (253 characters), which rejects nearly every start without
// walking the chain. Before: unbounded it was quadratic (6 s on 80 KB of "a.a.a."), then
// bounded to 127 labels it still took 20 s on 1 MB of 63-character labels.
const RE =
  /\b(?=[a-z0-9.-]{0,253}\.(?:internal|local|corp|lan|intranet)\b)(?:(?=[a-z0-9])(?=([a-z0-9-]{1,63}))\1(?<=[a-z0-9])\.){1,127}(?:internal|local|corp|lan|intranet)\b/gi

export const internalHostname: Detector = {
  id: 'internal_hostname',
  label: 'Internal hostname',
  severity: 'warning',
  defaultEnabled: false,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: ['db01.internal', 'app.server.corp', 'gateway.intranet'],
    negatives: ['example.com', 'www.google.com', 'just some plain text'],
  },
}
