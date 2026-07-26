#!/usr/bin/env node
// Run the commands the documentation tells people to run.
//
//   npm run test:docs
//
// Three of the defects found on the day this was written came from the docs
// rather than the code: `contextia scan .` died on a stack trace and exited 0,
// the plugin update instructions left users on the old version, and the slash
// commands do not exist in two environments out of three. None of that is
// caught by testing functions, because the failure is in the promise, not the
// implementation.
//
// This covers the CLI, which is the part a script can actually execute. The
// rest is prose and still needs a human to try it.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(root, 'packages/cli/dist/cli.js')

const results = []
function check(name, fn) {
  try {
    fn()
    results.push([true, name, ''])
  } catch (e) {
    results.push([false, name, e.message.split('\n')[0]])
  }
}

function run(args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      input: opts.input ?? '',
      cwd: opts.cwd ?? root,
    })
    return { code: 0, stdout }
  } catch (e) {
    return { code: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

// A throwaway tree with one planted secret and one clean file.
const box = mkdtempSync(join(tmpdir(), 'contextia-docs-'))
mkdirSync(join(box, 'src'), { recursive: true })
writeFileSync(join(box, '.env'), 'API_KEY=sk_live_abcd1234efgh5678\n')
writeFileSync(join(box, 'src/clean.ts'), 'export const answer = 42\n')
writeFileSync(join(box, 'src/leak.ts'), 'const key = "AKIAIOSFODNN7EXAMPLE"\n')

try {
  // README: `contextia scan .env src/`
  check('scan accepts a file and a directory together', () => {
    const r = run(['scan', '.env', 'src/'], { cwd: box })
    assert(r.code === 1, `expected exit 1 with findings, got ${r.code}`)
    assert(!/at Object|EISDIR|node:fs/.test(r.stderr ?? ''), 'crashed with a stack trace')
  })

  // A clean tree must exit 0, or the hook is useless as a gate.
  check('scan of a clean directory exits 0', () => {
    const clean = mkdtempSync(join(tmpdir(), 'contextia-clean-'))
    writeFileSync(join(clean, 'ok.ts'), 'export const a = 1\n')
    const r = run(['scan', clean])
    rmSync(clean, { recursive: true, force: true })
    assert(r.code === 0, `expected exit 0, got ${r.code}`)
  })

  check('scan of a directory finds the planted secret', () => {
    const r = run(['scan', 'src'], { cwd: box })
    assert(/aws_access_key_id/.test(r.stdout), 'did not report the planted key')
  })

  check('an unreadable path exits 2 rather than pretending it is clean', () => {
    const r = run(['scan', join(box, 'does-not-exist')])
    assert(r.code === 2, `expected exit 2, got ${r.code}`)
  })

  // README: `git diff | contextia scan`
  check('scan reads stdin', () => {
    const r = run(['scan'], { input: '+const k = "AKIAIOSFODNN7EXAMPLE"\n' })
    assert(r.code === 1, `expected exit 1, got ${r.code}`)
    assert(/aws_access_key_id/.test(r.stdout), 'missed the key on stdin')
  })

  // README: `contextia scan --json`
  check('scan --json emits parseable JSON', () => {
    const r = run(['scan', '--json', 'src/leak.ts'], { cwd: box })
    const rows = JSON.parse(r.stdout)
    assert(Array.isArray(rows) && rows.length > 0, 'no rows')
    assert(rows.every((x) => x.file && x.type && x.line), 'a row is missing fields')
  })

  // README: `contextia scan --explain`
  check('scan --explain prints a reason per finding', () => {
    const r = run(['scan', '--explain', 'src/leak.ts'], { cwd: box })
    assert(/why:/.test(r.stdout), 'no explanation printed')
  })

  // README: `contextia redact server.log > clean.log`
  check('redact removes the secret and keeps the rest', () => {
    const r = run(['redact', 'src/leak.ts'], { cwd: box })
    assert(!r.stdout.includes('AKIAIOSFODNN7EXAMPLE'), 'the secret survived redaction')
    assert(r.stdout.includes('const key'), 'the surrounding text was lost')
  })

  check('list names the detectors', () => {
    const r = run(['list'])
    assert(r.code === 0 && /aws_access_key_id/.test(r.stdout), 'roster missing')
  })

  check('version and help answer', () => {
    assert(run(['version']).code === 0, 'version failed')
    assert(/Usage:/.test(run(['help']).stdout), 'help printed no usage')
  })

  check('an invalid --mode is refused with exit 2', () => {
    const r = run(['proxy', '--mode', 'nonsense'])
    assert(r.code === 2, `expected exit 2, got ${r.code}`)
  })
} finally {
  rmSync(box, { recursive: true, force: true })
}

const line = '-'.repeat(70)
console.log(`\n${line}\nDocumented commands\n${line}`)
for (const [ok, name, why] of results) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${why ? `\n          ${why}` : ''}`)
}
const failed = results.filter(([ok]) => !ok).length
console.log(failed ? `\n${failed} failed\n` : `\nall ${results.length} passed\n`)
process.exit(failed ? 1 : 0)
