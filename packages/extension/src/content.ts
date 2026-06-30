import { detect, redact, type Config, type Finding } from '@contextia/engine'
import { findComposer, type Composer } from './composer.js'
import { Hud } from './ui.js'
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
  chrome.storage.onChanged.addListener((changes) => {
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
  findings = text ? detect(text, effectiveConfig()) : []
  hud.setState(findings, composer, settings.mode)
  updateSendButton()
  if (findings.length) {
    logNew(findings)
    if (settings.mode === 'auto-redact') doRedact('redacted')
  }
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
  const btn = document.querySelector<HTMLElement>('[data-testid="send-button"], button[type="submit"]')
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

function isSendTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target.closest('button, [role="button"]') : null
  if (!el) return false
  if (el.matches('[data-testid="send-button"], button[type="submit"]')) return true
  const hint = `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('data-testid') ?? ''}`.toLowerCase()
  return /\bsend\b|invia|submit/.test(hint)
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
  scan()
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
