# Privacy Policy

**Last updated: 2026-06-30**

Contextia is a browser extension that detects secrets in text before you send it
to an AI chat assistant. It is designed to be private by construction.

## The short version

**Contextia collects nothing. It sends nothing. Everything runs on your device.**

The extension makes **zero network requests**. There are no accounts, no servers,
no analytics, no telemetry, and no third parties.

## What Contextia processes

To do its job, the extension reads the text you type or paste into the chat
composer on the supported AI chat sites (ChatGPT, Claude, Gemini, Google AI
Studio, Microsoft Copilot, Perplexity, DeepSeek) and scans it locally
for credential patterns. This processing happens entirely in your browser, in
memory. The text you type is never transmitted anywhere by Contextia.

## What Contextia stores

Contextia stores a small amount of data **locally on your device only**, using the
browser's `chrome.storage.local` API. This never leaves your machine and is never
synced. It consists of:

- **Settings** — your selected mode, which detectors are enabled, and your
  allowlists.
- **A local detections log** — for each detection: a timestamp, the site, the
  detector type, the severity, and the action taken (flagged / redacted / allowed
  / blocked). **The matched secret value itself is never stored.**
- **Aggregate counters** — e.g. how many secrets were caught.

You can clear all of this at any time from the extension's popup or options page.

> Note: if you explicitly choose "Allow this pattern always," the value or pattern
> you allowlisted is saved in your local settings — because that is the feature you
> asked for. It still never leaves your device.

## Permissions

- **`storage`** — to save your settings and the local log on your device.
- **Host access to `chatgpt.com` and `claude.ai` only** — so the extension can
  read the composer on those AI chat sites. Contextia requests no other host access.

## Data sharing

None. Contextia does not collect, transmit, sell, or share any data with anyone.

## Changes

If this policy changes, the updated version will be published in this repository
with a new "Last updated" date.

## Contact

Questions or reports: open an issue at
<https://github.com/sbr0nch/contextia/issues>.
