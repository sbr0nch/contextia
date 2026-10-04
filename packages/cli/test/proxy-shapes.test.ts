import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { processPayload, configFor, createProxyServer, type ProxyMode } from '../src/proxy.js'

// Contract with the real request shapes. The proxy used to read only `system`
// and `messages[].content` text. Everything else an agent sends went upstream
// untouched and unreported: a measured 9 of 16 shapes leaked a planted AWS key
// with nothing on stderr. The one that matters most is `tool_result`, which is
// exactly where a file an agent just read (a .env, a config) comes back.
const SECRET = 'AKIAIOSFODNN7EXAMPLE'

const SHAPES: Record<string, () => unknown> = {
  'anthropic: user string': () => ({ messages: [{ role: 'user', content: `k ${SECRET}` }] }),
  'anthropic: text block': () => ({ messages: [{ role: 'user', content: [{ type: 'text', text: `k ${SECRET}` }] }] }),
  'anthropic: system blocks': () => ({ system: [{ type: 'text', text: `k ${SECRET}` }], messages: [] }),
  'anthropic: tool_result string': () => ({
    messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: `AWS_KEY=${SECRET}` }] }],
  }),
  'anthropic: tool_result blocks': () => ({
    messages: [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: `k ${SECRET}` }] }] },
    ],
  }),
  'anthropic: tool_use input': () => ({
    messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'bash', input: { command: `export K=${SECRET}` } }] }],
  }),
  'openai chat: string': () => ({ messages: [{ role: 'user', content: `k ${SECRET}` }] }),
  'openai chat: parts': () => ({ messages: [{ role: 'user', content: [{ type: 'text', text: `k ${SECRET}` }] }] }),
  'openai chat: tool message': () => ({ messages: [{ role: 'tool', tool_call_id: 'c1', content: `k ${SECRET}` }] }),
  'openai chat: tool_calls arguments': () => ({
    messages: [
      { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'f', arguments: JSON.stringify({ k: SECRET }) } }] },
    ],
  }),
  'openai responses: input string': () => ({ model: 'm', input: `k ${SECRET}` }),
  'openai responses: input items': () => ({ input: [{ role: 'user', content: [{ type: 'input_text', text: `k ${SECRET}` }] }] }),
  'openai responses: instructions': () => ({ instructions: `k ${SECRET}`, input: 'hi' }),
  'openai legacy: prompt': () => ({ prompt: `k ${SECRET}` }),
  'gemini: contents': () => ({ contents: [{ parts: [{ text: `k ${SECRET}` }] }] }),
}

describe('every request shape is scanned and redacted', () => {
  for (const [name, make] of Object.entries(SHAPES)) {
    it(name, () => {
      const body = make()
      const findings = processPayload(body, 'redact', configFor())
      expect(findings.length).toBeGreaterThan(0)
      expect(JSON.stringify(body)).not.toContain(SECRET)
      expect(JSON.stringify(body)).toContain('⟨redacted:aws_access_key_id⟩')
    })
  }

  it('warn mode finds it in every shape and leaves the body alone', () => {
    for (const make of Object.values(SHAPES)) {
      const body = make()
      const before = JSON.stringify(body)
      expect(processPayload(body, 'warn', configFor()).length).toBeGreaterThan(0)
      expect(JSON.stringify(body)).toBe(before)
    }
  })
})

