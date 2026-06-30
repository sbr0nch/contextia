# Chrome Web Store — listing copy

Paste-ready content for the Web Store developer console. Keep it honest.

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
• Detects AWS, GitHub, Stripe, Slack, OpenAI, Anthropic, Google and Azure keys,
  PEM private keys, .env secrets, database connection strings, JWTs and more.
• Underlines the offending text and shows a popover: Redact, Allow once, or Allow
  this pattern always.
• Modes: Warn, Auto-redact before sending, Block until resolved, or Off.
• A local detections log and stats — stored on your device, never the secret value.

Privacy by construction:
• Zero network requests. No accounts, no servers, no telemetry, no third parties.
• Runs only on chatgpt.com and claude.ai. Requests no other access.
• Open source (MIT) — audit every line: https://github.com/sbr0nch/contextia

Contextia is a safety net, not a guarantee: rule-based detection can miss things,
so treat it as a guardrail, not proof that a paste is clean.

## Single purpose (required field)
Detect secrets in the AI chat composer and let the user redact, allow, or block
them before submitting — entirely on-device.

## Permission justifications (required)
- storage: persist the user's settings and a local detections log on the device.
- host access (chatgpt.com, claude.ai): read the composer text on those two sites
  to scan it locally. No other hosts are requested.

## Data usage disclosures (Web Store form)
- Does this item collect or use user data? No data is collected or transmitted.
- All processing is local; nothing is sent off-device.

## Privacy policy URL
https://contextia.dev/privacy  (or the repo's PRIVACY.md)

## Assets to upload
- Icon: 128×128 (packages/extension/public/icons/icon-128.png)
- Screenshots 1280×800 (popup, options, in-composer detection, popover)
- Small promo tile 440×280 and marquee 1400×560 (optional, from the brand kit)

## Build to upload
Run `npm run package --workspace @contextia/extension` → produces
`packages/extension/contextia.zip`. Upload that zip.
