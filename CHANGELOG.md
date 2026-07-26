# Changelog

## Unreleased

**The browser extension missed secrets in any multi-line prompt.** `getText()`
read `textContent`, which concatenates block elements with no separator at all.
Every editor on the supported sites is block-based, so a two-paragraph prompt
came back as one unbroken run of characters and the tokens at the block
boundaries stopped matching. Measured on the exact shape ChatGPT and Claude
produce: two planted secrets, zero flagged. Nothing appeared in the badge, so
there was no sign anything had gone wrong. It reads `innerText` now, collapsing
the blank line browsers insert between blocks so that writing the text back
reproduces the same number of blocks instead of doubling every line break.

**A client hanging up mid-request killed the proxy.** The body read rejects when
the socket goes away, the rejection escaped unhandled, and Node took the process
down with it. Ctrl+C in your agent was enough, and every request after that got
ECONNREFUSED: the guard was gone, and nothing said so. Rejections are caught
now, malformed requests are answered rather than fatal, and the response loop
stops reading upstream once the client has left. Streaming stays incremental,
which was worth checking while changing that loop.

- `npm run test:proxy` runs the proxy as a real process over a real socket:
  client aborts, an upstream that dies mid-response, a malformed request, and 50
  concurrent requests. The unit suite drives the server in-process with
  well-behaved clients, so none of this was reachable from it. Put the old
  `void handle(...)` back and all eight cases fail.
- `npm run test:dom` drives the built extension in Chromium against the DOM
  shapes the supported sites use: Lexical and ProseMirror paragraphs, Quill,
  plain contenteditable, and a textarea. It asserts against the badge the
  extension itself renders, so what is checked is what a user would see. Put the
  old `textContent` back and four of the seven cases fail, which is the only
  reason to trust a regression test.
- `npm run test:docs` runs the commands the documentation tells people to run
  and checks they do what is promised, including the exit codes a pre-commit
  hook depends on. Three defects so far have come from the docs rather than the
  code, and none of them were reachable by testing functions.
- CI runs both.

## v2.0.2

The 2.0.1 logo fix broke the logo. Parsing the mark as XML without an `xmlns`
puts every element in no namespace, so the browser treats them as unknown tags
and paints nothing. Size, child count and `querySelector` all still behave,
which is why nothing caught it: the only symptom is an invisible mark in the
popup, the options page and the in-page badge. `MARK_SVG` declares the namespace
now, `svgNode()` adds it when markup omits it, and a test asserts `namespaceURI`
rather than trusting geometry.

- `npm run screenshots` regenerates the store screenshots from the current build
  with Playwright. The old set was captured by hand once, never again, and had
  drifted to a two-major-old UI and the previous logo. The demo page is
  deliberately generic: a listing that mocks up a real chat product's interface
  is misleading whatever the intent.
- `contextia scan .` and `contextia scan src/` used to die on an EISDIR stack
  trace and exit 0. That is the documented usage for pre-commit hooks and CI,
  where exiting 0 on a crash reads as a clean scan. Directories are walked now,
  skipping dependency and build trees, and an unreadable path exits 2.
- `env_secret` matched 272 times across 3623 files of third-party code, every
  one of them wrong: the pattern was written for `.env` lines but runs on any
  text, so `nextToken = punctuator;` reads as KEY=value because the key contains
  "token". A value ending in a statement terminator is code, and secret material
  carries digits or base64 padding. Same corpus, 284 findings down to 13.

## v2.0.1

Every surface now ships the same version number, including the ones that did not
change. They had drifted (the plugin sat at 1.2.1 while the packages were at
1.3.0) and drift is what makes a release take an evening instead of ten minutes.

- The popup, options page and in-page badge built their SVG by assigning a
  constant to `innerHTML`. Nothing was ever interpolated into that markup, so it
  was not exploitable, but AMO and the Chrome Web Store flag every `innerHTML`
  write and an extension that sells caution should not be arguing the point.
  They now parse the markup once with `DOMParser` and append a real node.
  No behaviour change.
- `npm run preflight` checks the things that stay invisible until a store
  reviewer finds them: version drift across the six channels, `innerHTML` in a
  built bundle, em dashes in tracked files, a dirty tree. It prints the
  per-channel checklist with the version filled in.
