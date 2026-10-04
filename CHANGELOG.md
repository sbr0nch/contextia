# Changelog

## Unreleased

Changes after 2.1.0, found the same way: by running each surface as a user does, in real
browsers and on Windows and macOS, and by looking at the pictures. Every fix has a test that
fails without it; the measurements are in `docs/COVERAGE.md`.

**Proxy**

- Redact parsed the body and wrote it out again, which is not a faithful copy: `9007199254740993`
  became `9007199254740992`, `1.10` became `1.1`, a repeated key was dropped. The edit is now made
  on the text the client sent (a reader that agrees with `JSON.parse` on 80,000 random and mutated
  documents), so a body with nothing to redact is forwarded byte for byte. A secret used as an
  object key was never read; keys are scanned, blocked and redacted. A key that appears twice hides
  nothing: `JSON.parse` keeps the last value and another parser the first, so every occurrence
  is scanned (and redacted), in every mode. A first version of this refused such a body in Block
  mode but forwarded it unscanned in Redact and Warn; an independent review caught it.
- A 300 MB body took the proxy to 1,268 MB: it was read whole, with no limit. A body over 64 MB is
  answered 413 without being forwarded (peak memory for the same 300 MB: 130 MB), and the scan cap
  goes from 5 MB to 32 MB, so a 6 MB image request is no longer refused in Block mode. Decompression
  stops at the same cap. After a 413 the rest of the body is read and dropped (for at most 30 s),
  because on Windows and macOS the client otherwise saw a reset instead of the answer.
- `--reversible` did not restore a placeholder that a streamed reply cut across deltas
  (`⟨cx`, `:1`, `⟩`): the client received the placeholder. The text deltas are now joined
  per field before restoring. Tested with a stand-in streaming server, not a live model. The
  reply is still held until it is complete.
- An unreachable upstream was answered with `TypeError: fetch failed`; the reply now names the
  upstream and the cause (`ECONNREFUSED`).

**Engine**

- `env_secret` took seconds on keyword-dense text with no `=` (`AUTHAUTH...`: 3.3 s at 80 KB, quadratic):
  the name around the keyword is now bounded to 64 characters. Found by the same review.
