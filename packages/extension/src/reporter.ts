// The ONLY module in the extension permitted a network primitive. It posts
// secret-free counts to a user-configured LOCAL endpoint so the same machine's
// terminal + browser detections can share one dashboard. It is opt-in (default
// off) and refuses any URL that isn't loopback — so it can never send off-machine.
// Everything else in the extension stays strictly zero-network.

export interface CxEvent {
  ts: string
  site: string
  detector: string
  action: 'warn' | 'redact' | 'block' | 'leaked'
  count: number
}

/** The CLI proxy's default local dashboard endpoint — used when none is given. */
export const DEFAULT_STATS_URL = 'http://127.0.0.1:8787/__contextia/events'

/** True only for http:// on 127.0.0.1 / localhost / ::1 — never anything remote. */
export function isLoopbackUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'http:') return false
  return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]'
}

/** Post a batch to a loopback endpoint. No-op for any non-loopback URL. */
export async function postEvents(url: string, events: CxEvent[]): Promise<void> {
  if (!isLoopbackUrl(url) || events.length === 0) return
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events }),
  })
}
