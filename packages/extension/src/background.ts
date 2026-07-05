import { api } from './api.js'
import { getSettings } from './storage.js'
import { isLoopbackUrl, postEvents, DEFAULT_STATS_URL, type CxEvent } from './reporter.js'

// Service worker. Beyond existing, it batches secret-free catch events from the
// content scripts and forwards them to an optional LOCAL stats endpoint. If no
// endpoint is configured (the default), nothing is ever sent — zero network.
api.runtime.onInstalled.addListener(() => {})

// The endpoint can be set by enterprise policy (chrome.storage.managed) or by the
// user in Options. Policy wins; either way it must be loopback or it's ignored.
async function endpoint(): Promise<string | null> {
  try {
    const managed = await api.storage.managed?.get?.('localStatsUrl')
    const url = managed?.['localStatsUrl']
    if (typeof url === 'string' && isLoopbackUrl(url)) return url
  } catch {
    // no managed storage on this browser/profile — fall through
  }
  const s = await getSettings()
  if (!s.localStatsEnabled) return null // off by default → nothing is sent
  const url = s.localStatsUrl.trim() || DEFAULT_STATS_URL
  return isLoopbackUrl(url) ? url : null
}

let buffer: CxEvent[] = []
let timer: ReturnType<typeof setTimeout> | undefined

async function flush(): Promise<void> {
  timer = undefined
  if (buffer.length === 0) return
  const url = await endpoint()
  const batch = buffer
  buffer = []
  if (!url) return // feature off — drop, never queue indefinitely
  try {
    await postEvents(url, batch)
  } catch {
    // fire-and-forget: a missing/asleep endpoint must never affect the page
  }
}

api.runtime.onMessage.addListener((msg: unknown) => {
  const m = msg as { type?: string; event?: CxEvent } | null
  if (m?.type === 'cx-event' && m.event) {
    buffer.push(m.event)
    if (buffer.length >= 50) void flush()
    else if (!timer) timer = setTimeout(() => void flush(), 2000)
  }
})
