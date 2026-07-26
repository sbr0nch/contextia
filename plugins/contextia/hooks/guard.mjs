#!/usr/bin/env node
// Contextia guard for Claude Code. Runs on UserPromptSubmit: if the prompt about
// to be sent contains a secret, it blocks the submission with a reason. The
// detection engine is bundled in ../vendor/engine.js, so this needs only Node,
// no separately installed CLI, and nothing is sent anywhere.
import { readFileSync } from 'node:fs'
import { detectDetailed } from '../vendor/engine.js'

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

// Optional config injection: point CONTEXTIA_CONFIG at a JSON file to tune
// detectors and allowlists (the same shape the engine's `Config` accepts). Absent
// or unreadable → engine defaults. This reads a local file only; nothing is fetched.
function loadConfig() {
  const path = process.env.CONTEXTIA_CONFIG
  if (!path) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

const raw = readStdin()
let prompt = raw
try {
  const payload = JSON.parse(raw)
  // Fall back to the whole payload (which still contains the prompt) so a secret
  // is never missed if the field name ever changes.
  prompt = payload.prompt ?? payload.user_input ?? raw
} catch {
  // stdin wasn't JSON, so scan it as-is
}

const scan = detectDetailed(prompt, loadConfig())

// A prompt too long to scan in full is unknown, not clean. This hook exists to
// block, so it fails closed rather than waving through the part it never read.
if (scan.truncated && scan.findings.length === 0) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        `Contextia blocked this prompt: it is ${prompt.length} characters and only the first ` +
        `${scan.scannedLength} could be scanned, so the rest was never checked for secrets. ` +
        `Send it in smaller pieces.`,
    }),
  )
  process.exit(0)
}

if (scan.findings.length === 0) process.exit(0)

const types = [...new Set(scan.findings.map((f) => f.type))].join(', ')
const tail = scan.truncated
  ? ` (only the first ${scan.scannedLength} of ${prompt.length} characters could be scanned)`
  : ''
process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason: `Contextia blocked this prompt: it contains ${types}${tail}. Remove the secret before sending; its value must not reach the model.`,
  }),
)
process.exit(0)
