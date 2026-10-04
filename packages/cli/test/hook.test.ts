import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// The plugin hook is a guard whose one job is to block. Run as the process the
// host runs, it must answer {"decision":"block"} for every prompt that holds a
// secret, and when it cannot scan at all it must say so and block, never crash:
// a crash is a non-blocking error to the host, so the prompt goes through.
const PLUGIN = resolve(__dirname, '../../../plugins/contextia')
const SECRET = 'AKIAIOSFODNN7EXAMPLE'

function run(stdin: string, opts: { root?: string; env?: Record<string, string> } = {}) {
  const r = spawnSync(process.execPath, [join(opts.root ?? PLUGIN, 'hooks/guard.mjs')], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
  })
  return { status: r.status, out: r.stdout, err: r.stderr }
}
const blocked = (out: string): boolean => (out ? (JSON.parse(out) as { decision?: string }).decision === 'block' : false)

describe('plugin hook, when the prompt cannot be read', () => {
  // readStdin used to swallow every error and return '', which scans clean: a prompt
  // the hook could not read was sent. These are the ways stdin fails.
  const viaShell = (redirect: string) =>
    spawnSync('sh', ['-c', `${JSON.stringify(process.execPath)} ${JSON.stringify(join(PLUGIN, 'hooks/guard.mjs'))} ${redirect}`], { encoding: 'utf8' })

  it('blocks, with a reason, when stdin is closed', () => {
    const r = viaShell('<&-')
    expect(r.status).toBe(0)
    expect(blocked(r.stdout)).toBe(true)
    expect(r.stdout).toMatch(/could not scan/i)
  })

  it('blocks when stdin is a directory', () => {
    expect(blocked(viaShell('< /tmp').stdout)).toBe(true)
  })

  it('blocks an empty stdin: no input at all means the prompt was not read, not that it was clean', () => {
    for (const redirect of ['< /dev/null', '< /tmp']) {
      const r = viaShell(redirect)
      expect(r.status).toBe(0)
      expect(blocked(r.stdout), redirect).toBe(true)
    }
    const spaces = spawnSync(process.execPath, [join(PLUGIN, 'hooks/guard.mjs')], { input: ' \n ', encoding: 'utf8' })
    expect(blocked(spaces.stdout)).toBe(true)
  })

  it('does not block a payload whose prompt is the empty string', () => {
    const r = spawnSync(process.execPath, [join(PLUGIN, 'hooks/guard.mjs')], { input: JSON.stringify({ prompt: '' }), encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })

  it('reads a prompt that arrives in several chunks, slowly', () => {
    const r = spawnSync('sh', ['-c', `(printf '{"prompt":"k AKIA'; sleep 0.3; printf 'IOSFODNN7EXAMPLE"}') | ${JSON.stringify(process.execPath)} ${JSON.stringify(join(PLUGIN, 'hooks/guard.mjs'))}`], { encoding: 'utf8' })
    expect(blocked(r.stdout)).toBe(true)
  })
})

describe('plugin hook', () => {
  it('blocks a prompt with a secret, and says which type', () => {
    const r = run(JSON.stringify({ prompt: `key ${SECRET}` }))
    expect(r.status).toBe(0)
    expect(blocked(r.out)).toBe(true)
    expect(r.out).toContain('aws_access_key_id')
    expect(r.out).not.toContain(SECRET)
  })

  it('lets a clean prompt through silently', () => {
    const r = run(JSON.stringify({ prompt: 'hello' }))
    expect(r.status).toBe(0)
    expect(r.out).toBe('')
  })

  it('scans stdin that is not JSON as it is', () => {
    expect(blocked(run(`key ${SECRET}`).out)).toBe(true)
  })

  for (const [label, prompt] of [
    ['an array', [SECRET]],
    ['an object', { a: SECRET }],
    ['a number', 123],
    ['null', null],
  ] as const) {
    it(`blocks when the prompt field is ${label} and the payload holds a secret`, () => {
      const payload = { hook_event_name: 'UserPromptSubmit', prompt, note: SECRET }
      const r = run(JSON.stringify(payload))
      expect(r.status).toBe(0)
      expect(blocked(r.out)).toBe(true)
    })
  }

  it('does not crash on a non-string prompt that is clean', () => {
    const r = run(JSON.stringify({ prompt: ['hello'] }))
    expect(r.status).toBe(0)
    expect(r.out).toBe('')
  })

  it('blocks a prompt past the scan cap instead of calling it clean', () => {
    const r = run(JSON.stringify({ prompt: 'x'.repeat(1_100_000) }))
    expect(blocked(r.out)).toBe(true)
    expect(r.out).toContain('smaller pieces')
  })

  it('still blocks when CONTEXTIA_CONFIG is missing or malformed (defaults apply)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-hook-'))
    try {
      const bad = join(dir, 'bad.json')
      writeFileSync(bad, '{not json')
      expect(blocked(run(JSON.stringify({ prompt: SECRET }), { env: { CONTEXTIA_CONFIG: bad } }).out)).toBe(true)
      expect(blocked(run(JSON.stringify({ prompt: SECRET }), { env: { CONTEXTIA_CONFIG: join(dir, 'nope.json') } }).out)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails closed, with a reason, when the bundled engine is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-hook-'))
    try {
      cpSync(PLUGIN, dir, { recursive: true })
      rmSync(join(dir, 'vendor/engine.js'))
      const r = run(JSON.stringify({ prompt: SECRET }), { root: dir })
      expect(r.status).toBe(0)
      expect(blocked(r.out)).toBe(true)
      expect(r.out).toMatch(/could not scan/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
