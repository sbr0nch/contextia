#!/usr/bin/env node
// Contextia guard for Claude Code. Runs on UserPromptSubmit: if the prompt about
// to be sent contains a secret, it blocks the submission with a reason. Detection
// runs on-device via the Contextia CLI — nothing is sent anywhere.
//
// Requires the CLI: npm i -g @sbr0nch/contextia
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

const raw = readStdin()
let prompt = raw
try {
  const payload = JSON.parse(raw)
  // The prompt field name isn't formally documented; fall back to the whole
  // payload (which still contains the prompt) so a secret is never missed.
  prompt = payload.prompt ?? payload.user_input ?? raw
} catch {
  // stdin wasn't JSON — scan it as-is
}

const scan = spawnSync('contextia', ['scan', '--json'], { input: prompt, encoding: 'utf8' })

// Allow the prompt through unless a secret was actually found. Fail open if the
// CLI isn't installed (exit 2 would block every prompt) — the README covers setup.
if (scan.error || scan.status !== 1) process.exit(0)

let types = []
try {
  types = [...new Set((JSON.parse(scan.stdout) ?? []).map((f) => f.type))]
} catch {
  // keep types empty; still block
}

const what = types.length ? types.join(', ') : 'a secret'
process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason: `Contextia blocked this prompt: it contains ${what}. Remove the secret before sending — its value must not reach the model.`,
  }),
)
process.exit(0)
