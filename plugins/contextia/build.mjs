// Bundles the detection engine into vendor/engine.js so the plugin is
// self-contained — it needs only Node, no separately installed CLI.
// Regenerate after changing the engine: `node plugins/contextia/build.mjs`.
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

await esbuild.build({
  entryPoints: [join(here, '..', '..', 'packages', 'engine', 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  legalComments: 'none',
  outfile: join(here, 'vendor', 'engine.js'),
})
console.log('contextia plugin: bundled engine -> vendor/engine.js')
