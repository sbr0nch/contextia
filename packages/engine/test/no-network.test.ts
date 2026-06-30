import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// The engine must be inert: no network, no remote loading, no ambient browser
// globals. This guards the SPEC privacy invariant at the source level.
const SRC = fileURLToPath(new URL('../src', import.meta.url))

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/WebSocket/, 'WebSocket'],
  [/EventSource/, 'EventSource'],
  [/sendBeacon/, 'navigator.sendBeacon'],
  [/\bnavigator\b/, 'navigator'],
  [/\bimport\s*\(/, 'dynamic import()'],
  [/\brequire\s*\(/, 'require()'],
]

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsFiles(full))
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('engine has no network or DOM surface', () => {
  it('source uses no forbidden APIs', () => {
    const files = tsFiles(SRC)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
      for (const [pattern, name] of FORBIDDEN) {
        expect(pattern.test(code), `${file} must not use ${name}`).toBe(false)
      }
    }
  })
})
