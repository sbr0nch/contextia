import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  textNodes,
  processPayload,
  resolveUpstream,
  configFor,
  createProxyServer,
  parseEventBatch,
  foldEvents,
  type ProxyMode,
  type ProxyStats,
} from '../src/proxy.js'

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

  it('adds the signature note once when enabled, and not by default', () => {
    const make = () => ({
      system: 'key AKIAIOSFODNN7EXAMPLE',
      messages: [{ role: 'user', content: 'and ghp_' + 'a'.repeat(36) }],
    })
    const off = make()
    processPayload(off, 'redact', configFor())
    expect(off.system).not.toContain('Contextia')

    const on = make()
    processPayload(on, 'redact', configFor(), undefined, undefined, true)
    const joined = on.system + '\n' + on.messages[0]!.content
    // exactly one signature line across the whole payload
    expect(joined.match(/redacted locally by Contextia/g)?.length).toBe(1)
    expect(on.system.startsWith('[Secrets redacted locally by Contextia')).toBe(true)
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

  it('also redacts custom values and patterns', () => {
    const body = { messages: [{ role: 'user', content: 'project Zephyr ticket 42-7 with AKIAIOSFODNN7EXAMPLE' }] }
    const findings = processPayload(body, 'redact', configFor(), { values: ['Zephyr'], patterns: ['\\d+-\\d+'] })
    expect(findings.some((f) => f.type === 'custom')).toBe(true)
    expect(findings.some((f) => f.type === 'aws_access_key_id')).toBe(true)
    const text = body.messages[0]!.content
    expect(text).not.toMatch(/Zephyr|42-7|AKIAIOSFODNN7EXAMPLE/)
    expect(text).toContain('⟨redacted:custom⟩')
  })
})

describe('browser events (/__contextia/events)', () => {
  const emptyStats = (): ProxyStats => ({
    startedAt: 0, requests: 0, withFindings: 0, redacted: 0, blocked: 0, leaked: 0, byType: {}, bySite: {},
  })

  it('accepts a counts-only batch and rejects anything with extra fields', () => {
    expect(parseEventBatch({ events: [{ ts: '2026-01-01T00:00:00Z', site: 'chatgpt.com', detector: 'aws_access_key_id', action: 'warn', count: 1 }] })).toHaveLength(1)
    // a stray field (e.g. someone trying to smuggle the value) → whole batch rejected
    expect(parseEventBatch({ events: [{ ts: 't', site: 's', detector: 'd', action: 'warn', count: 1, match: 'AKIA...' }] })).toBeNull()
    expect(parseEventBatch({ events: [{ site: 's', detector: 'd', action: 'warn', count: 1 }] })).toBeNull() // missing ts
    expect(parseEventBatch({ events: [{ ts: 't', site: 's', detector: 'd', action: 'nope', count: 1 }] })).toBeNull() // bad action
    expect(parseEventBatch({ events: [{ ts: 't', site: 's', detector: 'd', action: 'warn', count: 0 }] })).toBeNull() // bad count
    expect(parseEventBatch({ events: [] })).toBeNull()
    expect(parseEventBatch({})).toBeNull()
  })

  it('folds counts into stats like terminal catches', () => {
    const stats = emptyStats()
    foldEvents(stats, [
      { ts: 't', site: 'chatgpt.com', detector: 'aws_access_key_id', action: 'block', count: 2 },
      { ts: 't', site: 'claude.ai', detector: 'github_token', action: 'redact', count: 1 },
    ])
    expect(stats.byType).toEqual({ aws_access_key_id: 2, github_token: 1 })
    expect(stats.bySite).toEqual({ 'chatgpt.com': 2, 'claude.ai': 1 })
    expect(stats.blocked).toBe(2)
    expect(stats.redacted).toBe(1)
    expect(stats.withFindings).toBe(3)
    expect(stats.requests).toBe(0) // request count is left untouched
  })

  it('folds a leaked event into byType and the leaked counter', () => {
    expect(parseEventBatch({ events: [{ ts: 't', site: 's', detector: 'd', action: 'leaked', count: 1 }] })).toHaveLength(1)
    const stats = emptyStats()
    foldEvents(stats, [{ ts: 't', site: 'chatgpt.com', detector: 'openai_key', action: 'leaked', count: 3 }])
    expect(stats.leaked).toBe(3)
    expect(stats.byType).toEqual({ openai_key: 3 })
    expect(stats.blocked).toBe(0)
    expect(stats.redacted).toBe(0)
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

  it('reversible mode tokenizes the request and restores the original in the response', async () => {
    // an upstream that echoes the (tokenized) request body back as its "answer"
    const echo = createServer(async (req, res) => {
      const ch: Buffer[] = []
      for await (const c of req) ch.push(c as Buffer)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(Buffer.concat(ch))
    })
    const echoPort = await listen(echo)
    const proxy = createProxyServer({ port: 0, mode: 'redact', reversible: true, upstream: `http://localhost:${echoPort}` })
    const port = await listen(proxy)
    try {
      const res = await fetch(`http://localhost:${port}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: SECRET_BODY('use AKIAIOSFODNN7EXAMPLE here'),
      })
      const text = await res.text()
      expect(text).toContain('AKIAIOSFODNN7EXAMPLE') // restored on the way back
      expect(text).not.toContain('⟨cx:') // no leftover placeholders
    } finally {
      await close(proxy)
      await close(echo)
    }
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
