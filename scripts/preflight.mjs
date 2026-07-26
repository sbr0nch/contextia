#!/usr/bin/env node
// Release preflight. Everything here exists because it went wrong once.
//
// Run before tagging anything: `npm run preflight`. It checks the things that
// are invisible until a store reviewer or a user finds them, and prints a
// per-channel checklist with the version each channel must carry.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

const read = (p) => readFileSync(p, 'utf8')
const json = (p) => JSON.parse(read(p))
const fail = []
const warn = []

// --- every file that carries a version, and how to read it -----------------
const VERSIONED = [
  ['packages/engine/package.json', (d) => d.version, 'npm @sbr0nch/contextia-engine'],
  ['packages/cli/package.json', (d) => d.version, 'npm @sbr0nch/contextia'],
  ['packages/extension/package.json', (d) => d.version, 'Chrome Web Store + Firefox AMO'],
  ['plugins/contextia/.claude-plugin/plugin.json', (d) => d.version, 'Claude Code plugin'],
  ['.claude-plugin/marketplace.json', (d) => d.plugins[0].version, 'Claude Code marketplace'],
]

const versions = VERSIONED.map(([file, get, channel]) => ({
  file,
  channel,
  version: get(json(file)),
}))

const distinct = [...new Set(versions.map((v) => v.version))]
if (distinct.length !== 1) {
  fail.push(
    `versions have drifted: ${distinct.join(', ')}\n` +
      versions.map((v) => `        ${v.version.padEnd(8)} ${v.file}`).join('\n') +
      '\n        Every surface ships one number. Bump them together.',
  )
}
const VERSION = distinct.length === 1 ? distinct[0] : null

// --- store validators reject innerHTML, whatever you assign to it ----------
const bundles = ['packages/extension/dist', 'packages/extension/dist-firefox']
  .filter(existsSync)
  .flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))

if (bundles.length === 0) {
  warn.push('extension is not built, so innerHTML could not be checked (run npm run build)')
} else {
  const dirty = bundles.filter((f) => read(f).includes('innerHTML'))
  if (dirty.length) {
    fail.push(
      `innerHTML present in built bundles: ${dirty.join(', ')}\n` +
        '        AMO and the Chrome Web Store flag every write, constant or not.\n' +
        '        Build the node with svgNode() from src/brand.ts instead.',
    )
  }
}

// --- the repo deliberately carries no em or en dashes ----------------------
const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
const dashed = tracked.filter((f) => {
  if (/\.(png|jpg|jpeg|gif|zip|xpi|crx|woff2?)$/i.test(f)) return false
  try {
    const t = read(f)
    return t.includes('—') || t.includes('–')
  } catch {
    return false
  }
})
if (dashed.length) fail.push(`em or en dash found in: ${dashed.join(', ')}`)

// --- a release is cut from a clean tree ------------------------------------
const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
if (status) warn.push(`working tree is not clean:\n        ${status.split('\n').join('\n        ')}`)

// --- report ----------------------------------------------------------------
const line = '-'.repeat(70)
console.log(`\n${line}\nContextia release preflight\n${line}`)

for (const f of fail) console.log(`  FAIL  ${f}`)
for (const w of warn) console.log(`  WARN  ${w}`)
if (!fail.length && !warn.length) console.log('  All checks passed.')

if (VERSION) {
  console.log(`\n  Version to publish everywhere: ${VERSION}\n`)
  console.log('  Channel checklist')
  console.log('  ' + '-'.repeat(66))
  const rows = [
    ['npm @sbr0nch/contextia-engine', `npm publish --workspace @sbr0nch/contextia-engine`],
    ['npm @sbr0nch/contextia', `npm publish --workspace @sbr0nch/contextia`],
    ['git tag', `git tag v${VERSION} && git push origin v${VERSION}`],
    ['GitHub release', `releases/new, tag v${VERSION}, attach both zips`],
    ['Chrome Web Store', `upload packages/extension/contextia.zip`],
    ['Firefox AMO', `upload contextia-firefox.zip + source archive`],
    ['Claude Code plugin', `push to main; version already in both manifests`],
  ]
  for (const [c, cmd] of rows) console.log(`  ${c.padEnd(30)} ${cmd}`)
  console.log(
    `\n  Source archive for AMO:\n` +
      `  git archive --format=zip --prefix=contextia-${VERSION}/ v${VERSION} -o contextia-source-${VERSION}.zip\n`,
  )
}

console.log(line + '\n')
process.exit(fail.length ? 1 : 0)
