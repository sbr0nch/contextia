#!/usr/bin/env node
// Contextia guard for Claude Code. Runs on UserPromptSubmit: if the prompt about
// to be sent contains a secret, it blocks the submission with a reason. The
// detection engine is bundled in ../vendor/engine.js, so this needs only Node —
// no separately installed CLI, and nothing is sent anywhere.
import { readFileSync } from 'node:fs'
import { detect } from '../vendor/engine.js'

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
  // stdin wasn't JSON — scan it as-is
}

const findings = detect(prompt, loadConfig())
if (findings.length === 0) process.exit(0)

const types = [...new Set(findings.map((f) => f.type))].join(', ')
process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason: `Contextia blocked this prompt: it contains ${types}. Remove the secret before sending — its value must not reach the model.`,
  }),
)
process.exit(0)
