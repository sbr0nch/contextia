# Browser store listings — paste-ready copy

Content for the Chrome Web Store, Microsoft Edge Add-ons, and Firefox AMO
consoles. Keep it honest. The same copy works for all three stores.

## Name
Contextia — Secret guard for AI chats

## Summary (max 132 chars)
Catch API keys, tokens and credentials before you paste them into ChatGPT or Claude. Local, on-device, zero network.

## Category
Developer Tools

## Detailed description
Contextia is a local, privacy-first guard that flags secrets in the chat composer
before they ever leave your machine.

Developers paste code, logs and configs into AI chats every day — and those often
contain live API keys, tokens, private keys and connection strings. Contextia
catches them at the moment of typing or pasting, entirely on your device.

What it does:
• Detects 40+ credential types — AWS, GitHub, GitLab, Stripe, Slack, OpenAI,
  Anthropic, Google, Azure, Twilio, SendGrid and more — plus PEM private keys,
  .env secrets, database connection strings, JWTs, and personal data like
  Luhn-valid credit-card numbers and IBANs.
• Explains why each match was flagged, so it's never a mystery.
• Underlines the offending text and shows a popover: Redact, Allow once, Allow
  all, or Allow this pattern always.
• Add your own data to always redact (custom values and regex patterns).
• Modes: Warn, Auto-redact before sending, Block until resolved, or Off.
• A local detections log and stats — stored on your device, never the secret value.

Privacy by construction:
• Zero network requests. No accounts, no servers, no telemetry, no third parties.
• Runs only on supported AI chat sites (ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek). Requests no other access.
• Open source (MIT) — audit every line: https://github.com/sbr0nch/contextia

Contextia is a safety net, not a guarantee: rule-based detection can miss things,
so treat it as a guardrail, not proof that a paste is clean.

## Single purpose (required field)
Detect secrets in the AI chat composer and let the user redact, allow, or block
them before submitting — entirely on-device.

## Permission justifications (required)
- storage: persist the user's settings, allow/redact lists, and a local detections
  log on the device. Nothing is synced or transmitted.
- host access (chatgpt.com, claude.ai, gemini.google.com, aistudio.google.com,
  copilot.microsoft.com, www.perplexity.ai, chat.deepseek.com): read the composer
  text on these AI chat sites to scan it locally. No other hosts are requested.
  No remote code, no network.

## Data usage disclosures (store privacy form)
- Does this item collect or use user data? No data is collected or transmitted.
- All processing is local; nothing is sent off-device. No analytics, no tracking.

## Privacy policy URL
Use either:
- https://github.com/sbr0nch/contextia/blob/main/PRIVACY.md  (works immediately)
- https://contextia.dev/privacy  (once the site hosts it)

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
  — fill Single purpose + per-permission justifications + data disclosures.
- **Microsoft Edge** (free): https://partner.microsoft.com/dashboard/microsoftedge
  — accepts the same MV3 `contextia.zip`.
- **Firefox AMO** (free): https://addons.mozilla.org/developers/ — upload
  `contextia-firefox.zip`; source is public so review is fast.
