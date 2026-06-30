# @contextia/engine

The detection core behind [Contextia](https://github.com/sbr0nch/contextia):
environment-agnostic secret detection. No DOM, no network, dependency-light — the
same engine powers the browser extension, the CLI, and the local proxy.

```bash
npm install @contextia/engine
```

## Usage

```ts
import { detect, redact } from '@contextia/engine'

const text = 'deploy with AKIAIOSFODNN7EXAMPLE'

const findings = detect(text)
// [{ id, type: 'aws_access_key_id', label, severity: 'critical', start, end, match }]

redact(text, findings)
// 'deploy with ⟨redacted:aws_access_key_id⟩'
```

By default only the `critical` detectors run. Opt into the `warning` detectors,
override severities, or allowlist values/patterns via the config:

```ts
import { detect, detectors } from '@contextia/engine'

detect(text, {
  enabledDetectors: detectors.map((d) => d.id), // everything, incl. warnings
  allowlist: { values: ['AKIAIOSFODNN7EXAMPLE'], patterns: ['EXAMPLE$'] },
})
```

## API

- `detect(text, config?) → Finding[]` — deterministic, sorted by position.
- `redact(text, findings, opts?) → string` — overlap-aware replacement.
- `detectors`, `detectorsById` — the detector registry (for building UIs).

`Finding.match` is the secret itself — never log or persist it.

MIT licensed. See [`NOTICE`](https://github.com/sbr0nch/contextia/blob/main/NOTICE)
for third-party pattern sources.
