import { detectors } from '@contextia/engine'
import {
  getSettings,
  setSettings,
  getLog,
  clearAll,
  type Mode,
  type Settings,
} from './storage.js'

const MODE_LABELS: Record<Mode, string> = {
  warn: 'Warn — flag, let me decide',
  'auto-redact': 'Auto-redact before send',
  block: 'Block send until resolved',
  off: 'Off',
}

function el(tag: string, cls = '', text = ''): HTMLElement {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text) n.textContent = text
  return n
}

function effectiveEnabled(s: Settings): Set<string> {
  if (s.enabledDetectors) return new Set(s.enabledDetectors)
  return new Set(detectors.filter((d) => d.defaultEnabled).map((d) => d.id))
}

let settings: Settings

async function persist(next: Partial<Settings>): Promise<void> {
  settings = { ...settings, ...next }
  await setSettings(settings)
}

async function render(): Promise<void> {
  settings = await getSettings()
  const log = await getLog()
  const app = document.getElementById('app')
  if (!app) return
  app.replaceChildren()

  const brand = el('div', 'cx-brand')
  brand.append(el('span', 'cx-mark'), el('span', '', 'Contextia settings'))
  app.append(brand)

  // Mode
  const modeField = el('div', 'cx-field')
  modeField.append(el('label', '', 'Mode'))
  const sel = document.createElement('select')
  ;(Object.keys(MODE_LABELS) as Mode[]).forEach((m) => {
    const o = document.createElement('option')
    o.value = m
    o.textContent = MODE_LABELS[m]
    if (m === settings.mode) o.selected = true
    sel.append(o)
  })
  sel.addEventListener('change', () => void persist({ mode: sel.value as Mode }))
  modeField.append(sel)
  app.append(modeField)

  // Detectors
  const detSection = el('div', 'cx-section')
  detSection.append(el('h2', '', 'Detectors'))
  const enabled = effectiveEnabled(settings)
  for (const d of detectors) {
    const row = el('div', 'cx-row')
    const left = el('div', 'cx-switch')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = enabled.has(d.id)
    cb.addEventListener('change', () => {
      const set = effectiveEnabled(settings)
      if (cb.checked) set.add(d.id)
      else set.delete(d.id)
      void persist({ enabledDetectors: [...set] })
    })
    const lbl = el('span')
    lbl.append(el('span', `cx-sev ${d.severity}`), document.createTextNode(d.label))
    left.append(cb, lbl)
    row.append(left, el('span', 'cx-muted', d.severity))
    detSection.append(row)
  }
  app.append(detSection)

  // Allowlists
  const allowSection = el('div', 'cx-section')
  allowSection.append(el('h2', '', 'Allowlist'))
  const valField = el('div', 'cx-field')
  valField.append(el('label', '', 'Allowed values (one per line)'))
  const valTa = document.createElement('textarea')
  valTa.value = settings.allowlist.values.join('\n')
  valField.append(valTa)
  const patField = el('div', 'cx-field')
  patField.append(el('label', '', 'Allowed patterns — regex (one per line)'))
  const patTa = document.createElement('textarea')
  patTa.value = settings.allowlist.patterns.join('\n')
  patField.append(patTa)
  const save = el('button', 'cx-primary', 'Save allowlist') as HTMLButtonElement
  save.addEventListener('click', () =>
    void persist({
      allowlist: {
        values: lines(valTa.value),
        patterns: lines(patTa.value),
      },
    }),
  )
  allowSection.append(valField, patField, save)
  app.append(allowSection)

  // Log
  const logSection = el('div', 'cx-section')
  logSection.append(el('h2', '', `Detections log (${log.length})`))
  const list = el('div', 'cx-log')
  if (log.length === 0) list.append(el('div', 'cx-muted', 'Nothing logged yet.'))
  for (const e of log.slice(0, 50)) {
    const row = el('div', 'cx-row')
    const left = el('div')
    left.append(el('span', `cx-sev ${e.severity}`), document.createTextNode(`${e.type} · ${e.site}`))
    row.append(left, el('span', 'cx-muted', e.action))
    list.append(row)
  }
  logSection.append(list)
  const clear = el('button', '', 'Clear log & stats') as HTMLButtonElement
  clear.addEventListener('click', async () => {
    await clearAll()
    void render()
  })
  const actions = el('div', 'cx-actions')
  actions.append(clear)
  logSection.append(actions)
  app.append(logSection)
}

function lines(v: string): string[] {
  return v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

void render()
