import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { textNodes, processPayload, resolveUpstream, configFor, createProxyServer, type ProxyMode } from '../src/proxy.js'

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)))
}
function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

const SECRET_BODY = (content: string): string =>
  JSON.stringify({ model: 'claude', messages: [{ role: 'user', content }] })

describe('textNodes / processPayload', () => {
  it('extracts Anthropic system + message text and redacts in place', () => {
    const body = {
      system: 'use key AKIAIOSFODNN7EXAMPLE',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'token ghp_' + 'a'.repeat(36) }] }],
    }
    const findings = processPayload(body, 'redact', configFor())
    expect(findings.length).toBe(2)
    expect(body.system).toContain('⟨redacted:aws_access_key_id⟩')
    expect((body.messages[0]!.content[0] as { text: string }).text).toContain('⟨redacted:github_token⟩')
  })

  it('warn mode reports but does not modify', () => {
    const body = { messages: [{ role: 'user', content: 'AKIAIOSFODNN7EXAMPLE' }] }
    const findings = processPayload(body, 'warn', configFor())
    expect(findings.length).toBe(1)
    expect(body.messages[0]!.content).toBe('AKIAIOSFODNN7EXAMPLE')
  })

  it('yields nothing for unrelated payloads', () => {
    expect([...textNodes({ foo: 'bar' })]).toHaveLength(0)
    expect([...textNodes(null)]).toHaveLength(0)
  })
})

describe('resolveUpstream', () => {
  it('routes by path and honors an override', () => {
    expect(resolveUpstream('/v1/messages')).toBe('https://api.anthropic.com')
    expect(resolveUpstream('/v1/chat/completions')).toBe('https://api.openai.com')
    expect(resolveUpstream('/anything', 'http://localhost:1234/')).toBe('http://localhost:1234')
  })
})

describe('proxy server (against a mock upstream)', () => {
  let upstream: Server
  let upstreamPort: number
  let received: { url?: string; body?: string }

  beforeAll(async () => {
    upstream = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      received = { url: req.url, body: Buffer.concat(chunks).toString('utf8') }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
    upstreamPort = await listen(upstream)
  })
  afterAll(async () => close(upstream))

  async function withProxy(mode: ProxyMode, fn: (port: number) => Promise<void>): Promise<void> {
    received = {}
    const proxy = createProxyServer({ port: 0, mode, upstream: `http://localhost:${upstreamPort}` })
    const port = await listen(proxy)
    try {
      await fn(port)
    } finally {
      await close(proxy)
    }
  }

  it('redact mode rewrites the secret before it reaches upstream', async () => {
    await withProxy('redact', async (port) => {
      const res = await fetch(`http://localhost:${port}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: SECRET_BODY('deploy AKIAIOSFODNN7EXAMPLE now'),
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true }) // upstream response passes through
      expect(received.body).toContain('⟨redacted:aws_access_key_id⟩')
      expect(received.body).not.toContain('AKIAIOSFODNN7EXAMPLE')
    })
  })

  it('block mode returns 403 and never calls upstream', async () => {
    await withProxy('block', async (port) => {
      const res = await fetch(`http://localhost:${port}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: SECRET_BODY('AKIAIOSFODNN7EXAMPLE'),
      })
      expect(res.status).toBe(403)
      expect(received.body).toBeUndefined()
      const stats = (await (await fetch(`http://localhost:${port}/__contextia/stats`)).json()) as { blocked: number }
      expect(stats.blocked).toBe(1)
    })
  })

  it('forwards clean requests untouched', async () => {
    await withProxy('redact', async (port) => {
      const res = await fetch(`http://localhost:${port}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: SECRET_BODY('just a normal question'),
      })
      expect(res.status).toBe(200)
      expect(received.body).toContain('just a normal question')
    })
  })
})