- `env_secret` only saw an assignment at the start of a line, so `OPENAI_API_KEY=sk-... python app.py`,
  `docker run -e DB_PASSWORD=...` and a secret in a sentence went unseen (found by wrapping every
  detector's fixtures in 15 real contexts: 32 of 3,015 failed, all this one). An UPPER_CASE
  assignment is now read in the middle of a line too; a lower-case key still needs a line start
  (case-insensitive it flagged 144 minified-code fragments in 3,311 files of `node_modules`; as
  built, none). A shell variable (`$NAME`), a regular expression literal and a mid-line value holding
  brackets, braces, commas or semicolons (a minified bundle) are not values.

**CLI**

- `contextia proxy` on a port that is taken crashed with `Unhandled error event`. It says the port
  is in use (or not allowed) and exits 1.

**Claude Code plugin**

- The block could be lost: the hook called `process.exit()` right after writing, and on a pipe
  written asynchronously the message never left the process and the prompt went through. It now
  exits from the write callback.

**Browser extension**

- A send from a form that holds several editors (a system prompt and a message box) was judged on
  the first editor only. It now judges every editor in the form. Found by the same review.
- With two editors on the page (the composer, and the box that opens to edit a sent message)
  a send was judged on the first one: a secret in the edit box went through in Block mode, and
  a clean edit box was stopped for a secret sitting in the other. The editor is now taken from
  the event.
- Accessibility, measured with axe-core and the keyboard: the popup had no title or landmark and
  a mode menu with no name; the settings page had 85 unlabelled checkboxes; the in-page
  indicator was a `div` with no role or keyboard use; its panel went grey on a white page and
  its small text measured 1.6:1 (4.5:1 is the minimum). It is now a button that opens a dialog
  from Enter or Space, the panel is nearly opaque, and a blocked send is announced (role=alert).
- In Block mode an Enter pressed on Contextia's own indicator or on "Redact all" was read as a
  send and stopped, so a keyboard user could not resolve a block.
- When the browser's storage could not be read the popup spun forever and the settings page
  stayed blank with an uncaught error. Both now say so and offer "Try again".
- Seen in a real Firefox: a white scrollbar track inside the dark detector list, and the
  findings panel's title crowding its buttons. Fixed (dark scrollbars, a 320 px panel).

**Build and checks**

- `npm run test:pack` runs on Windows (it ran the installed CLI through npm's shell shim).
- Browser checks in CI: `test:a11y` (axe-core, keyboard), `test:states` (every screen in 18
  states at phone and desktop widths, with a fingerprint of each picture) and `test:firefox`
  (the extension installed in a real Firefox, driven with real key presses).
- A `Platforms` workflow runs the CLI, proxy and hook checks on Windows and macOS, Node 20 and 22;
  a scheduled `Mutation` workflow (`scripts/mutation.mjs`) scores the unit tests on the engine,
  proxy, core, JSON reader and the extension's pure modules.

**Behaviour that changes**: Block accepts bodies up to 32 MB (it refused anything over 5 MB) and a
request over 64 MB is answered 413;
`env_secret` finds more (upper-case assignments anywhere in a line); the findings panel is 320 px
wide instead of 300.

## v2.1.0

Found by running every surface the way a user does, with planted secrets and hostile
input, and by comparing with a second tool. Every fix has a test that fails without it.
The measurements are in `docs/COVERAGE.md`; `node scripts/benchmarks.mjs` reproduces them.

**Proxy**

- **A secret reached the upstream untouched in 9 of 13 request shapes**, with nothing on
  stderr: a `tool_result` (where the file an agent just read comes back), tool call
  arguments, the OpenAI Responses and legacy completions shapes, Gemini. The proxy read
  only `system` and `messages[].content` text. It now reads every string a request
  carries. Signed `thinking` fields and base64 media are left byte for byte.
- PATCH and DELETE bodies are scanned (it was POST and PUT). A text longer than the
  engine cap is scanned to the end instead of being refused in block mode or forwarded
  with its tail unread in redact mode.
- `--reversible` returned an invalid reply when the secret held a newline, a quote or a
  backslash (a PEM key, a connection string): both the JSON and the SSE answer stopped
  parsing. The value now goes back JSON-escaped.
- The proxy's own pages answered any web page the user had open: a text/plain POST
  put 99,999 fake events into the stats, and stats and the dashboard answered a foreign
  `Host`, which is what DNS rebinding sends. Both are refused.
- A 400 KB gzip body was expanded to 400 MB. Decompression stops at the 5 MB scan cap.

**Engine**

- `email`, `internal_hostname` and `db_connection_string` were quadratic (6.4 s, 6.3 s and
  3.7 s on 80 KB), and `private_key` took 11.7 s on 1 MB of repeated headers. On a
  paste, a prompt or a request that froze the browser tab, the proxy or the hook. All
  four are linear now and find what the regexes they replaced found, checked on 20,000
  random inputs each and on 9,809 real files.
- A token ending in `-` or `.` was not matched whole by 14 detectors (Discord, Telegram,
  GitLab, SendGrid, Square, OpenAI project keys, PyPI, PlanetScale, Figma, Airtable,
  Terraform Cloud, Flutterwave, Vault): about one token in 64.

**CLI**

- `contextia scan .` skipped every dotfile but `.env`, so `.env.production`, `.env.local`
  and `.aws/credentials` were never read. Present in every release since 0.1.0. It reads
  them now, follows symlinks to files and reads a file reachable under two names once.
- A file over the engine's 1,000,000-character cap printed a warning and "0 secrets found",
  exit 0, and `redact` printed the tail in clear. It is scanned in windows now.
- `scan --json` through a pipe stopped at 65,536 bytes (807,789 expected), so the JSON did not
  parse. Same run into a file was whole.
- An unknown command (`contextia scna .`) printed the help and exited 0, which in a
  pre-commit hook reads as clean. It exits 2. `--port abc` exits 2 with a message.
- The preview of a match showed 8 characters of anything over 10, two thirds of a
  12-character password. It shows at most a fifth. The browser extension had the same preview.

**Claude Code plugin**

- The hook crashed open: a missing bundle, a prompt field that was not text, or a stdin it
  could not read sent the prompt anyway, because the host treats a crash as non-blocking.
  It blocks, with a reason, whenever it cannot scan.

**Browser extension**

- In Block mode an Enter pressed within about 100 ms of the secret appearing went through:
  the handlers decided from a scan that runs 150 ms after the last input. They rescan first.

**Build**

- `npm run verify` failed on a fresh clone, so CI was red on the last five pushes to `main`,
  the 2.0.4 release included. The engine is built before typecheck and tests.
  `npm run test:clean` runs clone, `npm ci`, `verify`.
- `npm run test:pack` also fails when the committed plugin bundle is not what a build
  produces.

**Behaviour that changes**: exit 2 for an unknown command or bad port; shorter previews;
the proxy blocks and redacts more requests than before; `internal_hostname` stops at the
253 characters DNS allows.

## v2.0.4

- Dev dependencies move to TypeScript 7, vitest 4, esbuild 0.28, and the current
  `@types/node` and `@types/chrome`. All eight majors together, verified across
  every suite. `npm audit` goes from two high advisories to zero: the
  brace-expansion chain we could not fix without breaking the coverage run is
  gone with the newer tree.
- vitest 4 counts a branch vitest 3 did not, which turned up a case nobody had
  tested: a custom pattern that can match the empty string, such as `x*`. The
  guard against zero-length matches was already there, but nothing exercised it,
  so a regression would have gone unnoticed.


Two findings from putting the extension and the dashboard under load. Neither is
in the class that lets a secret through, and both were quiet failures rather
than loud ones.

- **The badge showed nothing on a prompt too long to scan.** Past the engine's
  one million character cap the tail goes unread, and an empty badge reads as
  "nothing found" when the honest answer is "we did not look". Block mode
  already refused to send; Warn, which is the default, said nothing at all. The
  badge now shows `?` and the indicator explains that the end of the message was
  not checked.
- **The proxy's per-site and per-detector counters grew without bound.** Both
  are keyed on strings supplied by the reporter, so a long-running proxy
  accumulated a key for every distinct value it was ever sent: measured at
  20,000 sites the stats payload reached 323 KB and the dashboard rendered
  20,052 rows, refreshing every two seconds. Counting stops at 200 distinct
  keys, and the dashboard shows the busiest 25.

What held up under the same load, worth recording: the extension scans a 200,000
character prompt in the same 180ms it takes for 1,000, without ever blocking the
main thread, and the dashboard absorbed 200,000 events in 1.8 seconds with exact
counts and nothing on stderr.

## v2.0.3

**`@sbr0nch/contextia-engine` could not be imported. Not in this release, in any
of them.** `exports` pointed at `./src/index.ts` while `files` shipped only
`dist`, and `exports` beats `main`, so every consumer got ERR_MODULE_NOT_FOUND
on the import line. Confirmed against the published tarballs for 0.1.0, 1.0.0,
1.2.0, 2.0.0 and 2.0.2: all of them. It survived five releases because nothing
in this repository consumes the package the way a stranger does. The CLI bundles
the engine from workspace source at build time, and the tests import `dist` by
absolute path, which bypasses `exports` entirely. Reported by someone who tried
to use it from another project and had to patch it locally.

`npm run test:pack` packs the tarballs, installs them into a project with no
workspace to fall back on, and imports them by name. Restore the old `exports`
and three of its six cases fail.


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
