import * as esbuild from 'esbuild'
import { chmod, readFile } from 'node:fs/promises'

const { version } = JSON.parse(await readFile('package.json', 'utf8'))

await esbuild.build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/cli.js',
  banner: { js: '#!/usr/bin/env node' },
  define: { __CONTEXTIA_VERSION__: JSON.stringify(version) },
  legalComments: 'none',
})
await chmod('dist/cli.js', 0o755)
console.log(`contextia-cli: built dist/cli.js (v${version})`)
