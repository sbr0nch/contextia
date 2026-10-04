#!/usr/bin/env node
// A stranger's first ten minutes: clone, `npm ci`, `npm run verify`, with nothing
// built beforehand and nothing carried over from this working tree.
//
//   npm run test:clean
//
// `npm run verify` stopped working on a fresh clone when the engine started to be
// resolved through its built `dist/`: the extension's typecheck could not find it,
// and CI, which always starts from a fresh clone, was red on five pushes in a row
// including the 2.0.4 release. Nothing here caught it, because every working tree
// that had ever run a build had a `dist/` in it.
//
// It clones the last COMMIT, so commit first. Slow (about 30 s), so it is not in
// `verify`; run it before a release.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(join(tmpdir(), 'contextia-clean-'))
const run = (cmd, args) => execFileSync(cmd, args, { cwd: dir, stdio: 'inherit' })

try {
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', root, dir], { stdio: 'inherit' })
  run('npm', ['ci'])
  run('npm', ['run', 'verify'])
  console.log('\nclean clone: npm ci && npm run verify passed')
} catch {
  console.error('\nclean clone: FAILED. A stranger cannot get from clone to a green verify.')
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
