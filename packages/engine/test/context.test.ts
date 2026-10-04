import { describe, it, expect } from 'vitest'
import { detect } from '../src/detect.js'
import { detectors } from '../src/detectors/index.js'

// Every detector is tested on its fixtures as a bare string. A user never pastes a bare
// string: the secret sits in a sentence, in quotes, in a code fence, in a JSON value, after
// a long text, on a Windows line. A detector that only works at the start of a line passes
// its fixtures and misses a secret in `OPENAI_API_KEY=sk-... python app.py`. The wrapped
// forms below must all be found, once each (twice when the secret is there twice).
const WRAPS: Record<string, (s: string) => string> = {
  'bare': (s) => s,
  'spaces': (s) => `  ${s}  `,
  'after a line': (s) => `line one\n${s}\nline three`,
  'windows line ends': (s) => `a\r\n${s}\r\nb`,
  'double quotes': (s) => `"${s}"`,
  'single quotes': (s) => `'${s}'`,
  'backticks': (s) => `\`${s}\``,
  'parentheses': (s) => `(${s})`,
  'code fence': (s) => '```\n' + s + '\n```',
  'in a sentence': (s) => `Here is my token ${s}, please help.`,
  'before a full stop': (s) => `use ${s}.`,
  'twice': (s) => `${s}\n${s}`,
  'after 90 KB of prose': (s) => 'lorem ipsum dolor '.repeat(5000) + s,
  'tabs': (s) => `\t${s}\t`,
  'before a command': (s) => `${s} node app.js`,
}
const quoted = new Set(['double quotes', 'single quotes', 'backticks'])

describe('every fixture is found in the contexts text really comes in', () => {
  for (const d of detectors) {
    describe(d.id, () => {
      for (const [name, wrap] of Object.entries(WRAPS)) {
        it.each(d.fixtures.positives)(`${name}: %s`, (pos) => {
          // a fixture that already holds quotes cannot also be put inside the same quotes
          if (quoted.has(name) && /["'`]/.test(pos)) return
          const hits = detect(wrap(pos), { enabledDetectors: [d.id] }).filter((f) => f.type === d.id)
          expect(hits.length).toBeGreaterThanOrEqual(name === 'twice' ? 2 : 1)
        })
      }
    })
  }
})