- `RELEASING.md` writes down where each of the six version numbers lives and the
  order to publish in. The Claude Code plugin needs two files bumped, not one,
  which is why the last plugin update never reached anyone.

## v2.0.0

Security and correctness pass. Two changes break existing setups, which is why
this is a major: the proxy no longer answers on the network, and Block mode now
refuses requests it used to forward. Read the first two entries before upgrading.

- **The proxy now binds loopback only.** It previously listened on every
  interface, so the prompts passing through it and the stats dashboard were
  reachable from the local network. Use `--host` to opt out deliberately; doing
  so prints a warning.
- **Block mode fails closed.** A request body the proxy cannot read is unknown,
  not clean, and is now refused with `contextia_unscannable` instead of being
  forwarded. This covers gzip/deflate/br bodies (previously passed through
  unscanned, secrets and all), bodies over the 5 MB cap, bodies that are not
  JSON, and text longer than the engine scan cap. Warn and redact modes still
  forward, but log a warning and count the request in a new `unscanned` stat.
- **Compressed request bodies are decoded before scanning**, so a gzipped prompt
  is redacted like any other instead of slipping through.
- **The Claude Code plugin hook fails closed** on a prompt too long to scan in
  full, rather than allowing the part it never read.
- Overlapping findings now redact the union of their spans. A short warning
  overlapping a longer critical used to suppress it and leave the rest of the
  secret in clear.
- `detectDetailed()` reports whether input hit the scan cap, so an empty result
  is no longer indistinguishable from a clean scan. The CLI warns on truncation;
  the extension treats a truncated scan as unresolved in Block mode.
- `Expect: 100-continue` is no longer relayed upstream. Clients that send it
  (curl does, above 1 KB) previously got a 502 from every request.
- Dev dependencies moved to vitest 3, happy-dom 20 and esbuild 0.25, clearing
  all three critical advisories (a happy-dom VM escape and a vitest arbitrary
  file read, both reachable by anyone running the suite on an untrusted branch).
  None of these ship: the published packages contain only `dist`. Four advisories
  remain, all the same brace-expansion DoS surfacing through glob, minimatch and
  test-exclude. Its only fix, brace-expansion 5.x, changes the export shape and
  breaks minimatch, so taking it would trade an audit line for a broken coverage
  run. Left in place deliberately until the chain upstream moves.
- An invalid allowlist pattern no longer throws on every scan. Allowlist
  patterns are typed by the user in settings, so one stray bracket used to
  break detection entirely; bad patterns are skipped and the rest still apply.
- The send gate moved into `gate.ts` as two pure functions, so Block mode's
  refusal to send on a partially scanned composer is covered by tests instead of
  being buried in DOM handlers.
- `docs/DEPLOYMENT.md` now shows `--host` for the shared-proxy setup, which the
  loopback default would otherwise have silently broken, with a note on what
  exposing it means.
- The README states the reversible-mode trade-off: restoring puts the real value
  back into the response, so it lands wherever the agent writes its replies.
- The stats dashboard escapes detector and site labels, which arrive from the
  browser reporter and were rendered as markup.

## v1.3.0

- Optional **local stats endpoint**: the browser extension can mirror catch
  **counts** (detector, site, action, count; never the secret value) to a
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
- Structured personal-data detectors (83 total), opt-in like the existing PII
  ones: US Social Security Number (area/group/serial validation), US ITIN, India
  Aadhaar (Verhoeff checksum), India PAN, UK National Insurance number, E.164
  phone numbers, and crypto: Bitcoin private keys (WIF, on by default as they are
  secrets), Ethereum and Bitcoin (bech32) addresses. Free-text categories that
  need an NLP model (names, addresses) are deliberately out of scope for the
  deterministic on-device engine.

## v1.2.1

- Claude Code plugin: optional `CONTEXTIA_CONFIG` environment variable to point at
  a JSON config (the engine's `Config` shape) that scopes detectors and adds
  allowlists. Unset falls back to the defaults; it reads a local file only.

## v1.2.0

- 11 more detectors (58 total): Figma, Airtable, Terraform Cloud, Dropbox, xAI
  (Grok), Flutterwave, Razorpay, Fireworks AI, Atlassian, and Tailscale tokens.
- Optional one-line "redacted by Contextia" note on redacted requests, a signal
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
- `contextia proxy`: a local proxy that sits between your AI agent and the LLM
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
