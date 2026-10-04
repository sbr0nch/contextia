#!/usr/bin/env node
// Contextia guard for Claude Code. Runs on UserPromptSubmit: if the prompt about
// to be sent contains a secret, it blocks the submission with a reason. The
// detection engine is bundled in ../vendor/engine.js, so this needs only Node,
// no separately installed CLI, and nothing is sent anywhere.
import { readFileSync } from 'node:fs'

// Reading can fail, and from inside the process some failures look like an empty stdin:
// Node reopens a closed stdin as /dev/null, and a directory reads as nothing. The host
// always sends a JSON payload, so no input at all means the prompt could not be read.
// That is not the same as a clean prompt, so it is not swallowed: it reaches the guard
// below, which blocks.
async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') throw new Error('no input was received on stdin')
  return text
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

function block(reason) {
  // Exit from the write callback: process.exit() right after write() can drop the
  // answer on a pipe that is written asynchronously, and a dropped answer is a prompt
  // that goes through. (Not shown failing on Linux: the answer is about 1 KB. Defensive.)
  process.stdout.write(JSON.stringify({ decision: 'block', reason }), () => process.exit(0))
}

async function main() {
  // Loaded here, not at the top, so a missing or broken bundle is caught by the caller
  // instead of crashing the process: the host treats a crash as a non-blocking
  // error and sends the prompt anyway.
  const { detectDetailed } = await import('../vendor/engine.js')

  const raw = await readStdin()
  let prompt = raw
  try {
    const payload = JSON.parse(raw)
    // Scan the prompt field when it is text. If it is anything else, or absent,
    // scan the whole payload (which still contains the prompt) so a secret is
    // never missed because a field changed name or type.
    prompt = typeof payload?.prompt === 'string' ? payload.prompt : typeof payload?.user_input === 'string' ? payload.user_input : raw
  } catch {
    // stdin wasn't JSON, so scan it as-is
  }

  const scan = detectDetailed(prompt, loadConfig())

  // A prompt too long to scan in full is unknown, not clean. This hook exists to
  // block, so it fails closed rather than waving through the part it never read.
  if (scan.truncated && scan.findings.length === 0) {
    return block(
      `Contextia blocked this prompt: it is ${prompt.length} characters and only the first ` +
        `${scan.scannedLength} could be scanned, so the rest was never checked for secrets. ` +
        `Send it in smaller pieces.`,
    )
  }

  if (scan.findings.length === 0) return process.exit(0)

  const types = [...new Set(scan.findings.map((f) => f.type))].join(', ')
  const tail = scan.truncated
    ? ` (only the first ${scan.scannedLength} of ${prompt.length} characters could be scanned)`
    : ''
  return block(`Contextia blocked this prompt: it contains ${types}${tail}. Remove the secret before sending; its value must not reach the model.`)
}

main().catch((err) =>
  block(
    `Contextia could not scan this prompt (${err instanceof Error ? err.message : String(err)}), ` +
      `so it was blocked rather than sent unchecked. Reinstall or update the plugin, or disable it to send.`,
  ),
)
