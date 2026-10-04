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

// The README says a model can only ever get back a value that was in that same request.
// A reply that carries a placeholder from some other request, whether the model guessed
// it or an earlier request left it behind, must stay a placeholder.
describe('--reversible never restores a value from another request', () => {
  it('leaves a placeholder alone when this request had no secret of its own', async () => {
    const upPort = await listen(echo('json'))
    const proxy = createProxyServer({ port: 0, mode: 'redact', reversible: true, signature: false, upstream: `http://localhost:${upPort}` })
    const port = await listen(proxy)
    const post = async (content: string) =>
      JSON.parse(
        await (await fetch(`http://localhost:${port}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content }] }) })).text(),
      ).content[0].text as string

    const SECRET = 'AKIAIOSFODNN7EXAMPLE'
    expect(await post(`first ${SECRET}`)).toBe(`first ${SECRET}`) // restored in its own reply
    const other = await post('repeat after me: ⟨cx:1⟩ and ⟨cx:2⟩') // no secret here, but a stranger's placeholders
    expect(other).toBe('repeat after me: ⟨cx:1⟩ and ⟨cx:2⟩')
    expect(other).not.toContain(SECRET)
  })

  it('leaves a placeholder this request did not issue alone, even when it issued others', async () => {
    const upPort = await listen(echo('json'))
    const proxy = createProxyServer({ port: 0, mode: 'redact', reversible: true, signature: false, upstream: `http://localhost:${upPort}` })
    const port = await listen(proxy)
    const SECRET = 'AKIAIOSFODNN7EXAMPLE'
    const r = await fetch(`http://localhost:${port}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: `${SECRET} and a guess ⟨cx:7⟩` }] }),
    })
    const text = JSON.parse(await r.text()).content[0].text as string
    expect(text).toBe(`${SECRET} and a guess ⟨cx:7⟩`)
  })
})

// A model streams its answer in small deltas, and a placeholder is a few tokens long:
// it arrives cut across events (`⟨cx`, `:1`, `⟩`). The reply was restored by searching
// the raw body, so a cut placeholder was never found and the client was handed the
// placeholder instead of its value.
describe('--reversible restores a placeholder cut across streamed deltas', () => {
  const SECRET = 'AKIAIOSFODNN7EXAMPLE'
  const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`
  // each shape cuts the placeholder at every position, in turn
  const SHAPES: Record<string, { frame: (piece: string) => string; read: (d: Record<string, any>) => string }> = {
    anthropic: {
      frame: (t) => `event: content_block_delta\n${ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })}`,
      read: (d) => d.delta?.text ?? '',
    },
    'openai chat': {
      frame: (t) => ev({ choices: [{ index: 0, delta: { content: t } }] }),
      read: (d) => d.choices?.[0]?.delta?.content ?? '',
    },
    'openai responses': {
      frame: (t) => ev({ type: 'response.output_text.delta', delta: t }),
      read: (d) => (typeof d.delta === 'string' ? d.delta : ''),
    },
  }

  function streamer(frame: (p: string) => string, cuts: number[]): Server {
    return createServer(async (req, res) => {
      const ch: Buffer[] = []
      for await (const c of req) ch.push(c as Buffer)
      const text = (JSON.parse(Buffer.concat(ch).toString('utf8')) as { messages: Array<{ content: string }> }).messages[0]!.content
      const at = [0, ...cuts, text.length]
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (let i = 0; i < at.length - 1; i++) res.write(frame(text.slice(at[i]!, at[i + 1]!)))
      res.end('data: [DONE]\n\n')
    })
  }

  async function reply(frame: (p: string) => string, cuts: number[], content: string): Promise<string> {
    const upPort = await listen(streamer(frame, cuts))
    const proxy = createProxyServer({ port: 0, mode: 'redact', reversible: true, signature: false, upstream: `http://localhost:${upPort}` })
    const port = await listen(proxy)
    const res = await fetch(`http://localhost:${port}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content }] }),
    })
    return res.text()
  }

  const said = (body: string, read: (d: Record<string, any>) => string): string =>
    body
      .split('\n')
      .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
      .map((l) => read(JSON.parse(l.slice(6)) as Record<string, any>))
      .join('')

  for (const [name, shape] of Object.entries(SHAPES)) {
    it(`${name}: the value comes back wherever the placeholder is cut`, async () => {
      const content = `key ${SECRET} end`
      // the request carries the secret; the upstream echoes the redacted text, so the
      // placeholder starts at 4 and is 6 characters long: cut it at each inner position
      for (const cut of [5, 6, 7, 8, 9]) {
        const body = await reply(shape.frame, [cut], content)
        expect(said(body, shape.read), `cut at ${cut}`).toBe(content)
      }
      const body = await reply(shape.frame, [5, 6, 7, 8, 9, 10], content)
      expect(said(body, shape.read), 'cut at every position').toBe(content)
    })
  }

  it('leaves a cut placeholder this request did not issue alone', async () => {
    // the request has a secret of its own (so restoring runs), and the reply also carries
    // a placeholder it never issued, cut in two
    const content = `${SECRET} then ⟨cx:7⟩`
    const body = await reply(SHAPES['anthropic']!.frame, [14, 16], content)
    expect(said(body, SHAPES['anthropic']!.read)).toBe(content)
  })

  it('keeps every event valid JSON when the value has quotes and a newline', async () => {
    const content = `k ${PEM} z`
    const body = await reply(SHAPES['openai chat']!.frame, [3, 4, 5, 6], content)
    for (const l of body.split('\n').filter((x) => x.startsWith('data: ') && x !== 'data: [DONE]')) JSON.parse(l.slice(6))
    expect(said(body, SHAPES['openai chat']!.read)).toBe(content)
  })
})