describe('what must NOT be rewritten', () => {
  it('leaves the signed fields of a thinking block alone: rewriting them makes the API reject the request', () => {
    const body = {
      messages: [{ role: 'assistant', content: [{ type: 'thinking', thinking: `k ${SECRET}`, signature: 'sig-' + 'A'.repeat(40) }] }],
    }
    expect(processPayload(body, 'redact', configFor())).toHaveLength(0)
    expect(JSON.stringify(body)).toContain(SECRET)
  })

  it('but reads every other string of an object that merely says it is a thinking block', () => {
    for (const body of [
      { messages: [{ role: 'user', type: 'thinking', content: `key ${SECRET}` }] },
      { messages: [{ role: 'assistant', content: [{ type: 'thinking', thinking: 'k', signature: 's', extra: `key ${SECRET}` }] }] },
    ]) {
      expect(processPayload(body, 'redact', configFor())).toHaveLength(1)
      expect(JSON.stringify(body)).not.toContain(SECRET)
    }
  })

  it('leaves base64 media alone: rewriting it corrupts the image', () => {
    // slashes give the key a word boundary, so a detector WOULD fire if the walk read it
    const png = 'iVBORw0KGgo/' + SECRET + '/' + 'A'.repeat(200)
    const body = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } },
            { inline_data: { mime_type: 'image/png', data: png } }, // Gemini
            { type: 'input_audio', input_audio: { data: png, format: 'wav' } }, // OpenAI
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: png } },
          ],
        },
      ],
    }
    expect(processPayload(body, 'redact', configFor())).toHaveLength(0)
    expect(JSON.stringify(body).split(png).length - 1).toBe(5)
  })

  it('reads text that only looks like it is in a media field', () => {
    const cases: unknown[] = [
      // a plain-text document: Anthropic puts the text itself in source.data
      { messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'text', media_type: 'text/plain', data: `file: ${SECRET}` } }] }] },
      // a data: prefix says nothing about what follows it
      { messages: [{ role: 'user', content: `data:x;base64,\nsecret ${SECRET}` }] },
      { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,AAAA ${SECRET}` } }] }] },
      // base64-shaped, but nothing says it is media: could be anything an agent put there
      { messages: [{ role: 'user', content: [{ type: 'tool_use', id: 'i', name: 'n', input: { data: 'A'.repeat(150) + '/' + SECRET + '/' + 'A'.repeat(150) } }] }] },
      // says it is an image, but is far too short to be one
      { messages: [{ role: 'user', content: [{ inline_data: { mime_type: 'image/png', data: `/${SECRET}/` } }] }] },
      // a field called data that is not base64
      { messages: [{ role: 'user', content: [{ type: 'tool_use', id: 'i', name: 'n', input: { data: `k ${SECRET}`, format: 'txt' } }] }] },
    ]
    for (const body of cases) {
      expect(processPayload(body, 'redact', configFor()), JSON.stringify(body)).toHaveLength(1)
      expect(JSON.stringify(body)).not.toContain(SECRET)
    }
  })

  it('does not scan object keys or non-strings', () => {
    const body = { n: 42, flag: true, nothing: null, list: [1, 2, 3] }
    expect(processPayload(body, 'redact', configFor())).toHaveLength(0)
  })

  it('puts the signature note in prose only, never inside a tool call or a tool result', () => {
    const body = {
      messages: [
        { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'bash', input: { command: `export K=${SECRET}` } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: `AWS_KEY=${SECRET}` }] },
        { role: 'tool', tool_call_id: 'c', content: `k ${SECRET}` },
      ],
    }
    processPayload(body, 'redact', configFor(), undefined, undefined, true)
    expect(JSON.stringify(body)).not.toContain('Contextia')
  })

  it('puts the signature on the system prompt even when the client wrote messages first', () => {
    const body = { messages: [{ role: 'user', content: `k ${SECRET}` }], system: `s ${SECRET}` }
    processPayload(body, 'redact', configFor(), undefined, undefined, true)
    expect(body.system.startsWith('[Secrets redacted locally by Contextia')).toBe(true)
    expect(body.messages[0]!.content).not.toContain('Contextia')
  })

  it('adds no note when the only secret was in a tool result', () => {
    const body = { messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: `k ${SECRET}` }] }] }
    processPayload(body, 'redact', configFor(), undefined, undefined, true)
    expect(JSON.stringify(body)).not.toContain('Contextia')
    expect(JSON.stringify(body)).not.toContain(SECRET)
  })
})

describe('hostile structure', () => {
  it('survives 200,000 levels of nesting without overflowing the stack', () => {
    let nested: unknown = { text: SECRET }
    for (let i = 0; i < 200_000; i++) nested = [nested]
    const body = { messages: [{ role: 'user', content: nested }] }
    expect(() => processPayload(body, 'warn', configFor())).not.toThrow()
  })

  it('still scans a 5000-block conversation in one pass', () => {
    const content = Array.from({ length: 5000 }, (_, i) => ({ type: 'text', text: i === 4999 ? SECRET : 'hello' }))
    const body = { messages: [{ role: 'user', content }] }
    expect(processPayload(body, 'warn', configFor())).toHaveLength(1)
  })
})

describe('through the real server', () => {
  let upstream: Server
  let upstreamPort: number
  let received: string | undefined

  beforeAll(async () => {
    upstream = createServer(async (req, res) => {
      const ch: Buffer[] = []
      for await (const c of req) ch.push(c as Buffer)
      received = Buffer.concat(ch).toString('utf8')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
    await new Promise<void>((r) => upstream.listen(0, () => r()))
    upstreamPort = (upstream.address() as AddressInfo).port
  })
  afterAll(() => new Promise<void>((r) => upstream.close(() => r())))

  async function send(mode: ProxyMode, path: string, body: unknown): Promise<number> {
    received = undefined
    const proxy = createProxyServer({ port: 0, mode, upstream: `http://localhost:${upstreamPort}` })
    await new Promise<void>((r) => proxy.listen(0, () => r()))
    try {
      const res = await fetch(`http://localhost:${(proxy.address() as AddressInfo).port}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      await res.text()
      return res.status
    } finally {
      await new Promise<void>((r) => proxy.close(() => r()))
    }
  }

  it('redact: a secret in a tool_result never reaches the upstream', async () => {
    const status = await send('redact', '/v1/messages', SHAPES['anthropic: tool_result string']!())
    expect(status).toBe(200)
    expect(received).toBeDefined()
    expect(received).not.toContain(SECRET)
  })

  it('redact: a secret in an OpenAI Responses request never reaches the upstream', async () => {
    await send('redact', '/v1/responses', SHAPES['openai responses: input string']!())
    expect(received).toBeDefined()
    expect(received).not.toContain(SECRET)
  })

  it('block: a secret in a tool_result is refused with 403 and upstream is never called', async () => {
    const status = await send('block', '/v1/messages', SHAPES['anthropic: tool_result blocks']!())
    expect(status).toBe(403)
    expect(received).toBeUndefined()
  })
})
