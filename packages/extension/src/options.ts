import { detectors } from '@sbr0nch/contextia-engine'
import {
  getSettings,
  setSettings,
  getLog,
  getStats,
  clearAll,
  type Mode,
  type Settings,
} from './storage.js'
import { MARK_SVG } from './brand.js'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'warn', label: 'Warn', hint: 'Flag and let me decide' },
  { id: 'auto-redact', label: 'Auto-redact', hint: 'Redact before send' },
  { id: 'block', label: 'Block', hint: 'Stop send until resolved' },
  { id: 'off', label: 'Off', hint: 'Disable on this browser' },
]

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

function lines(v: string): string[] {
  return v.split('\n').map((s) => s.trim()).filter(Boolean)
}

let settings: Settings

async function persist(next: Partial<Settings>): Promise<void> {
  settings = { ...settings, ...next }
  await setSettings(settings)
}

function card(title: string, sub = ''): HTMLElement {
  const c = el('section', 'cx-card')
  const head = el('div', 'cx-card-head')
  head.append(el('h2', '', title))
  if (sub) head.append(el('span', 'cx-card-sub', sub))
  c.append(head)
  return c
}

function toggle(checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const wrap = el('label', 'cx-toggle')
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.checked = checked
  cb.addEventListener('change', () => onChange(cb.checked))
  wrap.append(cb, el('span', 'cx-track'))
  return wrap
}

function renderModes(app: HTMLElement): void {
  const c = card('Protection')
  const seg = el('div', 'cx-seg')
  const hint = el('div', 'cx-seg-hint')
  const paint = () => {
    for (const b of seg.children) {
      const on = (b as HTMLElement).dataset['mode'] === settings.mode
      b.classList.toggle('cx-seg-on', on)
    }
    hint.textContent = MODES.find((m) => m.id === settings.mode)?.hint ?? ''
  }
  for (const m of MODES) {
    const b = el('button', 'cx-seg-btn', m.label)
    b.dataset['mode'] = m.id
    b.addEventListener('click', async () => {
      await persist({ mode: m.id })
      paint()
    })
    seg.append(b)
  }
  c.append(seg, hint)

  const sigRow = el('div', 'cx-line')
  const sigText = el('div')
  sigText.append(
    el('div', 'cx-line-t', 'Add a “redacted by Contextia” note'),
    el('div', 'cx-line-s', 'Prepends one line to redacted messages. Off by default.'),
  )
  sigRow.append(sigText, toggle(settings.signature, (v) => void persist({ signature: v })))
  c.append(sigRow)

  app.append(c)
  paint()
}

function renderDetectors(app: HTMLElement): void {
  const enabled = effectiveEnabled(settings)
  const countEl = el('span', 'cx-card-sub')
  const c = card('Detectors')
  c.querySelector('.cx-card-head')!.append(countEl)

  const bar = el('div', 'cx-bar')
  const search = document.createElement('input')
  search.type = 'text'
  search.placeholder = 'Filter detectors…'
  search.className = 'cx-search'
  const allOn = el('button', 'cx-chip', 'All on') as HTMLButtonElement
  const allOff = el('button', 'cx-chip', 'All off') as HTMLButtonElement
  bar.append(search, allOn, allOff)
  c.append(bar)

  const list = el('div', 'cx-detlist')
  const rows: { id: string; label: string; row: HTMLElement; cb: HTMLInputElement }[] = []

  const updateCount = () => {
    countEl.textContent = `${enabled.size} of ${detectors.length} on`
  }
  const setEnabled = (id: string, on: boolean) => {
    if (on) enabled.add(id)
    else enabled.delete(id)
  }

  for (const d of detectors) {
    const row = el('div', 'cx-det')
    const left = el('div', 'cx-det-l')
    left.append(el('span', `cx-sev ${d.severity}`), el('span', 'cx-det-name', d.label), el('span', 'cx-det-sev', d.severity))
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = enabled.has(d.id)
    const t = el('label', 'cx-toggle')
    t.append(cb, el('span', 'cx-track'))
    cb.addEventListener('change', () => {
      setEnabled(d.id, cb.checked)
      void persist({ enabledDetectors: [...enabled] })
      updateCount()
    })
    row.append(left, t)
    list.append(row)
    rows.push({ id: d.id, label: d.label.toLowerCase(), row, cb })
  }

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase()
    for (const r of rows) r.row.style.display = !q || r.label.includes(q) ? '' : 'none'
  })
  const bulk = (on: boolean) => {
    for (const r of rows) {
      if (r.row.style.display === 'none') continue // only affect what's visible
      r.cb.checked = on
      setEnabled(r.id, on)
    }
    void persist({ enabledDetectors: [...enabled] })
    updateCount()
  }
  allOn.addEventListener('click', () => bulk(true))
  allOff.addEventListener('click', () => bulk(false))

  c.append(list)
  app.append(c)
  updateCount()
}

