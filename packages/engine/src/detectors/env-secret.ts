import type { Detector, RawMatch } from '../types.js'

// `KEY=value` lines where the key name implies a secret and the value is
// substantive. Scoping to secret-ish key names keeps false positives down.
const RE =
  /(?:^|\n)[ \t]*(?:export[ \t]+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|ENCRYPT(?:ION)?_?KEY|SIGN(?:ING)?_?KEY|MASTER_?KEY|SESSION_?KEY|AUTH|CREDENTIAL)[A-Z0-9_]*[ \t]*=[ \t]*['"]?([^\s'"#]{8,})['"]?/gi

const PLACEHOLDER = /^\$[{(]|^<|^your_|^changeme$|^x{3,}$|^\.{3,}$/i

// The key pattern above matches identifiers as well as env keys, so in source
// code `nextToken = punctuator;` reads as KEY=value. Two signals separate an
// assignment in code from a secret in a .env file.
//
// A value ending in a statement terminator is code, never an env value.
const CODE_TAIL = /[;,)}\]]$/
// Secret material carries digits or base64 padding. An all-letter value is a
// word: `punctuator`, `NonKeyword`, `IntTemplate`. This does cost us a secret
// made only of letters, which is the trade for not crying wolf on every
// minified bundle a user scans.
const SECRET_SHAPE = /[0-9+/=]/

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
      if (CODE_TAIL.test(value)) continue
      if (!SECRET_SHAPE.test(value)) continue
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
      'ENCRYPTION_KEY=QEDirqDwyxx1T7jt3nDmSvDLNdLao=',
      'SIGNING_KEY=abcd1234efgh5678',
    ],
    negatives: [
      'DEBUG=true',
      'PORT=8080',
      'PASSWORD=${DB_PASSWORD}', // placeholder, not a real secret
      'ENCRYPTION_ALGORITHM=aes-256-gcm', // an algorithm name, not a secret
      'nextToken = punctuator;', // an assignment in source, not an env line
      'tokenKind = IntTemplate', // a word, not secret material
      'AUTH_MODE=interactive' // a setting whose value is a plain word
    ],
  },
}
