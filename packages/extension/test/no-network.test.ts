import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// CLAUDE.md invariant: the extension makes zero network requests. Any network
// primitive in the source is a build error — enforced here so it runs in CI.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return tsFiles(p)
    return name.endsWith('.ts') ? [p] : []
  })
}

const FORBIDDEN = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.connection/

describe('zero network', () => {
  it('no source file uses a network primitive', () => {
    const offenders: string[] = []
    for (const file of tsFiles(srcDir)) {
      if (FORBIDDEN.test(readFileSync(file, 'utf8'))) offenders.push(file)
    }
    expect(offenders, `network primitive found in: ${offenders.join(', ')}`).toEqual([])
  })
})
