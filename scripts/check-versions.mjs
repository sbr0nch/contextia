// The version lives in five files (three packages, the plugin, the marketplace entry). A tag
// was once cut on code whose files all said an older number. This fails when they disagree,
// and, given a tag (`node scripts/check-versions.mjs v2.2.0`), when the tag disagrees with them.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => JSON.parse(readFileSync(resolve(root, f), 'utf8'))
const found = {
  'packages/engine/package.json': read('packages/engine/package.json').version,
  'packages/cli/package.json': read('packages/cli/package.json').version,
  'packages/extension/package.json': read('packages/extension/package.json').version,
  'plugins/contextia/.claude-plugin/plugin.json': read('plugins/contextia/.claude-plugin/plugin.json').version,
  '.claude-plugin/marketplace.json': read('.claude-plugin/marketplace.json').plugins?.[0]?.version,
}
const versions = new Set(Object.values(found))
let bad = false
if (versions.size !== 1) {
  bad = true
  console.error('versions disagree:')
  for (const [f, v] of Object.entries(found)) console.error(`  ${String(v).padEnd(10)} ${f}`)
}
const tag = process.argv[2]
if (tag && !bad && tag.replace(/^v/, '') !== [...versions][0]) {
  bad = true
  console.error(`the tag says ${tag} but the files say ${[...versions][0]}`)
}
if (!bad) console.log(`version ${[...versions][0]} in all ${Object.keys(found).length} places${tag ? `, matching ${tag}` : ''}`)
process.exit(bad ? 1 : 0)
