#!/usr/bin/env node
// A second opinion: Contextia against detect-secrets (Yelp, Apache-2.0) on the same files.
//
//   pip install detect-secrets
//   node scripts/oracle.mjs [--detect-secrets /path/to/detect-secrets] [--fp-dir node_modules]
//
// Not part of `verify`: it needs a Python tool. Run it before a release.
//
// 1. Recall. Secrets are generated from the vendors' PUBLIC formats (prefix, length,
//    alphabet), not from either tool's regexes, one per file, in five contexts that
//    real leaks sit in (.env line, JSON, source string, markdown fence, log line).
//    A file counts as caught when the tool reports anything in it. The values are
//    random, so they are not live credentials.
// 2. False positives. Both tools scan a directory of third-party code, where
//    a real credential is not expected, so (almost) every finding is a false alarm.
//    Pattern-based plugins only for detect-secrets, so entropy and keyword plugins
//    do not make it look noisier than it is by design.

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(root, 'packages/cli/dist/cli.js')
const args = process.argv.slice(2)
const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const DS = val('--detect-secrets', 'detect-secrets')
const FP_DIR = resolve(val('--fp-dir', join(root, 'node_modules')))

let seed = 20261004
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
const pick = (s) => s[Math.floor(rnd() * s.length)]
const str = (alphabet, n) => Array.from({ length: n }, () => pick(alphabet)).join('')
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', az = 'abcdefghijklmnopqrstuvwxyz', D = '0123456789', HEX = '0123456789abcdef'
const ALNUM = AZ + az + D, B32 = AZ + '234567', URLSAFE = ALNUM + '_-'

// type -> generator, from the vendors' documented formats
const TYPES = {
  'AWS access key id': () => 'AKIA' + str(B32, 16),
  'GitHub personal token': () => 'ghp_' + str(ALNUM, 36),
  'GitHub fine-grained token': () => 'github_pat_' + str(ALNUM + '_', 22) + '_' + str(ALNUM, 59),
  'GitLab personal token': () => 'glpat-' + str(ALNUM + '_-', 20),
  'Slack bot token': () => `xoxb-${str(D, 12)}-${str(D, 13)}-${str(ALNUM, 24)}`,
  'Stripe live secret key': () => 'sk_live_' + str(ALNUM, 24),
  'Stripe restricted key': () => 'rk_live_' + str(ALNUM, 24),
  'Twilio API key': () => 'SK' + str(HEX, 32),
  'SendGrid key': () => 'SG.' + str(URLSAFE, 22) + '.' + str(URLSAFE, 43),
  'npm token': () => 'npm_' + str(ALNUM, 36),
  'OpenAI key': () => 'sk-' + str(ALNUM, 20) + 'T3BlbkFJ' + str(ALNUM, 20),
  'Anthropic key': () => 'sk-ant-api03-' + str(URLSAFE, 93) + 'AA',
  'Square access token': () => 'sq0atp-' + str(URLSAFE, 22),
  'Mailchimp key': () => str(HEX, 32) + '-us' + (1 + Math.floor(rnd() * 20)),
  'PyPI token': () => 'pypi-AgEIcHlwaS5vcmc' + str(URLSAFE, 70),
  'Telegram bot token': () => `${str(D, 9)}:${str(URLSAFE, 35)}`,
  'Discord bot token': () => 'M' + str(ALNUM, 23) + '.' + str(ALNUM, 6) + '.' + str(URLSAFE, 27),
  'PEM private key': () => '-----BEGIN RSA PRIVATE KEY-----\n' + Array.from({ length: 4 }, () => str(ALNUM + '+/', 64)).join('\n') + '\n-----END RSA PRIVATE KEY-----',
  'Postgres URL with password': () => `postgres://app:${str(ALNUM, 16)}@db-${str(az, 5)}.example.com:5432/app`,
}
const CONTEXTS = [
  ['env', (s) => `# production\nSERVICE_TOKEN=${s}\nDEBUG=false\n`, '.env'],
  ['json', (s) => JSON.stringify({ name: 'svc', credentials: { value: s }, retries: 3 }, null, 2) + '\n', 'config.json'],
  ['source', (s) => `import { client } from './client'\n\nconst conn = client("${s}")\nexport default conn\n`, 'app.js'],
  ['markdown', (s) => 'Set it like this:\n\n```\nexport KEY=' + s + '\n```\n', 'README.md'],
  ['log', (s) => `2026-10-04T09:12:01Z INFO request failed, header was Authorization: ${s} retrying in 5s\n`, 'app.log'],
]
const PER = 6 // samples per type per context: 19 types x 5 contexts x 6 = 570 files

