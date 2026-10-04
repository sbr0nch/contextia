import type { Detector, RawMatch } from '../types.js'

// scheme://[user]:password@host, a connection string carrying inline credentials.
//
// Same language as /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]*:[^\s:@/]+@[^\s/]+/gi, found without
// letting the regex engine rescan. Run as one regex, every word boundary inside "a.a.a.a"
// walks the run looking for "://": quadratic, 3.6 s on 80 KB. A cap on the scheme would fix
// the time but lose a URL glued to a long word. So: walk the "://" sites, look back over the
// scheme once, and match only the credentials and host forward.
const TAIL = /[^\s:@/]*:[^\s:@/]+@[^\s/]+/y
const SCHEME = /[A-Za-z0-9+.-]/
const LETTER = /[A-Za-z]/
const WORD = /[A-Za-z0-9_]/

const isWord = (c: string | undefined): boolean => c !== undefined && WORD.test(c)

function scanConnectionStrings(text: string): RawMatch[] {
  const out: RawMatch[] = []
  let from = 0 // where to look for the next "://"
  for (let at = text.indexOf('://', from); at !== -1; at = text.indexOf('://', from)) {
    // The previous match ends at a '/' or whitespace, which the scheme class excludes, so
    // this walk can never reach back into it.
    let run = at
    while (run > 0 && SCHEME.test(text[run - 1]!)) run--
    // the earliest start the regex would have taken: a letter on a word boundary
    let start = run
    while (start < at && !(LETTER.test(text[start]!) && isWord(text[start - 1]) === false)) start++
    TAIL.lastIndex = at + 3
    const m = start < at ? TAIL.exec(text) : null
    if (m === null) {
      from = at + 3
      continue
    }
    const end = at + 3 + m[0].length
    out.push({ start, end, match: text.slice(start, end) })
    from = end
  }
  return out
}

export const dbConnectionString: Detector = {
  id: 'db_connection_string',
  label: 'Connection string with credentials',
  severity: 'critical',
  defaultEnabled: true,
  scan: scanConnectionStrings,
  fixtures: {
    positives: [
      'postgres://admin:s3cret@db.example.com:5432/app',
      'mongodb://user:pass@cluster0.mongodb.net',
      'redis://:password@10.0.0.1:6379',
    ],
    negatives: [
      'https://example.com/path', // no inline credentials
      'postgres://localhost:5432/db', // host:port, no user:pass@
      'just a sentence, not a url',
    ],
  },
}
