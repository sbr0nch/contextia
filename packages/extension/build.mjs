import * as esbuild from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'

const watch = process.argv.includes('--watch')
const outdir = 'dist'

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: 'iife', // content scripts are not ES modules; iife is safe everywhere
  target: 'chrome120',
  legalComments: 'none',
  logLevel: 'info',
}

const ctx = await esbuild.context({
  ...common,
  entryPoints: {
    content: 'src/content.ts',
    background: 'src/background.ts',
    popup: 'src/popup.ts',
    options: 'src/options.ts',
  },
  outdir,
})

async function copyStatic() {
  await cp('manifest.json', `${outdir}/manifest.json`)
  await cp('public', outdir, { recursive: true })
}

await ctx.rebuild()
await copyStatic()

if (watch) {
  await ctx.watch()
  console.log('contextia: watching for changes…')
} else {
  await ctx.dispose()
  console.log('contextia: built to dist/')
}
