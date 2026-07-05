import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// Invariant: the extension makes zero network requests, with a single, explicit
// exception — the opt-in, loopback-only reporter. Any network primitive anywhere
// else is a build error. The reporter itself is loopback-guarded (see
// reporter.test.ts), so it can never send off-machine.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const ALLOWED = new Set(['reporter.ts'])

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return tsFiles(p)
    return name.endsWith('.ts') ? [p] : []
  })
}

const FORBIDDEN = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.connection/

describe('zero network', () => {
  it('no source file uses a network primitive, except the loopback reporter', () => {
    const offenders: string[] = []
    for (const file of tsFiles(srcDir)) {
      if (ALLOWED.has(basename(file))) continue
      if (FORBIDDEN.test(readFileSync(file, 'utf8'))) offenders.push(file)
    }
    expect(offenders, `network primitive found in: ${offenders.join(', ')}`).toEqual([])
  })

  it('the reporter is the only allowed exception and it gates fetch on loopback', () => {
    const reporter = readFileSync(join(srcDir, 'reporter.ts'), 'utf8')
    expect(reporter).toMatch(/\bfetch\s*\(/)
    expect(reporter).toMatch(/isLoopbackUrl/) // fetch is guarded by the loopback check
  })
})
