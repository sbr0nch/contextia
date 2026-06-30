import type { Detector, RawMatch } from '../types.js'

// `KEY=value` lines where the key name implies a secret and the value is
// substantive. Scoping to secret-ish key names keeps false positives down.
const RE =
  /(?:^|\n)[ \t]*(?:export[ \t]+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|AUTH|CREDENTIAL)[A-Z0-9_]*[ \t]*=[ \t]*['"]?([^\s'"#]{8,})['"]?/gi

const PLACEHOLDER = /^\$[{(]|^<|^your_|^changeme$|^x{3,}$|^\.{3,}$/i

export const envSecret: Detector = {
  id: 'env_secret',
  label: 'Secret in KEY=value',
  severity: 'critical',
  defaultEnabled: true,
  scan(text) {
    const out: RawMatch[] = []
    for (const m of text.matchAll(RE)) {
      const value = m[1]!
      if (PLACEHOLDER.test(value)) continue
      const start = m.index! + m[0].lastIndexOf(value)
      out.push({ start, end: start + value.length, match: value })
    }
    return out
  },
  fixtures: {
    positives: [
      'API_KEY=sk_abcd1234efgh',
      'export DB_PASSWORD="s3cr3tValue1"',
      'AUTH_TOKEN=abcd1234efgh5678',
    ],
    negatives: [
      'DEBUG=true',
      'PORT=8080',
      'PASSWORD=${DB_PASSWORD}', // placeholder, not a real secret
    ],
  },
}
