# Deploying Contextia for a team

Contextia is most useful where someone controls the laptops and browsers: a
small team, a project, an SMB. The point is to make protection **mandatory and
invisible**, not something each person has to opt into.

There are two surfaces to deploy: the browser extension and the terminal proxy.

## 1. Browser extension: force-install via policy

Managed Chrome/Edge can install an extension on every device automatically. The
user never has to click anything, and (optionally) cannot remove it.

**Chrome / Edge (enterprise policy):** add the extension ID to
`ExtensionInstallForcelist`. On managed devices this is pushed via Google Admin
console, Microsoft Intune, or a Group Policy / plist:

```
# Windows (registry), Chrome example
HKLM\Software\Policies\Google\Chrome\ExtensionInstallForcelist
  1 = "<EXTENSION_ID>;https://clients2.google.com/service/update2/crx"
```

```jsonc
// macOS / Linux managed policy (com.google.Chrome / chrome.json)
{ "ExtensionInstallForcelist": ["<EXTENSION_ID>;https://clients2.google.com/service/update2/crx"] }
```

Replace `<EXTENSION_ID>` with the published Web Store ID once the extension is
listed. Until then you can host the packaged `.crx` internally and point the
policy at your own update URL. Firefox has the equivalent via the
`ExtensionSettings` enterprise policy (`installation_mode: force_installed`).

## 2. Terminal / agents: the proxy

Developers using AI coding agents (Claude Code, Cursor, aider, API scripts)
should route the agent through the proxy so secrets are redacted before they
leave the machine. The low-friction way is the `run` wrapper, with no manual setup:

```bash
contextia run -- claude            # redact mode (default)
contextia run --mode block -- cursor
```

Bake it into a shared alias or a project script so it is the default way people
launch their agent:

```bash
# team .zshrc / project Makefile
alias claude='contextia run -- claude'
```

For a shared egress point instead of per-laptop, run one proxy and point agents
at it with `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL`. The proxy binds loopback by
default, so a shared instance has to be told to listen on a reachable address:

```bash
contextia proxy --mode redact --port 8787 --host 0.0.0.0
#   live stats: http://<host>:8787/__contextia
```

Only do this on a network you control. Everything the agents send passes through
this process in plaintext, and the stats dashboard is served to anyone who can
reach the port. Put it behind the same access controls as any internal service;
on a laptop, leave the default and use `contextia run` instead.

## 3. Optional: pin a team policy file

Ship a JSON file of the values/patterns your org always wants redacted (internal
hostnames, customer IDs, project code-names) and reference it everywhere:

```bash
contextia run --redact-file /etc/contextia/redact.json -- claude
```

```jsonc
// /etc/contextia/redact.json
{ "values": ["ACME-INTERNAL"], "patterns": ["CUST-\\d{6}"] }
```

## Notes

- Everything stays on-device. The proxy only forwards the agent's own request to
  the LLM API it was already calling; nothing else leaves the machine.
- This is a guardrail, not a guarantee. Rule-based detection can miss things.
  Pair it with the usual practices (secret managers, pre-commit scanning).
