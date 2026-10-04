import { describe, it, expect, vi, afterEach } from 'vitest'
import { isLoopbackUrl, postEvents, type CxEvent } from '../src/reporter.js'

describe('isLoopbackUrl', () => {
  it('accepts only http loopback hosts', () => {
    expect(isLoopbackUrl('http://127.0.0.1:8787/__contextia/events')).toBe(true)
    expect(isLoopbackUrl('http://localhost:8787/x')).toBe(true)
    expect(isLoopbackUrl('http://[::1]:8787/x')).toBe(true)
  })
  it('refuses anything that could leave the machine', () => {
    expect(isLoopbackUrl('https://127.0.0.1/x')).toBe(false) // https is not what the local proxy speaks
    expect(isLoopbackUrl('http://evil.com/x')).toBe(false)
    expect(isLoopbackUrl('http://127.0.0.1.evil.com/x')).toBe(false)
    expect(isLoopbackUrl('http://169.254.169.254/x')).toBe(false)
    expect(isLoopbackUrl('not a url')).toBe(false)
    expect(isLoopbackUrl('')).toBe(false)
  })
})

import { DEFAULT_STATS_URL } from '../src/reporter.js'

describe('the default dashboard address', () => {
  it('is the local proxy, and is itself loopback', () => {
    expect(DEFAULT_STATS_URL).toBe('http://127.0.0.1:8787/__contextia/events')
    expect(isLoopbackUrl(DEFAULT_STATS_URL)).toBe(true)
  })
})

describe('postEvents', () => {
  afterEach(() => vi.unstubAllGlobals())
  const ev: CxEvent = { ts: 't', site: 's', detector: 'd', action: 'warn', count: 1 }

  it('never calls fetch for a non-loopback URL', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await postEvents('https://evil.com/x', [ev])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not post an empty batch, even to a loopback URL', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await postEvents('http://127.0.0.1:8787/__contextia/events', [])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts a counts-only batch to a loopback URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await postEvents('http://127.0.0.1:8787/__contextia/events', [ev])
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(init.body)).toEqual({ events: [ev] })
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
  })
})
