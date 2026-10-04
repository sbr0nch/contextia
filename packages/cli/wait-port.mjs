// Wait until a spawned server accepts connections, instead of sleeping a guessed time: on a
// loaded runner a fixed sleep is shorter than the start-up, and the first request is refused.
import { connect } from 'node:net'

export async function waitForPort(port, child, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs
  for (;;) {
    if (child && child.exitCode !== null) throw new Error(`the process exited (${child.exitCode}) before listening on ${port}`)
    const ok = await new Promise((resolve) => {
      const s = connect(port, '127.0.0.1')
      s.once('connect', () => (s.destroy(), resolve(true)))
      s.once('error', () => resolve(false))
    })
    if (ok) return
    if (Date.now() > until) throw new Error(`nothing listened on ${port} within ${timeoutMs} ms`)
    await new Promise((r) => setTimeout(r, 50))
  }
}