function renderAllowlists(app: HTMLElement): void {
  const c = card('Allow & redact lists')
  const grid = el('div', 'cx-two')

  const allow = el('div', 'cx-field')
  allow.append(el('label', '', 'Allow (never flag) — values'))
  const allowVal = document.createElement('textarea')
  allowVal.value = settings.allowlist.values.join('\n')
  allowVal.placeholder = 'one value per line'
  allow.append(allowVal, el('label', '', 'Allow — regex patterns'))
  const allowPat = document.createElement('textarea')
  allowPat.value = settings.allowlist.patterns.join('\n')
  allowPat.placeholder = 'one regex per line'
  allow.append(allowPat)

  const redact = el('div', 'cx-field')
  redact.append(el('label', '', 'Always redact (your data) — values'))
  const redVal = document.createElement('textarea')
  redVal.value = settings.redactlist.values.join('\n')
  redVal.placeholder = 'one value per line'
  redact.append(redVal, el('label', '', 'Always redact — regex patterns'))
  const redPat = document.createElement('textarea')
  redPat.value = settings.redactlist.patterns.join('\n')
  redPat.placeholder = 'one regex per line'
  redact.append(redPat)

  grid.append(allow, redact)
  c.append(grid)

  const save = el('button', 'cx-primary', 'Save lists') as HTMLButtonElement
  const saved = el('span', 'cx-saved', 'Saved')
  save.addEventListener('click', async () => {
    await persist({
      allowlist: { values: lines(allowVal.value), patterns: lines(allowPat.value) },
      redactlist: { values: lines(redVal.value), patterns: lines(redPat.value) },
    })
    saved.classList.add('cx-saved-on')
    setTimeout(() => saved.classList.remove('cx-saved-on'), 1400)
  })
  const actions = el('div', 'cx-actions')
  actions.append(save, saved)
  c.append(actions)
  app.append(c)
}

async function renderActivity(app: HTMLElement): Promise<void> {
  const [log, stats] = await Promise.all([getLog(), getStats()])
  const c = card('Activity', `${stats.caught} caught · ${stats.allowed} allowed · ${stats.leaked} leaked`)

  const list = el('div', 'cx-log')
  if (log.length === 0) list.append(el('div', 'cx-muted', 'Nothing logged yet.'))
  for (const e of log.slice(0, 50)) {
    const row = el('div', 'cx-row')
    const left = el('div')
    left.append(el('span', `cx-sev ${e.severity}`), document.createTextNode(`${e.type} · ${e.site}`))
    row.append(left, el('span', 'cx-muted', e.action))
    list.append(row)
  }
  c.append(list)

  const clear = el('button', '', 'Clear log & stats') as HTMLButtonElement
  clear.addEventListener('click', async () => {
    await clearAll()
    void render()
  })
  const actions = el('div', 'cx-actions')
  actions.append(clear)
  c.append(actions)
  app.append(c)
}

async function render(): Promise<void> {
  settings = await getSettings()
  const app = document.getElementById('app')
  if (!app) return
  app.replaceChildren()

  const brand = el('div', 'cx-brand')
  const mark = el('span', 'cx-mark')
  mark.innerHTML = MARK_SVG
  brand.append(mark, el('span', '', 'Contextia'))
  app.append(brand)

  renderModes(app)
  renderDetectors(app)
  renderAllowlists(app)
  await renderActivity(app)
}

void render()
