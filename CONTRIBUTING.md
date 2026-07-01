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

## Extension points

Contextia is built to be embedded and wrapped without forking. These seams are
stable; keep them working:

- **Engine `Config`** — `detect(text, config)` and `redact()` are pure functions.
  Pass a `Config` to scope detectors and apply allowlists. No global state.
- **CLI proxy `onFinding`** — `createProxyServer`/`startProxy` accept an
  `onFinding(findings, { path })` callback and a full `Config`, so a wrapper can
  observe detections and inject policy at startup.
- **Plugin `CONTEXTIA_CONFIG`** — the Claude Code plugin reads an optional JSON
  config file (engine `Config` shape) from this env var; unset → defaults.
- **Extension settings** — the extension reads its `Config` from
  `chrome.storage`, so settings can be provisioned externally.
- **Secret-free telemetry contract** — `LogEntry` is exactly
  `{ ts, site, type, severity, action }`, produced by `logEntryFor()`. The matched
  value never enters a log or stat. This shape is stable; don't add the secret.

Any build that needs network, reporting, or central policy must add it in a
separate layer that wraps these seams — the engine and the OSS surfaces stay
on-device with zero network calls.

## Commits

Conventional Commits style, e.g. `feat(engine): add Twilio detector`. Keep
messages concise and imperative.

## Releasing

Ship an update by bumping the version and republishing the affected surface —
and keep everything in sync:

- **Engine / CLI (npm)**: bump `version` in the package's `package.json`, then
  `npm publish --workspace <pkg>`. Update the package README if commands changed.
- **Claude Code plugin**: bump `version` in both
  `plugins/contextia/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`,
  then push (Claude Code only offers the update when this version changes). Run
  `npm run build` first if the engine changed, so `plugins/contextia/vendor/engine.js`
  is regenerated.
- **Browser extension**: bump `version` in `packages/extension/package.json`,
  `npm run package` / `npm run package:firefox`, upload the new zip to each store,
  and refresh the listing images.
- **Always**: run `npm run verify`, update `CHANGELOG.md` and any affected README,
  push to `main`, and update the website if user-facing behavior changed.
