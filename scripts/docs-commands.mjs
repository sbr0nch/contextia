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
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs'
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

  // --json is what a CI step parses. It must stay valid for a clean tree, and for
  // file names a shell happily creates.
  check('scan --json stays valid JSON: empty on a clean tree, and with hostile file names', () => {
    const clean = run(['scan', '--json', 'src/clean.ts'], { cwd: box })
    assert(clean.code === 0 && JSON.parse(clean.stdout).length === 0, 'a clean scan did not print []')
    const odd = mkdtempSync(join(tmpdir(), 'contextia-odd-'))
    try {
      const names = ['a "quoted" name.txt', 'new\nline.txt', 'tab\there.txt', 'caf\u00e9 \ud83d\ude00.txt', 'back\\slash.txt']
      for (const n of names) writeFileSync(join(odd, n), 'k = "AKIAIOSFODNN7EXAMPLE"\n')
      const r = run(['scan', '--json', '.'], { cwd: odd })
      const rows = JSON.parse(r.stdout)
      assert(r.code === 1 && rows.length === names.length, `expected ${names.length} rows, got ${rows.length}`)
      for (const n of names) assert(rows.some((x) => x.file === './' + n || x.file === n), `file name lost: ${JSON.stringify(n)}`)
      assert(rows.every((x) => x.preview && !x.preview.includes('AKIAIOSFODNN7EXAMPLE')), 'a preview carries the whole key')
    } finally {
      rmSync(odd, { recursive: true, force: true })
    }
  })

  // `contextia scan . --json | jq` is the pipe a CI step uses. The scan exited with
  // process.exit() straight after writing, and a pipe is written asynchronously, so
  // the output stopped at the first 65,536 bytes: measured 65,536 of 807,789, and
  // the JSON did not parse. The same run into a file was whole, which is why
  // nothing noticed.
  check('scan --json through a pipe is complete when the output is large', () => {
    const many = mkdtempSync(join(tmpdir(), 'contextia-many-'))
    try {
      const FILES = 1500
      for (let i = 0; i < FILES; i++) writeFileSync(join(many, `f${i}.env`), `k = "AKIAIOSFODNN7EXAMPLE"\nPASSWORD=Sup3rS3cretPass${i}\n`)
      const r = run(['scan', '--json', '.'], { cwd: many }) // run() reads through a pipe
      let rows
      try {
        rows = JSON.parse(r.stdout)
      } catch (e) {
        throw new Error(`the JSON stopped at ${r.stdout.length} bytes and does not parse`)
      }
      assert(rows.length === FILES * 2, `expected ${FILES * 2} rows, got ${rows.length}`)
      assert(r.code === 1, `exit ${r.code}`)
    } finally {
      rmSync(many, { recursive: true, force: true })
    }
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

  // `contextia scan .` is the documented pre-commit and CI use. It used to skip
  // every dotfile but `.env`, so `.env.production`, `.env.local` and
  // `.aws/credentials`, where secrets actually live, were never read, and
  // symlinked files were dropped without a word. Each of these held a planted
  // secret that scanning the file by name did find.
  check('scan of a directory reads dotfiles, dot-directories and symlinked files', () => {
    const tree = mkdtempSync(join(tmpdir(), 'contextia-dots-'))
    try {
      mkdirSync(join(tree, '.aws'))
      mkdirSync(join(tree, 'config'))
      // built at run time: a literal key of this shape trips push protection
      const stripe = ['sk', 'live', 'a1B2c3D4a1B2c3D4a1B2c3D4'].join('_')
      writeFileSync(join(tree, '.env.production'), `STRIPE_SECRET_KEY=${stripe}\n`)
      writeFileSync(join(tree, '.env.local'), 'DB_PASSWORD=Sup3rS3cretPass\n')
      writeFileSync(join(tree, '.aws/credentials'), '[default]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\n')
      writeFileSync(join(tree, 'config/real.txt'), 'AKIAIOSFODNN7EXAMPLE\n')
      const outside = mkdtempSync(join(tmpdir(), 'contextia-outside-'))
      writeFileSync(join(outside, 'target.txt'), 'AKIAIOSFODNN7EXAMPLE\n')
      symlinkSync(join(outside, 'target.txt'), join(tree, 'link.txt')) // a link to a file elsewhere
      const out = run(['scan', '.', '--json'], { cwd: tree }).stdout
      rmSync(outside, { recursive: true, force: true })
      const files = new Set(JSON.parse(out).map((r) => r.file.replace(/^\.\//, '')))
      for (const f of ['.env.production', '.env.local', '.aws/credentials', 'config/real.txt', 'link.txt']) {
        assert(files.has(f), `scan . did not read ${f} (read: ${[...files].join(', ')})`)
      }
    } finally {
      rmSync(tree, { recursive: true, force: true })
    }
  })

  // The same file under two names (a symlink inside the tree) used to be reported twice,
  // so "2 secrets found" for one secret.
  check('a file reachable under two names is scanned and reported once', () => {
    const tree = mkdtempSync(join(tmpdir(), 'contextia-twice-'))
    try {
      mkdirSync(join(tree, '.aws'))
      writeFileSync(join(tree, '.aws/credentials'), 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE\n')
      symlinkSync(join(tree, '.aws/credentials'), join(tree, 'creds-link'))
      symlinkSync(join(tree, '.aws'), join(tree, 'dir-link')) // a link to a directory is not followed
      symlinkSync(tree, join(tree, 'loop')) // and a loop cannot trap the walk
      const rows = JSON.parse(run(['scan', '.', '--json'], { cwd: tree }).stdout)
      const files = new Set(rows.map((r) => r.file))
      assert(files.size === 1, `one file was reported under ${files.size} names: ${[...files].join(', ')}`)
    } finally {
      rmSync(tree, { recursive: true, force: true })
    }
  })

  check('scan of a directory still skips .git and node_modules', () => {
    const tree = mkdtempSync(join(tmpdir(), 'contextia-skip-'))
    try {
      for (const d of ['.git', 'node_modules']) {
        mkdirSync(join(tree, d))
        writeFileSync(join(tree, d, 'x.txt'), 'AKIAIOSFODNN7EXAMPLE\n')
      }
      assert(run(['scan', '.'], { cwd: tree }).code === 0, 'descended into a dependency or VCS tree')
    } finally {
      rmSync(tree, { recursive: true, force: true })
    }
  })

  // A secret past the engine's 1,000,000 character cap used to give
  // "0 secrets found", exit 0, and a redact that printed it in clear.
  check('scan and redact reach a secret in the tail of a file over the engine cap', () => {
    const tree = mkdtempSync(join(tmpdir(), 'contextia-big-'))
    try {
      const f = join(tree, 'big.log')
      writeFileSync(f, 'x'.repeat(1_100_000) + '\nAKIAIOSFODNN7EXAMPLE\n')
      const s = run(['scan', f])
      assert(s.code === 1, `scan exited ${s.code} on a file with a secret in its tail`)
      const r = run(['redact', f])
      assert(!r.stdout.includes('AKIAIOSFODNN7EXAMPLE'), 'redact printed the tail secret in clear')
    } finally {
      rmSync(tree, { recursive: true, force: true })
    }
  })

  // `contextia scna .` printed the help and exited 0. In a pre-commit hook a
  // typo then reads as "nothing found".
  check('an unknown command exits 2, and help still exits 0', () => {
    const typo = run(['scna', '.'])
    assert(typo.code === 2, `a typo exited ${typo.code}`)
    assert(/unknown command/i.test(typo.stderr ?? ''), 'no message about the unknown command')
    for (const args of [[], ['help'], ['--help'], ['-h']]) {
      const h = run(args)
      assert(h.code === 0 && /Usage:/.test(h.stdout), `help via [${args.join(' ')}] exited ${h.code}`)
    }
  })

  check('a bad --port exits 2 with a message, not a stack trace', () => {
    for (const port of ['abc', '99999', '-1', '80.5', '']) {
      const r = run(['proxy', '--port', port])
      assert(r.code === 2, `--port '${port}' exited ${r.code}`)
      assert(!/node:net|at Object|RangeError/.test(r.stderr ?? ''), `--port '${port}' crashed with a stack trace`)
    }
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
