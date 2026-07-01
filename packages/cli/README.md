<p align="center">
  <img src="https://raw.githubusercontent.com/sbr0nch/contextia/main/docs/brand/contextia-logo.png" alt="Contextia" width="320">
</p>

# @sbr0nch/contextia

Keep secrets out of AI, from the terminal. Built on
[`@sbr0nch/contextia-engine`](https://github.com/sbr0nch/contextia/tree/main/packages/engine).

```bash
npm install -g @sbr0nch/contextia
```

## Commands

```bash
contextia scan [files...]     # scan files or stdin; exits 1 if any secret is found
contextia redact [files...]   # print the input with secrets replaced by tokens
contextia proxy               # local AI-DLP proxy (see below)
contextia run -- <cmd>        # launch an AI agent with the proxy already wired in
contextia list                # list detectors
contextia version
contextia help
```

### Guard an agent in one step

No manual base-URL setup — `run` starts the proxy, points the agent at it, and
launches it:

```bash
contextia run -- claude
contextia run --mode block -- cursor
```

### Scan (general secret scanning — git hooks, CI)

```bash
contextia scan .env src/
git diff | contextia scan
```

### Proxy (AI-DLP: redact what your agent sends to the LLM)

Run a local proxy and point your AI agent's API base URL at it. The proxy scans
each outgoing request and warns / redacts / blocks secrets **before they leave the
machine** — the real key never reaches the provider.

```bash
contextia proxy --mode redact
ANTHROPIC_BASE_URL=http://localhost:8787 claude    # or OPENAI_BASE_URL=…
```

Live stats at `http://localhost:8787/__contextia`. Options: `--mode warn|redact|block`,
`--port`, `--upstream`, `--all`.

Everything runs locally; the only network call is forwarding the agent's own
request to the LLM API it was already calling.

## Update / uninstall

```bash
npm i -g @sbr0nch/contextia@latest   # update
npm rm -g @sbr0nch/contextia         # uninstall
```
