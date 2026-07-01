# Contextia — Claude Code plugin

Blocks a prompt before it reaches the model when it contains a secret — an API
key, token, private key, connection string, and more. Self-contained (the
detection engine is bundled): it needs only Node, nothing else to install.
Everything runs on-device; nothing is sent anywhere.

## Install

```
/plugin marketplace add sbr0nch/contextia
/plugin install contextia@contextia
```

That's it. Now, if you submit a prompt that contains a secret, Claude Code stops
it and tells you what was found — remove it and send again.

## Update / uninstall

```
/plugin marketplace update contextia   # pull the latest
/plugin                                 # menu: enable, disable, or uninstall
```

## Configuration (optional)

By default the plugin blocks on the critical detectors. To customise which
detectors run, or to add allowlists, set `CONTEXTIA_CONFIG` to a JSON file using
the engine's `Config` shape:

```jsonc
// contextia.config.json
{
  "enabledDetectors": ["aws_access_key_id", "aws_secret_access_key", "github_token"],
  "allowlist": { "values": ["AKIAEXAMPLE"], "patterns": ["EXAMPLE_[A-Z]+"] }
}
```

```
export CONTEXTIA_CONFIG=/path/to/contextia.config.json
```

If the variable is unset or the file can't be read, the engine defaults apply.
It reads a local file only — nothing is fetched.

## Notes

- It **blocks**; it does not rewrite. Claude Code hooks can't edit the prompt
  text, so redaction lives in the CLI's proxy (`contextia run -- claude`) and in
  the browser extension.
- Blocks on the default (critical) detectors.
- A guardrail, not a guarantee — rule-based detection can miss unusual formats.
