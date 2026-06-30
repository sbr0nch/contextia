# Roadmap

Tracked next steps for Contextia. Not commitments — a working list.

## Detection research (DLP / text scanning)
- [ ] Survey how secrets/PII are detected in text by researchers and by
      competitors, and adopt what proves effective or promising:
  - academic and open-source approaches (entropy/statistics, ML/NER,
      context-aware rules, candidate **validation/verification** to cut false
      positives);
  - how DLP tools and secret scanners (gitleaks, detect-secrets, TruffleHog,
      cloud DLP, etc.) detect and rank findings;
  - record every adopted source with its **license** in `NOTICE`.
- [ ] Turn the strongest findings into new detectors or a smarter ranking layer,
      keeping the engine dependency-light and the false-positive rate low.

## More browsers / stores
- [ ] Package and publish the extension for **Firefox (AMO)** and **Microsoft
      Edge Add-ons**, and other Chromium stores where it makes sense — from the
      same codebase (MV3; add a small browser-compat shim if needed).

## More surfaces (same environment-agnostic engine, no rewrite)
- [ ] **CLI** (`packages/cli`): scan stdin/files, print or redact findings — for
      pre-commit hooks, CI, and manual use. Low effort; engine is ready.
- [ ] **SDK**: publish `@contextia/engine` to npm for third parties to embed.
- [ ] **Local proxy** for terminal AI agents: a local server the tool points its
      `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL` at; scans/redacts/blocks the request
      body before it leaves. One component covers any terminal/agent. Medium effort.
- [ ] **Mobile** (future, native): the engine is pure JS (runs in React
      Native/WebView); the surface is a custom keyboard (IME) / share-sheet on
      Android & iOS, plus possibly the Firefox build on Android Firefox.

## Detector maintenance — automate, don't hand-curate forever
- [ ] **Rule generator**: convert a permissively-licensed upstream ruleset
      (e.g. gitleaks rules — MIT; verify license of any source) into our `Detector`
      format at build time, so we sync hundreds of patterns instead of writing each.
- [ ] **Automated FP gate**: run generated rules against the negative corpus and
      keep only those under the false-positive threshold; the hand-curated set
      stays for the highest-value, lowest-FP detectors.
- [ ] Lean on the generic entropy + context heuristics for the unknown long tail.

## Further out
- [ ] Verified detection (offline-safe live-credential checks) where possible.
- [ ] Managed tier: central policy, team audit, alerts — open-core (see SPEC §10).
      This is the desktop/managed piece that connects to SentriKat.
- [ ] Support more AI chat composers beyond ChatGPT and Claude.
