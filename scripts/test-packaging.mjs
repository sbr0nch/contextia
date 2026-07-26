#!/usr/bin/env node
// Install what npm would publish, into a clean project, and use it.
//
//   npm run test:pack
//
// Every published version of the engine from 0.1.0 to 2.0.2 was impossible to
// import. `exports` pointed at ./src/index.ts while `files` shipped only dist,
// and `exports` beats `main`, so every consumer got ERR_MODULE_NOT_FOUND. It
// went unnoticed for five releases because nothing here ever consumed the
// package the way a stranger does: the CLI bundles the engine from the
// workspace source at build time, and the tests import dist by absolute path,
// which bypasses `exports` entirely.
//
// So this packs the tarballs, installs them somewhere with no workspace to fall
// back on, and imports them by name.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const record = (ok, name, detail = '') => results.push([ok, name, detail])

const npm = (args, cwd) =>
  execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const box = mkdtempSync(join(tmpdir(), 'contextia-pack-'))
try {
  // Build, then pack exactly what publish would send.
  npm(['run', 'build'], root)
  for (const pkg of ['packages/engine', 'packages/cli']) {
    npm(['pack', '--pack-destination', box], join(root, pkg))
  }
  const tarballs = readdirSync(box).filter((f) => f.endsWith('.tgz'))
  record(tarballs.length === 2, 'both packages pack', tarballs.join(', '))

  // A project with no workspace, no source tree, nothing to fall back on.
  const app = join(box, 'app')
  execFileSync('mkdir', ['-p', app])
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app', type: 'module', private: true }))
  npm(['install', ...tarballs.map((t) => join(box, t)), '--no-audit', '--no-fund'], app)

  const engineDir = join(app, 'node_modules/@sbr0nch/contextia-engine')

  record(existsSync(engineDir), 'the engine installs')

  // The thing that was broken: importing by name.
  writeFileSync(
    join(app, 'use.mjs'),
    `import { detect, redact, detectDetailed, detectors } from '@sbr0nch/contextia-engine'
const f = detect('deploy AKIAIOSFODNN7EXAMPLE now')
if (f.length !== 1) throw new Error('expected 1 finding, got ' + f.length)
const out = redact('deploy AKIAIOSFODNN7EXAMPLE now', f)
if (out.includes('AKIAIOSFODNN7EXAMPLE')) throw new Error('redact left the secret in place')
if (!detectDetailed('x').hasOwnProperty('truncated')) throw new Error('detectDetailed missing truncated')
if (!Array.isArray(detectors) || detectors.length === 0) throw new Error('no detectors exported')
console.log('ok ' + detectors.length)
`,
  )
  try {
    const out = execFileSync(process.execPath, ['use.mjs'], { cwd: app, encoding: 'utf8' })
    record(true, 'the engine imports by name and works', out.trim())
  } catch (e) {
    record(false, 'the engine imports by name and works', String(e.stderr ?? e.message).split('\n')[0])
  }

  // Types have to resolve to something that exists, or every TypeScript
  // consumer gets a red squiggle on the import line.
  try {
    const pkg = JSON.parse(execFileSync('cat', [join(engineDir, 'package.json')], { encoding: 'utf8' }))
    const typesPath = pkg.exports?.['.']?.types ?? pkg.types
    const ok = typeof typesPath === 'string' && existsSync(join(engineDir, typesPath))
    record(ok, 'the declared types file is actually shipped', `${typesPath}`)
    const importPath = pkg.exports?.['.']?.import ?? pkg.main
    const ok2 = typeof importPath === 'string' && existsSync(join(engineDir, importPath))
    record(ok2, 'the declared entry point is actually shipped', `${importPath}`)
  } catch (e) {
    record(false, 'the declared entry point is actually shipped', e.message)
  }

  // And the CLI has to run from the installed bin.
  try {
    const out = execFileSync(process.execPath, ['node_modules/.bin/contextia', 'version'], {
      cwd: app,
      encoding: 'utf8',
    })
    record(/\d+\.\d+\.\d+/.test(out), 'the CLI bin runs when installed', out.trim())
  } catch (e) {
    record(false, 'the CLI bin runs when installed', String(e.stderr ?? e.message).split('\n')[0])
  }
} finally {
  rmSync(box, { recursive: true, force: true })
}

const line = '-'.repeat(70)
console.log(`\n${line}\nPackaging, as a consumer sees it\n${line}`)
for (const [ok, name, detail] of results) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`)
}
const failed = results.filter(([ok]) => !ok).length
console.log(failed ? `\n${failed} failed\n` : `\nall ${results.length} passed\n`)
process.exit(failed ? 1 : 0)
