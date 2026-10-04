// Mutation testing, in a scratch copy.
//
//   node scripts/mutation.mjs [engine|cli|extension ...]      (default: all three)
//
// A coverage number says which lines ran; a mutation score says whether the tests would notice
// if the line were wrong. Stryker rewrites the code in small ways (a < becomes <=, a - becomes
// a +) and counts how many rewrites the unit suite catches. The repository builds with
// TypeScript 7, which Stryker cannot read, so the code is copied to a temporary folder with
// TypeScript 5 and the unit tests only (the process-level tests do not count here).
//
// A module that falls below its floor fails the run. The floors sit a little under what was
// measured, so a change that makes the tests blind to a kind of rewrite shows up; the
// surviving rewrites that remain are listed in docs/COVERAGE.md as equivalent (changing
// nothing a caller can see) or as not yet covered.

import { mkdtempSync, cpSync, writeFileSync, rmSync, existsSync, symlinkSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const TARGETS = {
  engine: {
    pkg: 'packages/engine',
    copy: ['src', 'test', 'rules', 'acceptance', 'tsconfig.json'],
    test: { include: ['test/**/*.test.ts'], environment: 'node' },
    modules: { 'src/detect.ts': 90, 'src/redact.ts': 90, 'src/custom.ts': 90, 'src/detectors/_util.ts': 90 },
  },
  cli: {
    pkg: 'packages/cli',
    copy: ['src', 'test', 'tsconfig.json'],
    engine: true,
    test: { include: ['test/**/*.test.ts'], environment: 'node', testTimeout: 120000 },
    modules: { 'src/proxy.ts': 75, 'src/core.ts': 80, 'src/json.ts': 80 },
  },
  extension: {
    pkg: 'packages/extension',
    copy: ['src', 'test', 'tsconfig.json'],
    link: ['happy-dom'],
    test: { include: ['test/**/*.test.ts'], environment: 'node', setupFiles: ['./test/setup.ts'] },
    modules: { 'src/gate.ts': 95, 'src/storage.ts': 95, 'src/reporter.ts': 95, 'src/mask.ts': 95, 'src/send-button.ts': 80 },
  },
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const names = wanted.length ? wanted : Object.keys(TARGETS)
for (const n of names) if (!TARGETS[n]) (console.error(`unknown target ${n}; choose from ${Object.keys(TARGETS).join(', ')}`), process.exit(2))

const run = (cmd, args, cwd, quiet = false) => {
  const r = spawnSync(cmd, args, { cwd, stdio: quiet ? 'pipe' : 'inherit', shell: process.platform === 'win32', encoding: 'utf8' })
  if (r.status !== 0) {
    if (quiet) process.stderr.write(`${r.stdout ?? ''}${r.stderr ?? ''}`)
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`)
  }
}

const table = []
let failed = 0
for (const name of names) {
  const t = TARGETS[name]
  const dir = mkdtempSync(join(tmpdir(), `contextia-mut-${name}-`))
  try {
    for (const f of t.copy) cpSync(join(root, t.pkg, f), join(dir, f), { recursive: true })
    // Only Stryker and TypeScript 5 are installed here. vitest and the rest come from the
    // checkout's own node_modules (run `npm ci` first): a fresh `npm install` of vitest from the
    // registry failed on its dependency tree with an npm error, and the lockfile's versions are
    // the ones the tests are meant to run on anyway.
    const deps = {
      '@stryker-mutator/core': '^10.0.0',
      '@stryker-mutator/vitest-runner': '^10.0.0',
      typescript: '^5.9.3',
    }
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `mut-${name}`, private: true, type: 'module', dependencies: deps }))
    writeFileSync(join(dir, 'vitest.config.ts'), `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: ${JSON.stringify(t.test)} })\n`)
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', '--legacy-peer-deps'], dir, true)
    for (const lib of ['vitest', 'vite', ...(t.link ?? [])]) {
      const from = join(root, 'node_modules', lib)
      if (!existsSync(from)) throw new Error(`${lib} is not in ${join(root, 'node_modules')}: run npm ci first`)
      symlinkSync(from, join(dir, 'node_modules', lib), 'junction')
    }
    if (t.engine) {
      // the CLI resolves the engine by name: point it at the built copy in this checkout
      mkdirSync(join(dir, 'node_modules', '@sbr0nch'), { recursive: true })
      symlinkSync(join(root, 'packages/engine'), join(dir, 'node_modules', '@sbr0nch', 'contextia-engine'), 'junction')
      if (!existsSync(join(root, 'packages/engine/dist/index.js'))) run('npm', ['run', 'build', '--workspace', '@sbr0nch/contextia-engine'], root)
    }
    const mutate = Object.keys(t.modules)
    run(
      'npx',
      ['stryker', 'run', '--mutate', mutate.join(','), '--testRunner', 'vitest', '--concurrency', '2', '--reporters', 'clear-text,json', '--coverageAnalysis', 'perTest', '--timeoutMS', '120000'],
      dir,
      true,
    )
  } catch (e) {
    // Stryker exits non-zero when it cannot run; its report, if any, is still read below
    if (!existsSync(join(dir, 'reports', 'mutation', 'mutation.json'))) {
      console.error(`${name}: ${e.message}`)
      failed++
      rmSync(dir, { recursive: true, force: true })
      continue
    }
  }
  try {
    const report = JSON.parse(readFileSync(join(dir, 'reports', 'mutation', 'mutation.json'), 'utf8'))
    for (const [file, floor] of Object.entries(t.modules)) {
      const entry = Object.entries(report.files).find(([k]) => k.replace(/\\/g, '/').endsWith(file))
      if (!entry) {
        table.push([name, file, 'not in report', floor, false])
        failed++
        continue
      }
      const ms = entry[1].mutants
      const killed = ms.filter((m) => m.status === 'Killed' || m.status === 'Timeout').length
      // as Stryker scores: a rewrite that does not compile, or was ignored, is not counted
      const valid = ms.filter((m) => !['CompileError', 'Ignored'].includes(m.status)).length
      const score = (100 * killed) / valid
      table.push([name, file, `${score.toFixed(1)}% (${killed} of ${valid})`, floor, score >= floor])
      if (score < floor) failed++
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('\nMutation score (unit tests only)')
for (const [name, file, score, floor, ok] of table) console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(9)} ${file.padEnd(26)} ${String(score).padEnd(22)} floor ${floor}%`)
process.exit(failed ? 1 : 0)
