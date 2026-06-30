# Contributing

Thanks for helping keep secrets out of AI assistants.

## Setup

```bash
npm install
npm run verify   # typecheck + tests + acceptance + build — keep this green
```

## Ground rules

- **The engine has no DOM or network dependencies** and stays dependency-light.
  Other surfaces (CLI, proxy, extension) reuse it.
- **The extension makes zero network requests.** Any `fetch`/XHR/WebSocket is a
  build error covered by a test.
- **Never persist a matched secret value** — logs and stats may keep only the
  detector type, severity, site, action and timestamp.
- Engine changes must keep **100% coverage** and pass the acceptance gate
  (zero missed criticals, zero critical false positives, FP rate < 2%).

## Adding a detector

Most detectors are data: add a rule to `packages/engine/rules/extra.json` with
positive/negative fixtures and run `npm run gen --workspace @sbr0nch/contextia-engine`.
The generator refuses to emit a detector whose fixtures don't hold. For logic
that needs code (checksums, pairing), add a module under
`packages/engine/src/detectors/` and register it.

## Commits

Conventional Commits style, e.g. `feat(engine): add Twilio detector`. Keep
messages concise and imperative.
