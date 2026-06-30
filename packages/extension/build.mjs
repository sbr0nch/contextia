import * as esbuild from 'esbuild'
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'

const watch = process.argv.includes('--watch')
const firefox = process.argv.includes('--firefox')
const outdir = firefox ? 'dist-firefox' : 'dist'

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

// Bump a monotonic build number on every build so the version visibly changes
// in chrome://extensions — an easy way to confirm a reload picked up new code.
async function writeManifest() {
  const counterFile = '.build-number'
  let n = 0
  try {
    n = parseInt(await readFile(counterFile, 'utf8'), 10) || 0
  } catch {
    n = 0
  }
  n += 1
  await writeFile(counterFile, String(n))

  const { version } = JSON.parse(await readFile('package.json', 'utf8'))
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'))
  // Stable store version from package.json; the dev build number lives in
  // version_name so a reload is still visibly different in chrome://extensions.
  manifest.version = version
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  manifest.version_name = `${version} · build ${n} · ${stamp} UTC`
  if (firefox) {
    // Firefox MV3 background is an event page (scripts), and it needs an add-on id.
    manifest.background = { scripts: ['background.js'] }
    manifest.browser_specific_settings = {
      gecko: {
        id: 'contextia@contextia.dev',
        strict_min_version: '121.0',
        // AMO requires an explicit data-collection declaration; Contextia
        // collects and transmits nothing.
        data_collection_permissions: { required: ['none'] },
      },
    }
  }
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2))
  console.log(`contextia: version ${version} build ${n}${firefox ? ' (firefox)' : ''}`)
}

async function copyStatic() {
  await writeManifest()
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
