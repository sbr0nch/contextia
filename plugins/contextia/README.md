# Contextia — Claude Code plugin

Blocks a prompt before it reaches the model when it contains a secret — an API
key, token, private key, connection string, and more. Detection runs on-device;
nothing is sent anywhere.

## Install

The plugin uses the Contextia CLI. Install it first, then add the plugin:

```bash
npm i -g @sbr0nch/contextia
```

```
/plugin marketplace add sbr0nch/contextia
/plugin install contextia@contextia
```

That's it. Now, if you submit a prompt that contains a secret, Claude Code stops
it and tells you what was found — remove it and send again.

## Notes

- It **blocks**; it does not rewrite. Claude Code hooks can't edit the prompt
  text, so redaction lives in the CLI's proxy (`contextia run -- claude`) and in
  the browser extension.
- Blocks on the default (critical) detectors. It fails open: if the CLI isn't on
  your `PATH`, prompts are not blocked.
- A guardrail, not a guarantee — rule-based detection can miss unusual formats.
