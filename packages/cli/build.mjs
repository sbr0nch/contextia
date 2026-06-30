import * as esbuild from 'esbuild'
import { chmod } from 'node:fs/promises'

await esbuild.build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/cli.js',
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
})
await chmod('dist/cli.js', 0o755)
console.log('contextia-cli: built dist/cli.js')
