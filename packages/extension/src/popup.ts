import { getSettings, setSettings, getStats, getLog, clearAll, type Mode } from './storage.js'
import { api } from './api.js'
import { MARK_SVG } from './brand.js'

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

function sevDot(sev: string): HTMLElement {
  return el('span', `cx-sev ${sev}`)
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

const SPINNER = `<svg viewBox="0 0 120 120" width="34" height="34"><g fill="none" stroke="#00D084" stroke-width="11" stroke-linecap="round"><path d="M40 30 C24 30 24 42 24 60 C24 78 24 90 40 90"/><path d="M80 30 C96 30 96 42 96 60 C96 78 96 90 80 90"/></g><circle cx="50" cy="60" r="7" fill="#00D084"><animate attributeName="opacity" values="1;.2;1" dur="1.1s" repeatCount="indefinite"/></circle><circle cx="70" cy="60" r="7" fill="#00D084"><animate attributeName="opacity" values="1;.2;1" dur="1.1s" begin="0.55s" repeatCount="indefinite"/></circle></svg>`

async function render(): Promise<void> {
  const app = document.getElementById('app')
  if (app && !app.hasChildNodes()) {
    app.innerHTML = `<div style="display:flex;justify-content:center;padding:44px 0">${SPINNER}</div>`
  }
  const [settings, stats, log] = await Promise.all([getSettings(), getStats(), getLog()])
  if (!app) return
  app.replaceChildren()

  const brand = el('div', 'cx-brand')
  const mark = el('span', 'cx-mark')
  mark.innerHTML = MARK_SVG
  brand.append(mark, el('span', '', 'Contextia'))

  const headline = el('div', 'cx-headline')
  const num = document.createElement('b')
  num.textContent = String(stats.caught)
  headline.append(num, document.createTextNode(` secrets caught · ${stats.allowed} allowed · ${stats.leaked} leaked`))

  const field = el('div', 'cx-field')
  field.append(el('label', '', 'Mode'))
  const sel = document.createElement('select')
  ;(Object.keys(MODE_LABELS) as Mode[]).forEach((m) => {
    const o = document.createElement('option')
    o.value = m
    o.textContent = MODE_LABELS[m]
    if (m === settings.mode) o.selected = true
    sel.append(o)
  })
  sel.addEventListener('change', () => void setSettings({ ...settings, mode: sel.value as Mode }))
  field.append(sel)

  const section = el('div', 'cx-section')
  section.append(el('h2', '', 'Recent'))
  const list = el('div', 'cx-log')
  if (log.length === 0) list.append(el('div', 'cx-muted', 'Nothing flagged yet.'))
  for (const e of log.slice(0, 6)) {
    const row = el('div', 'cx-row')
    const left = el('div')
    left.append(sevDot(e.severity), document.createTextNode(e.type))
    row.append(left, el('span', 'cx-muted', `${e.action} · ${timeAgo(e.ts)}`))
    list.append(row)
  }
  section.append(list)

  const actions = el('div', 'cx-actions')
  const opts = el('button', '', 'Settings') as HTMLButtonElement
  opts.addEventListener('click', () => api.runtime.openOptionsPage())
  const clear = el('button', '', 'Clear data') as HTMLButtonElement
  clear.addEventListener('click', async () => {
    await clearAll()
    void render()
  })
  actions.append(opts, clear)

  app.append(brand, headline, field, section, actions)
}

void render()
