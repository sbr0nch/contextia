#!/usr/bin/env node
// Contextia guard for Claude Code. Runs on UserPromptSubmit: if the prompt about
// to be sent contains a secret, it blocks the submission with a reason. Detection
// runs on-device via the Contextia CLI — nothing is sent anywhere.
//
// Requires the CLI: npm i -g @sbr0nch/contextia
import { readFileSync, appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

// TEMP diagnostic log (removed once we confirm the hook wiring on Windows).
const LOG = join(homedir(), 'contextia-guard-debug.log')
const log = (m) => {
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`)
  } catch {
    /* ignore */
  }
}

log('--- hook fired ---')

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

const raw = readStdin()
log(`stdin bytes=${raw.length}`)
let prompt = raw
try {
  const payload = JSON.parse(raw)
  prompt = payload.prompt ?? payload.user_input ?? raw
  log(`parsed json; prompt field len=${(payload.prompt ?? payload.user_input ?? '').length}`)
} catch {
  log('stdin not json; scanning raw')
}

const scan = spawnSync('contextia', ['scan', '--json'], { input: prompt, encoding: 'utf8' })
log(`scan spawn error=${scan.error ? scan.error.code : 'none'} status=${scan.status}`)
log(`scan stdout=${(scan.stdout || '').slice(0, 200)}`)

if (scan.error || scan.status !== 1) {
  log('allow (no secret / cli missing / error)')
  process.exit(0)
}

let types = []
try {
  types = [...new Set((JSON.parse(scan.stdout) ?? []).map((f) => f.type))]
} catch {
  /* keep types empty; still block */
}

const what = types.length ? types.join(', ') : 'a secret'
log(`BLOCK types=${what}`)
process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason: `Contextia blocked this prompt: it contains ${what}. Remove the secret before sending — its value must not reach the model.`,
  }),
)
process.exit(0)