const box = mkdtempSync(join(tmpdir(), 'contextia-oracle-'))
const planted = [] // { dir, type, ctx }
for (const [type, gen] of Object.entries(TYPES)) {
  for (const [ctx, wrap, file] of CONTEXTS) {
    for (let i = 0; i < PER; i++) {
      const dir = join(box, type.replace(/\W+/g, '_'), ctx, String(i))
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, file), wrap(gen()))
      planted.push({ dir, type, ctx })
    }
  }
}

const ours = (dir, extra = []) => {
  const r = spawnSync(process.execPath, [CLI, 'scan', dir, '--json', ...extra], { encoding: 'utf8', maxBuffer: 1 << 28 })
  return JSON.parse(r.stdout || '[]').map((x) => resolve(x.file))
}
const PATTERN_ONLY = ['--disable-plugin', 'Base64HighEntropyString', '--disable-plugin', 'HexHighEntropyString', '--disable-plugin', 'KeywordDetector']
const theirs = (dir, extra = []) => {
  // detect-secrets prints paths relative to where it was started, so start it in `dir`
  const r = spawnSync(DS, ['scan', '--all-files', '--no-verify', ...extra, '.'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 })
  if (r.error) { console.error(`cannot run ${DS}: ${r.error.message}`); process.exit(2) }
  return Object.entries(JSON.parse(r.stdout).results).flatMap(([f, hits]) => hits.map(() => resolve(dir, f)))
}

const oursFiles = new Set(ours(box))
const dsFiles = new Set(theirs(box, PATTERN_ONLY))
const dsAllFiles = new Set(theirs(box))
const rows = {}
for (const p of planted) {
  const f = (set) => [...set].some((x) => x.startsWith(p.dir + '/'))
  const r = (rows[p.type] ??= { n: 0, contextia: 0, ds_patterns: 0, ds_default: 0 })
  r.n++
  if (f(oursFiles)) r.contextia++
  if (f(dsFiles)) r.ds_patterns++
  if (f(dsAllFiles)) r.ds_default++
}
const tot = { n: 0, contextia: 0, ds_patterns: 0, ds_default: 0 }
console.log(`\nRecall: files with one planted random secret that the tool flagged (${PER * CONTEXTS.length} per type)\n`)
console.log('type'.padEnd(28), 'Contextia'.padStart(10), 'detect-secrets (patterns)'.padStart(27), 'detect-secrets (default)'.padStart(26))
for (const [type, r] of Object.entries(rows)) {
  for (const k of Object.keys(tot)) tot[k] += r[k]
  console.log(type.padEnd(28), `${r.contextia}/${r.n}`.padStart(10), `${r.ds_patterns}/${r.n}`.padStart(27), `${r.ds_default}/${r.n}`.padStart(26))
}
const pct = (a) => ((100 * a) / tot.n).toFixed(1) + '%'
console.log('ALL'.padEnd(28), `${tot.contextia}/${tot.n} ${pct(tot.contextia)}`.padStart(10), `${tot.ds_patterns}/${tot.n} ${pct(tot.ds_patterns)}`.padStart(27), `${tot.ds_default}/${tot.n} ${pct(tot.ds_default)}`.padStart(26))

// misses by Contextia that the other tool saw, and the reverse: the actionable part
const missedByUs = {}, missedByThem = {}
for (const p of planted) {
  const us = [...oursFiles].some((x) => x.startsWith(p.dir + '/')), them = [...dsAllFiles].some((x) => x.startsWith(p.dir + '/'))
  if (!us && them) missedByUs[p.type] = (missedByUs[p.type] ?? 0) + 1
  if (us && !them) missedByThem[p.type] = (missedByThem[p.type] ?? 0) + 1
}
console.log('\nContextia missed, detect-secrets (default) caught:', JSON.stringify(missedByUs))
console.log('detect-secrets (default) missed, Contextia caught:', JSON.stringify(missedByThem))

console.log(`\nFalse positives on third-party code: ${FP_DIR}`)
const fpOurs = ours(FP_DIR), fpDs = theirs(FP_DIR, PATTERN_ONLY), fpDsAll = theirs(FP_DIR)
console.log(`  Contextia (default detectors)         ${fpOurs.length} findings in ${new Set(fpOurs).size} files`)
console.log(`  detect-secrets (pattern plugins only) ${fpDs.length} findings in ${new Set(fpDs).size} files`)
console.log(`  detect-secrets (default plugins)      ${fpDsAll.length} findings in ${new Set(fpDsAll).size} files`)
rmSync(box, { recursive: true, force: true })
