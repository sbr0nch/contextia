# Contextia

Catch secrets before they reach an AI chat.

Contextia is a local, privacy-first browser extension that scans what you're
about to send to an AI assistant — API keys, tokens, private keys, connection
strings and other credentials — and lets you redact, allow, or block it before
it leaves your device. Everything runs on-device. **The extension makes no
network requests.**

> A safety net, not a guarantee. Detection is rule-based and can miss things —
> treat it as a guardrail, not proof that a paste is clean.

## How it works

- A small detection **engine** scans draft text for known credential patterns
  and high-entropy secrets.
- The **browser extension** watches the chat composer on supported sites and
  runs the engine as you type or paste — flagging findings inline.
- You decide what happens: redact the match, allow it once, or always allow a
  pattern. An optional Block mode prevents submitting until findings are
  resolved.

Supported sites (v1): ChatGPT (`chatgpt.com`) and Claude (`claude.ai`).

## Architecture

This is an npm workspace with two packages:

| Package | What it is |
|---|---|
| `packages/engine` | The detection core. Pure functions, no DOM, no network, dependency-light. |
| `packages/extension` | The Manifest V3 browser extension that consumes the engine. |

The engine is deliberately environment-agnostic so other surfaces can reuse it
without a rewrite.

## Install (unpacked)

```bash
npm install
npm run build --workspace @contextia/extension   # outputs packages/extension/dist
```

Then in Chrome: open `chrome://extensions`, enable **Developer mode**, click
**Load unpacked**, and select `packages/extension/dist`.

## Development

```bash
npm install
npm test          # engine test suite with coverage
npm run build     # build all packages
```

## License

[MIT](./LICENSE). Third-party rule patterns and their licenses are recorded in
[`NOTICE`](./NOTICE).
