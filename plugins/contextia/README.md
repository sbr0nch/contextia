# Contextia for Claude Code

Blocks a prompt before it reaches the model when it contains a secret: an API
key, token, private key, connection string, and more. Self-contained (the
detection engine is bundled): it needs only Node, nothing else to install.
Everything runs on-device; nothing is sent anywhere.

## Install

```
/plugin marketplace add sbr0nch/contextia
/plugin install contextia@contextia
/reload-plugins
```

Now, if you submit a prompt that contains a secret, Claude Code stops it and
tells you what was found. Remove it and send again.

## Update

Two steps, and the second is the one people miss. Refreshing the marketplace
pulls the new catalog; it does not update the copy you already have installed.

```
/plugin marketplace update contextia
/plugin update contextia@contextia
/reload-plugins
```

Claude Code enables auto-update by default only for Anthropic's own
marketplaces. Third-party ones, this included, start with it off, so nothing
arrives on its own until you turn it on: `/plugin`, the **Marketplaces** tab,
select `contextia`, then **Enable auto-update**.

## Uninstall

```
/plugin uninstall contextia@contextia
```

Or open `/plugin`, go to the **Installed** tab, and disable or uninstall it
there.

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
It reads a local file only; nothing is fetched.

## Notes

- It **blocks**; it does not rewrite. Claude Code hooks can't edit the prompt
  text, so redaction lives in the CLI's proxy (`contextia run -- claude`) and in
  the browser extension.
- Blocks on the default (critical) detectors.
- A guardrail, not a guarantee. Rule-based detection can miss unusual formats.
