# Changelog

## v1.3.0

- Optional **local stats endpoint**: the browser extension can mirror catch
  **counts** (detector, site, action, count — never the secret value) to a
  loopback dashboard, so terminal and browser detections show up in one place.
  Off by default; the extension refuses any non-loopback URL, and can be
  preconfigured by enterprise policy via `chrome.storage.managed`.
- Proxy: accepts `POST /__contextia/events` (loopback only) and folds the counts
  into the existing stats and dashboard, including a new by-site breakdown and a
  `leaked` counter (submitted despite a warning). The endpoint rejects any body
  carrying a field outside the counts whitelist.
- Extension: submitting in Warn mode despite an active warning now counts as
  `leaked` in the popup and emits a matching `leaked` event, so the local
  dashboard matches the popup's caught-vs-leaked distinction.
- The extension is **zero network by default**; the only network path is the
  opt-in, loopback-guarded reporter, covered by tests.
- Wider `KEY=value` coverage: `ENCRYPTION_KEY`, `SIGNING_KEY`, `MASTER_KEY` and
  `SESSION_KEY` assignments are now caught, without flagging non-secret names like
  `ENCRYPTION_ALGORITHM` or `PRIMARY_KEY`.
- 17 more detectors, a distinctive-prefix parity pass against the gitleaks rule
  set: Resend, HashiCorp Vault, Dynatrace, Typeform, Prefect, RubyGems, Clojars,
  Duffel, Frame.io, Shippo, EasyPost, Alibaba Cloud AccessKey, age, ReadMe,
  Intra42, Facebook, and Sentry user tokens. Each carries a distinctive literal
  prefix (so false positives stay near zero) and passes the automatic FP gate.
  Resend also matches as a standalone token, not only inside `RESEND_API_KEY=`.
- Structured personal-data detectors (79 total), opt-in like the existing PII
  ones: US Social Security Number (with area/group/serial validation), US ITIN,
  and crypto — Bitcoin private keys (WIF, on by default as they are secrets),
  Ethereum and Bitcoin (bech32) addresses. Free-text categories that need an NLP
  model (names, addresses) are deliberately out of scope for the on-device engine.

## v1.2.1

- Claude Code plugin: optional `CONTEXTIA_CONFIG` environment variable to point at
  a JSON config (the engine's `Config` shape) that scopes detectors and adds
  allowlists. Unset falls back to the defaults; it reads a local file only.

## v1.2.0

- 11 more detectors (58 total): Figma, Airtable, Terraform Cloud, Dropbox, xAI
  (Grok), Flutterwave, Razorpay, Fireworks AI, Atlassian, and Tailscale tokens.
- Optional one-line "redacted by Contextia" note on redacted requests — a signal
  to the model that the placeholders are deliberate. On by default in the CLI
  proxy (disable with `--no-signature`); off by default in the extension (a
  toggle in settings).
- Browser extension: composer detection now handles shadow-DOM-mounted editors
  and nested focus; redesigned, searchable settings; the logo across the in-page
  badge, popup, and options; and a clean-state card when nothing is flagged.

## v1.1.0

- 6 more detectors (47 total): OpenRouter, Groq, Perplexity, Replicate, Notion,
  and Discord bot tokens.
- The browser extension now runs on Gemini, Google AI Studio, Microsoft Copilot,
  Perplexity, and DeepSeek, in addition to ChatGPT and Claude.
- Documented proxy use with any base-URL-configurable agent (Claude Code, Cursor,
  Windsurf, aider, API scripts).

## v1.0.0

First stable release. One on-device engine across four surfaces: the terminal
CLI and AI-DLP proxy, a Claude Code plugin, the browser extension, and the engine
library.

Since the initial preview: added the `contextia run -- <agent>` wrapper (starts
the proxy and launches the agent with no manual base-URL setup); a self-contained
**Claude Code plugin** that blocks a prompt containing a secret before it reaches
the model; reversible tokenization, per-finding rationale, and a custom
always-redact list; credit-card (Luhn) and IBAN (mod-97) detectors; and the
Contextia brand/logo across every surface.

### Detection engine (`packages/engine`)
- 41 detectors (34 critical, 7 warning): cloud and service credentials (AWS
  access key id & secret access key paired-only, GCP, Azure, GitHub, GitLab,
  Anthropic, OpenAI, Slack, Stripe live key & webhook secret, npm, SendGrid,
  Twilio, Google OAuth, Shopify, Hugging Face, DigitalOcean, Postman, Linear,
  Square, and ten more generated from permissively-licensed rule sets), PEM
  private key blocks, `.env`-style secrets, and DB connection strings; plus
  warning-level detectors for JWTs, generic high-entropy strings, internal
  hostnames, private IPs, email addresses, Luhn-valid credit-card numbers, and
  mod-97-valid IBANs.
- Deterministic `detect()` and an overlap-aware `redact()`, both pure functions
  with no DOM or network dependency.
- `customFindings()` for the user's own values/patterns; value and pattern
  allowlisting; per-detector severity overrides.
- Every finding carries a plain-language rationale explaining why it was flagged
  (never contains the secret value).
- A detector generator with an automatic false-positive gate, so new rules can
  only ship if their fixtures hold.
- 267 unit tests, 100% coverage; an acceptance gate enforcing the full roster,
  zero missed criticals, zero critical false positives, and an aggregate false
  positive rate under 2%.

### Terminal / AI-DLP (`packages/cli`)
- `contextia scan` (with `--json` and `--explain`), `redact`, and `list`.
- `contextia proxy` — a local proxy that sits between your AI agent and the LLM
  (Anthropic/OpenAI shapes) and warns, redacts, or blocks secrets before they
  leave the machine, with a live local stats dashboard.
- `--reversible` redaction: each secret becomes a unique token via a local,
  per-request vault and is restored in the LLM's response, so the answer stays
  usable while the real value never reaches the provider.
- `--redact-file` for your own always-redact values and patterns.

### Browser extension (`packages/extension`)
- Manifest V3, Chromium and Firefox. Composer detection on chatgpt.com and
  claude.ai.
- Inline indicator, highlighted findings with hover detail (including the
  rationale), and a popover with Redact / Allow once / Allow all / Allow pattern
  actions.
- Four modes: Warn, Auto-redact, Block, Off. Block intercepts both the Enter
  key and the page's send button (detected by a resilient, selector-agnostic
  heuristic so a site redesign doesn't silently break it).
- Local-only popup and options pages: stats (including allowed exceptions), a
  detections log that never stores the matched secret value, detector toggles,
  an allowlist, and a custom always-redact list for your own data.
- Zero network requests, verified by source-level guards, unit tests, and an
  end-to-end Chromium check with request interception.
- Cross-platform packaging (`npm run package`, `npm run package:firefox`).

### Project
- MIT licensed. Privacy policy, store listing copy, and third-party attribution
  (`NOTICE`) included.
