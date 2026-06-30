# Security Policy

Contextia is a security tool, so we take reports seriously.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, use
GitHub's private vulnerability reporting:

- Go to the repository's **Security** tab → **Report a vulnerability**, or
- email the maintainer (see the GitHub profile).

Include the affected surface (engine / CLI / proxy / extension), a description,
and steps to reproduce. We aim to acknowledge within a few days.

## Scope

Useful things to report:

- A detector that misses an obvious live-credential format (false negative), or
  a pattern that is so noisy it is unusable (false positive).
- Any way the **browser extension** makes a network request — it must make
  **none**. This is covered by tests; a regression is a security bug.
- Any way a matched secret value gets persisted (logs, storage) — only the
  detector type, severity, site, action and timestamp may be stored.
- A way the **proxy** forwards a secret upstream in redact/block mode.

## Supported versions

The latest published version is supported. Fixes land on `main` and ship in a
new release.
