import { detect, redact, customFindings, type Config, type Finding } from '@contextia/engine'
import { findComposer, type Composer } from './composer.js'
import { Hud } from './ui.js'
import { api } from './api.js'
import { scoreSendButton, isSendTarget } from './send-button.js'
import {
  getSettings,
  toEngineConfig,
  setSettings,
  appendLog,
  bumpStats,
  type LogAction,
  type LogEntry,
  type Settings,
} from './storage.js'

const SITE = location.hostname
let settings: Settings
let hud: Hud
let composer: Composer | null = null
let findings: Finding[] = []
const sessionAllow = new Set<string>() // allow-once values, this tab only
const logged = new Set<string>() // de-dupes the "flagged" log/stat per secret

void init()

async function init(): Promise<void> {
  settings = await getSettings()
  hud = new Hud({
    onRedactAll: () => doRedact('redacted'),
    onRedactOne: (f) => doRedactOne(f),
    onAllowOnce: (f) => {
      sessionAllow.add(f.match)
      recordAllow(f)
      scan()
    },
    onAllowAll: (fs) => {
      for (const f of fs) {
        sessionAllow.add(f.match)
        recordAllow(f)
      }
      scan()
    },
    onAllowPattern: (f) => void allowPattern(f),
  })
  if (settings.mode !== 'off') {
    hud.mount()
    document.addEventListener('input', onInput, true)
    document.addEventListener('paste', () => setTimeout(scan, 0), true)
    document.addEventListener('keydown', onKeydown, true)
    document.addEventListener('click', onSendClick, true)
    document.addEventListener('submit', onSubmit, true)
    window.addEventListener('scroll', () => hud.setState(findings, composer, settings.mode), true)
    scan()
  }
  api.storage.onChanged.addListener((changes) => {
    if (changes['settings']) {
      settings = { ...settings, ...(changes['settings'].newValue as Settings) }
      scan()
    }
  })
}

const onInput = debounce(scan, 150)

function effectiveConfig(): Config {
  const base = toEngineConfig(settings)
  return {
    ...base,
    allowlist: {
      values: [...(base.allowlist?.values ?? []), ...sessionAllow],
      patterns: base.allowlist?.patterns ?? [],
    },
  }
}

function scan(): void {
  if (settings.mode === 'off') {
    findings = []
    return
  }
  composer = findComposer()
  const text = composer?.getText() ?? ''
  findings = text ? scanText(text) : []
  hud.setState(findings, composer, settings.mode)
  updateSendButton()
  if (findings.length) {
    logNew(findings)
    if (settings.mode === 'auto-redact') doRedact('redacted')
  }
}

// Detected secrets plus the user's own "always redact" values. A custom match is
// dropped if a detector already covers the same span, and if it's been allowed.
function scanText(text: string): Finding[] {
  const detected = detect(text, effectiveConfig())
  const custom = customFindings(text, settings.redactlist)
  if (custom.length === 0) return detected
  const covered = new Set(detected.map((f) => `${f.start}:${f.end}`))
  const extra = custom.filter(
    (f) => !covered.has(`${f.start}:${f.end}`) && !sessionAllow.has(f.match),
  )
  return [...detected, ...extra].sort((a, b) => a.start - b.start || b.end - a.end)
}

// In Block mode, dim the site's send button so it's clear why nothing happens.
let dimmedButton: HTMLElement | null = null
function updateSendButton(): void {
  const shouldDim = settings.mode === 'block' && findings.length > 0
  if (!shouldDim) {
    if (dimmedButton) {
      restoreButton(dimmedButton)
      dimmedButton = null
    }
    return
  }
  const btn = findSendButton()
  if (!btn) return
  if (dimmedButton && dimmedButton !== btn) restoreButton(dimmedButton)
  btn.style.opacity = '0.45'
  btn.style.cursor = 'not-allowed'
  btn.title = 'Contextia: resolve the flagged secrets before sending'
  dimmedButton = btn
}
function restoreButton(b: HTMLElement): void {
  b.style.opacity = ''
  b.style.cursor = ''
  b.removeAttribute('title')
}

function doRedactOne(f: Finding): void {
  if (!composer) return
  composer.setText(redact(composer.getText(), [f]))
  void bumpStats({ redacted: 1 })
  void appendLog([entry(f, 'redacted')])
  setTimeout(scan, 0)
}

function doRedact(action: LogAction): void {
  if (!composer || findings.length === 0) return
  const redacted = redact(composer.getText(), findings)
  composer.setText(redacted)
  void bumpStats({ redacted: findings.length })
  void appendLog(findings.map((f) => entry(f, action)))
  setTimeout(scan, 0)
}

function onKeydown(e: KeyboardEvent): void {
  if (settings.mode !== 'block' || findings.length === 0) return
  if (e.key === 'Enter' && !e.shiftKey) blockSubmit(e)
}

// Block mode must also stop a click on the send button, not just the Enter key.
function onSendClick(e: MouseEvent): void {
  if (settings.mode !== 'block' || findings.length === 0) return
  if (isSendTarget(e.target)) blockSubmit(e)
}

function onSubmit(e: Event): void {
  if (settings.mode !== 'block' || findings.length === 0) return
  blockSubmit(e)
}

// Send-button detection (resilient scoring) lives in ./send-button so it can be
// unit-tested in isolation. Enter-key blocking works regardless of any of this.
function findSendButton(): HTMLElement | null {
  const scope: ParentNode = composer?.el.closest('form') ?? document
  let best: HTMLElement | null = null
  let bestScore = 2 // require a real signal, not just "some button"
  for (const b of scope.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    const s = scoreSendButton(b)
    if (s > bestScore) {
      bestScore = s
      best = b
    }
  }
  return best
}

function blockSubmit(e: Event): void {
  e.preventDefault()
  e.stopImmediatePropagation()
  void appendLog(findings.map((f) => entry(f, 'blocked')))
  hud.setState(findings, composer, settings.mode)
  hud.flashBlocked(findings.length)
}

async function allowPattern(f: Finding): Promise<void> {
  const escaped = f.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!settings.allowlist.patterns.includes(escaped)) {
    settings = { ...settings, allowlist: { ...settings.allowlist, patterns: [...settings.allowlist.patterns, escaped] } }
    await setSettings(settings)
  }
  recordAllow(f)
  scan()
}

// An allow is a user decision, not a catch — track it separately so the stats
// reflect "you chose to let this through" without inflating the caught count.
function recordAllow(f: Finding): void {
  void bumpStats({ allowed: 1 })
  void appendLog([entry(f, 'allowed')])
}

function logNew(fs: Finding[]): void {
  const fresh = fs.filter((f) => !logged.has(f.type + '|' + f.match))
  for (const f of fresh) logged.add(f.type + '|' + f.match)
  if (fresh.length) {
    void bumpStats({ caught: fresh.length })
    void appendLog(fresh.map((f) => entry(f, 'flagged')))
  }
}

function entry(f: Finding, action: LogAction): LogEntry {
  return { ts: Date.now(), site: SITE, type: f.type, severity: f.severity, action }
}

function debounce<T extends (...a: never[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | undefined
  return ((...args: never[]) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }) as T
}
