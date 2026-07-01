# Changelog

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
