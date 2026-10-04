// Print the CHANGELOG section of one version: `node scripts/release-notes.mjs 2.2.0`.
// The release workflow uses it as the body of the GitHub release. Exits 1 if there is no such section.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = (process.argv[2] ?? '').replace(/^v/, '')
if (!version) (console.error('usage: release-notes.mjs <version>'), process.exit(2))
const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'CHANGELOG.md'), 'utf8')
const lines = text.split('\n')
const start = lines.findIndex((l) => l.trim() === `## v${version}` || l.startsWith(`## v${version} `))
if (start < 0) (console.error(`CHANGELOG.md has no section "## v${version}"`), process.exit(1))
let end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
if (end < 0) end = lines.length
console.log(lines.slice(start + 1, end).join('\n').trim())
