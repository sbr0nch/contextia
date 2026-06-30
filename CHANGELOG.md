# Changelog

## v0.1.0

First public release.

### Detection engine (`packages/engine`)
- 17 detectors: AWS access key id & secret access key (paired-only), GCP key,
  Azure storage key, GitHub token, Anthropic key, OpenAI key, Slack token,
  Stripe live key, PEM private key blocks, `.env`-style secrets, DB connection
  strings, JWT, generic high-entropy strings, internal hostnames, private IPs,
  email addresses.
- Deterministic `detect()` and an overlap-aware `redact()`, both pure functions
  with no DOM or network dependency.
- Value and pattern allowlisting; per-detector severity overrides.
- 123 unit tests, 100% coverage; an acceptance gate enforcing the full roster,
  zero missed criticals, zero critical false positives, and an aggregate false
  positive rate under 2%.

### Browser extension (`packages/extension`)
- Manifest V3, Chromium. Composer detection on chatgpt.com and claude.ai.
- Inline indicator, highlighted findings with hover detail, a popover with
  Redact / Allow once / Allow pattern actions.
- Four modes: Warn, Auto-redact, Block, Off. Block intercepts both the Enter
  key and the page's send button (detected by a resilient, selector-agnostic
  heuristic so a site redesign doesn't silently break it).
- Local-only popup and options pages: stats, a detections log that never
  stores the matched secret value, detector toggles, allowlists.
- Zero network requests, verified by source-level guards, unit tests, and an
  end-to-end Chromium check with request interception.
- Cross-platform packaging (`npm run package`) producing a store-ready
  `contextia.zip`.

### Project
- MIT licensed. Privacy policy and Chrome Web Store listing copy included.
