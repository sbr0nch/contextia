import type { Detector, RawMatch } from '../types.js'

// Same language as /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, found without
// letting the regex engine rescan. Run as one regex, every start inside a long run of
// [A-Za-z0-9._%+-] walks the whole run looking for an '@': quadratic, 6 s on 80 KB. A cap on
// the local part would fix the time but lose matches the old form had. So: walk the '@'
// signs, look back over the local part once, and match only the domain forward.
const DOMAIN = /[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/y
const LOCAL = /[A-Za-z0-9._%+-]/
const WORD = /[A-Za-z0-9_]/

const isLocal = (c: string | undefined): boolean => c !== undefined && LOCAL.test(c)
const isWord = (c: string | undefined): boolean => c !== undefined && WORD.test(c)
// \b before position p: exactly one side of the gap is a word character.
const boundaryAt = (text: string, p: number): boolean => isWord(text[p - 1]) !== isWord(text[p])

function scanEmails(text: string): RawMatch[] {
  const out: RawMatch[] = []
  let from = 0 // the old regex resumed after each match, so a start may not precede the last end
  for (let at = text.indexOf('@', from); at !== -1; at = text.indexOf('@', from)) {
    let run = at
    while (run > from && isLocal(text[run - 1])) run--
    let start = run
    while (start < at && !boundaryAt(text, start)) start++
    DOMAIN.lastIndex = at + 1
    const m = start < at ? DOMAIN.exec(text) : null
    if (m === null) {
      from = at + 1
      continue
    }
    const end = at + 1 + m[0].length
    out.push({ start, end, match: text.slice(start, end) })
    from = end
  }
  return out
}

export const email: Detector = {
  id: 'email',
  label: 'Email address',
  severity: 'warning',
  defaultEnabled: false,
  rationale: 'An email address is personal data (PII); redact it if the recipient should not see it.',
  scan: scanEmails,
  fixtures: {
    positives: ['john.doe@example.com', 'a_b+c@mail.co.uk', 'user@sub.domain.org'],
    negatives: [
      'not an email address',
      '@handle-without-local-part',
      'a@b', // no top-level domain
    ],
  },
}
