import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createProxyServer, detokenize } from '../src/proxy.js'

// --reversible restores the original value inside the model's reply. The reply
// is JSON (or SSE lines of JSON), and the token sits inside a JSON string. A
// value with a newline, a quote or a backslash, restored raw, broke the reply:
// measured with a PEM private key, both the JSON and the SSE answer stopped
// parsing, so the client got an error instead of an answer.
const PEM = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX\n-----END RSA PRIVATE KEY-----'
const URL_WITH_SPECIALS = 'postgres://admin:pa"ss\\word@db.example.com:5432/app'

const open: Server[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))))
})
const listen = (s: Server): Promise<number> =>
  new Promise((r) => {
    open.push(s)
    s.listen(0, () => r((s.address() as AddressInfo).port))
  })

/** Upstream that answers with the text it was sent, as JSON, SSE or plain text. */
function echo(kind: 'json' | 'sse' | 'text'): Server {
  return createServer(async (req, res) => {
    const ch: Buffer[] = []
    for await (const c of req) ch.push(c as Buffer)
    const text = (JSON.parse(Buffer.concat(ch).toString('utf8')) as { messages: Array<{ content: string }> }).messages[0]!.content
    if (kind === 'json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ content: [{ type: 'text', text }] }))
    } else if (kind === 'sse') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(`event: delta\ndata: ${JSON.stringify({ type: 'delta', text })}\n\n`)
    } else {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(text)
    }
  })
}

async function ask(kind: 'json' | 'sse' | 'text', content: string): Promise<string> {
  const upPort = await listen(echo(kind))
  const proxy = createProxyServer({ port: 0, mode: 'redact', reversible: true, signature: false, upstream: `http://localhost:${upPort}` })
  const port = await listen(proxy)
  const res = await fetch(`http://localhost:${port}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  })
  return res.text()
}

describe('--reversible keeps the reply valid', () => {
  for (const [label, secret] of [
    ['a multi-line PEM key', PEM],
    ['a value with a quote and a backslash', URL_WITH_SPECIALS],
  ] as const) {
    it(`JSON reply restores ${label} and still parses`, async () => {
      const body = await ask('json', `use this\n${secret}\nthanks`)
      const parsed = JSON.parse(body) as { content: Array<{ text: string }> }
      expect(parsed.content[0]!.text).toBe(`use this\n${secret}\nthanks`)
    })

    it(`SSE reply restores ${label} and every data line still parses`, async () => {
      const body = await ask('sse', `use this\n${secret}\nthanks`)
      const lines = body.split('\n').filter((l) => l.startsWith('data: '))
      expect(lines.length).toBe(1)
      expect((JSON.parse(lines[0]!.slice(6)) as { text: string }).text).toBe(`use this\n${secret}\nthanks`)
    })
  }

  it('a plain-text reply gets the raw value, not an escaped one', async () => {
    expect(await ask('text', `use this\n${PEM}\nthanks`)).toBe(`use this\n${PEM}\nthanks`)
  })
})

describe('detokenize', () => {
  const vault = new Map([['⟨cx:1⟩', 'a"b\\c\nd']])
  it('restores raw by default', () => expect(detokenize('x ⟨cx:1⟩ y', vault)).toBe('x a"b\\c\nd y'))
  it('restores JSON-escaped when asked, so it can sit inside a JSON string', () => {
    expect(JSON.parse(`"${detokenize('⟨cx:1⟩', vault, true)}"`)).toBe('a"b\\c\nd')
  })
})
