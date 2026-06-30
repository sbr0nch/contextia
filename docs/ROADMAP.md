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

## Further out
- [ ] Verified detection (offline-safe live-credential checks) where possible.
- [ ] Managed tier: central policy, team audit, alerts — open-core (see SPEC §10).
- [ ] Support more AI chat composers beyond ChatGPT and Claude.
