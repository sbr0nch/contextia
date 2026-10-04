import type { Detector, RawMatch } from '../types.js'

// `KEY=value` lines where the key name implies a secret and the value is
// substantive. Scoping to secret-ish key names keeps false positives down.
const RE =
  /(?:^|\n)[ \t]*(?:export[ \t]+)?[A-Z0-9_]{0,64}(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|ENCRYPT(?:ION)?_?KEY|SIGN(?:ING)?_?KEY|MASTER_?KEY|SESSION_?KEY|AUTH|CREDENTIAL)[A-Z0-9_]{0,64}[ \t]*=[ \t]*['"]?([^\s'"#]{8,})['"]?/gi

// Both patterns bound the name around the keyword to 64 characters: unbounded, a run of
// keyword-dense text with no `=` (`AUTHAUTHAUTH...`) was quadratic (3.3 s at 80 KB).
//
// The same assignment in the middle of a line: `OPENAI_API_KEY=sk-... python app.py`,
// `docker run -e DB_PASSWORD=...`, or a sentence that quotes one. Here the key must be
// upper case with no space around the `=`, which is how an environment variable is
// written. Case-insensitive, it read `tokenType=\`PERCENTAGE\`` in minified code as a
// secret (144 hits in 3,311 files of other people's code); upper case only, none.
const INLINE =
  /(?<![A-Za-z0-9_])[A-Z0-9_]{0,64}(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|ENCRYPT(?:ION)?_?KEY|SIGN(?:ING)?_?KEY|MASTER_?KEY|SESSION_?KEY|AUTH|CREDENTIAL)[A-Z0-9_]{0,64}=['"]?([^\s'"#]{8,})['"]?/g

// Brackets, braces, commas or semicolons inside a value taken from the middle of a line mean
// the line is code (a minified bundle), not an environment assignment.
const CODE_CHARS = /[(){}\[\],;]/

const PLACEHOLDER = /^\$[{(A-Za-z_]|^<|^your_|^changeme$|^x{3,}$|^\.{3,}$/i

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
// A regular expression literal assigned to a constant (`TOKEN = /[A-Za-z0-9+/=_-]{20,}/g`) is code.
const REGEX_LITERAL = /^\/.+\/[a-z]*$/

export const envSecret: Detector = {
  id: 'env_secret',
  label: 'Secret in KEY=value',
  severity: 'critical',
  defaultEnabled: true,
  scan(text) {
    const out: RawMatch[] = []
    const seen = new Set<number>()
    for (const re of [RE, INLINE]) {
      for (const m of text.matchAll(re)) {
        // in the middle of a line, a trailing `.`, `,` or `)` is the sentence's, not the value's
        const value = re === INLINE ? m[1]!.replace(/[.,;:)\]}]+$/, '') : m[1]!
        if (value.length < 8) continue
        if (re === INLINE && CODE_CHARS.test(value)) continue
        if (PLACEHOLDER.test(value)) continue
        if (CODE_TAIL.test(value)) continue
        if (!SECRET_SHAPE.test(value)) continue
        if (REGEX_LITERAL.test(value)) continue
        const start = m.index! + m[0].lastIndexOf(value)
        if (seen.has(start)) continue
        seen.add(start)
        out.push({ start, end: start + value.length, match: value })
      }
    }
    return out.sort((a, b) => a.start - b.start)
  },
  fixtures: {
    positives: [
      'API_KEY=sk_abcd1234efgh',
      'export DB_PASSWORD="s3cr3tValue1"',
      'AUTH_TOKEN=abcd1234efgh5678',
      'ENCRYPTION_KEY=QEDirqDwyxx1T7jt3nDmSvDLNdLao=',
      'SIGNING_KEY=abcd1234efgh5678',
      'OPENAI_API_KEY=sk-proj1234567890abcd python app.py', // inline, before a command
    ],
    negatives: [
      'DEBUG=true',
      'PORT=8080',
      'PASSWORD=${DB_PASSWORD}', // placeholder, not a real secret
      'ENCRYPTION_ALGORITHM=aes-256-gcm', // an algorithm name, not a secret
      'nextToken = punctuator;', // an assignment in source, not an env line
      'tokenKind = IntTemplate', // a word, not secret material
      'AUTH_MODE=interactive', // a setting whose value is a plain word
      'this.password=req.body.pass1word;', // lower-case key in the middle of a line: code, not an env var
      'TOKEN = /[A-Za-z0-9+/=_-]{20,}/g', // a regular expression literal, not a value
      'run with API_KEY=$KEY123456 set', // a variable reference
      'x.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Ku,t.cloneElement=function(e,t,n){if(null==e)throw Error(y(2))}', // a minified bundle (React), found by scanning node_modules
      'see (API_KEY=a1b2c3d...) in the docs', // what is left once the sentence's punctuation is off is too short to be a value
    ],
  },
}
