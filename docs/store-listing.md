# Browser store listings: paste-ready copy

Content for the Chrome Web Store, Microsoft Edge Add-ons, and Firefox AMO
consoles. Keep it honest. The same copy works for all three stores.

## Name
Contextia: Secret guard for AI chats

## Summary (max 132 chars)
Catch API keys, tokens, credentials before you paste them into ChatGPT or Claude. Local and on-device: nothing leaves your machine.

## Category
Developer Tools

## Detailed description

> Do not list vendor or brand names here. The Chrome Web Store rejected v0.1.0
> under Yellow Argon (Spam and Placement) for "excessive keywords in the item's
> description", citing the roster of credential providers. Describe categories,
> not brands. The full detector list belongs in the repository.

Contextia is a local, privacy-first guard that flags secrets in the chat composer
before they ever leave your machine.

Developers paste code, logs and configs into AI chats every day, and those often
contain live API keys, tokens, private keys and connection strings. Contextia
catches them at the moment of typing or pasting, entirely on your device.

What it does:
• Detects over 80 kinds of credential, covering cloud provider keys, source
  control and package registry tokens, payment and messaging service keys, AI
  provider keys, PEM private keys, .env secrets, database connection strings
  and JWTs.
• Optionally flags personal data as well: card numbers validated by checksum,
  IBANs and national identifiers. Off unless you turn them on.
• Explains why each match was flagged, so it is never a mystery.
• Underlines the offending text and offers Redact, Allow once, Allow all, or
  Allow this pattern always.
• Lets you add your own values and regular expressions to always redact.
• Four modes: Warn, Auto-redact before sending, Block until resolved, or Off.
• Keeps a local detections log and counters on your device. Never the secret
  value itself.

Privacy by construction:
• Nothing leaves your machine. No accounts, no servers, no telemetry, no third
  parties.
• Zero network requests by default. You may optionally mirror catch counts,
  never the secret, to a dashboard on your own machine over loopback. It is off
  unless you enable it and refuses any address that is not loopback.
• Runs only on the AI chat sites listed in the permissions, and requests no
  other access.
• Open source under the MIT licence. Audit every line:
  https://github.com/sbr0nch/contextia

Contextia is a safety net, not a guarantee: rule-based detection can miss things,
so treat it as a guardrail, not proof that a paste is clean.

## Single purpose (required field)
Detect secrets in the AI chat composer and let the user redact, allow, or block
them before they are submitted. All processing is local to the device.

## Permission justifications (required)
- storage: persist the user's settings, allow/redact lists, and a local detections
  log on the device. Nothing is synced or transmitted.
- host access (chatgpt.com, claude.ai, gemini.google.com, aistudio.google.com,
  copilot.microsoft.com, www.perplexity.ai, chat.deepseek.com): read the composer
  text on these AI chat sites to scan it locally. No other hosts are requested.
  No remote code.
- optional host access (http://127.0.0.1/*, http://localhost/*): requested only if
  the user turns on the optional local stats endpoint, so the extension can post
  aggregate counts (never the secret) to a dashboard on the user's own machine.
  Loopback only; not requested otherwise.

## Data usage disclosures (store privacy form)
- Does this item collect or use user data? No data is collected or transmitted
  off the device.
- All processing is local. The optional local stats endpoint sends only aggregate
  counts (never the secret value) to a loopback address on the user's own machine,
  and only if the user enables it. No analytics, no tracking, no third parties.

## Privacy policy URL
https://github.com/sbr0nch/contextia/blob/main/PRIVACY.md

Do not use https://contextia.dev/privacy until that page actually exists. It
returns 404 today, and a store will reject an unreachable privacy policy.

## Assets to upload
- Icon: 128×128 (packages/extension/public/icons/icon-128.png)
- Screenshots 1280×800 (capture from the loaded extension):
  1. A detection in the ChatGPT/Claude composer (underline + indicator)
  2. The popover with Redact / Allow once / Allow all
  3. The popup with stats and recent log
  4. The Settings page (modes, detector toggles, allow/redact lists)
- Optional Chrome promo: small tile 440×280, marquee 1400×560.

## Build to upload
- Chrome / Edge: `npm run package` → `packages/extension/contextia.zip`
- Firefox: `npm run package:firefox` → `packages/extension/contextia-firefox.zip`

## Per-store notes
- **Chrome Web Store** ($5 one-time): https://chrome.google.com/webstore/devconsole
  Fill Single purpose + per-permission justifications + data disclosures.
- **Microsoft Edge** (free): https://partner.microsoft.com/dashboard/microsoftedge
  Accepts the same MV3 `contextia.zip`.
- **Firefox AMO** (free): https://addons.mozilla.org/developers/
  Upload `contextia-firefox.zip`; source is public so review is fast.
