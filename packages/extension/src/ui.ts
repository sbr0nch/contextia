import type { Finding } from '@contextia/engine'
import type { Composer } from './composer.js'
import type { Mode } from './storage.js'

export interface UIHandlers {
  onRedactAll: () => void
  onAllowOnce: (finding: Finding) => void
  onAllowPattern: (finding: Finding) => void
}

// Brand palette (from contextia.dev): green accent on near-black. Red/amber are
// reserved strictly for finding severity — danger should never read as "go".
const BRAND = '#00D084'
const DANGER = '#ff4d4f'
const WARN = '#f5a623'
const FONT = `'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif`

const STYLE = `
:host { all: initial; }
.cx-indicator {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  display: flex; align-items: center; gap: 7px;
  font: 600 12px/1 ${FONT}; letter-spacing: .02em;
  padding: 8px 11px; border-radius: 8px; cursor: pointer; user-select: none;
  background: #1a1a1a; color: #b8bbc2; border: 1px solid #2a2a2a;
  box-shadow: 0 4px 16px rgba(0,0,0,.45); transition: color .12s, border-color .12s;
}
.cx-indicator.cx-alert { color: ${DANGER}; border-color: ${DANGER}; }
.cx-dot { width: 8px; height: 8px; border-radius: 50%; background: ${BRAND}; box-shadow: 0 0 8px ${BRAND}55; }
.cx-indicator.cx-alert .cx-dot { background: ${DANGER}; box-shadow: 0 0 8px ${DANGER}; }
.cx-count { font-variant-numeric: tabular-nums; }
.cx-popover {
  position: fixed; right: 16px; bottom: 58px; z-index: 2147483647;
  width: 320px; max-height: 50vh; overflow: auto;
  background: #1a1a1a; color: #e8e8ea; border: 1px solid #2a2a2a; border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,.55); font: 13px/1.4 ${FONT};
}
.cx-popover[hidden] { display: none; }
.cx-head { padding: 11px 13px; border-bottom: 1px solid #2a2a2a; display:flex; justify-content:space-between; align-items:center; }
.cx-title { font-weight: 700; }
.cx-redact-all {
  background: ${BRAND}; color: #08130d; border: 0; border-radius: 8px;
  padding: 6px 11px; font-weight: 700; cursor: pointer; font-size: 12px;
}
.cx-redact-all:hover { background: #00b070; }
.cx-row { padding: 10px 13px; border-bottom: 1px solid #242424; }
.cx-row:last-child { border-bottom: 0; }
.cx-row-label { display:flex; align-items:center; gap:7px; }
.cx-sev { width:7px; height:7px; border-radius:50%; }
.cx-sev.critical { background:${DANGER}; } .cx-sev.warning { background:${WARN}; }
.cx-actions { margin-top:7px; display:flex; gap:8px; }
.cx-actions button {
  background:#242424; color:#c9ccd3; border:1px solid #2a2a2a; border-radius:7px;
  padding:4px 9px; font-size:11px; cursor:pointer;
}
.cx-actions button:hover { border-color:${BRAND}; color:${BRAND}; }
.cx-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483645; }
.cx-underline { position: fixed; border-bottom: 2px solid ${DANGER}; pointer-events: none; }
.cx-underline.warning { border-bottom-color: ${WARN}; }
`

export class Hud {
  private host: HTMLElement
  private root: ShadowRoot
  private indicator!: HTMLElement
  private countEl!: HTMLElement
  private popover!: HTMLElement
  private overlay!: HTMLElement
  private open = false

  constructor(private handlers: UIHandlers) {
    this.host = document.createElement('div')
    this.host.id = 'contextia-hud'
    this.root = this.host.attachShadow({ mode: 'open' })
  }

  mount(): void {
    const style = document.createElement('style')
    style.textContent = STYLE
    this.root.appendChild(style)

    this.overlay = el('div', 'cx-overlay')
    this.indicator = el('div', 'cx-indicator')
    const dot = el('span', 'cx-dot')
    this.countEl = el('span', 'cx-count')
    const label = el('span', '', 'Contextia')
    this.indicator.append(dot, label, this.countEl)
    this.indicator.addEventListener('click', () => this.toggle())

    this.popover = el('div', 'cx-popover')
    this.popover.hidden = true

    this.root.append(this.overlay, this.indicator, this.popover)
    document.body.appendChild(this.host)
  }

  setState(findings: Finding[], composer: Composer | null, mode: Mode): void {
    const has = findings.length > 0
    this.indicator.classList.toggle('cx-alert', has)
    this.countEl.textContent = has ? String(findings.length) : ''
    this.renderPopover(findings)
    this.drawUnderlines(findings, composer)
    if (!has) this.setOpen(false)
  }

  private toggle(): void {
    this.setOpen(!this.open)
  }
  private setOpen(open: boolean): void {
    this.open = open
    this.popover.hidden = !open
  }

  private renderPopover(findings: Finding[]): void {
    this.popover.replaceChildren()
    if (findings.length === 0) return
    const head = el('div', 'cx-head')
    head.append(el('span', 'cx-title', `${findings.length} secret${findings.length > 1 ? 's' : ''} detected`))
    const redactAll = el('button', 'cx-redact-all', 'Redact all') as HTMLButtonElement
    redactAll.addEventListener('click', () => this.handlers.onRedactAll())
    head.append(redactAll)
    this.popover.append(head)

    for (const f of findings) {
      const row = el('div', 'cx-row')
      const lbl = el('div', 'cx-row-label')
      lbl.append(el('span', `cx-sev ${f.severity}`), el('span', '', f.label))
      const actions = el('div', 'cx-actions')
      const once = el('button', '', 'Allow once') as HTMLButtonElement
      once.addEventListener('click', () => this.handlers.onAllowOnce(f))
      const pat = el('button', '', 'Allow pattern') as HTMLButtonElement
      pat.addEventListener('click', () => this.handlers.onAllowPattern(f))
      actions.append(once, pat)
      row.append(lbl, actions)
      this.popover.append(row)
    }
  }

  private drawUnderlines(findings: Finding[], composer: Composer | null): void {
    this.overlay.replaceChildren()
    if (!composer || composer.isTextarea) return // textarea substrings aren't measurable
    for (const f of findings) {
      const range = rangeForOffsets(composer.el, f.start, f.end)
      if (!range) continue
      for (const rect of range.getClientRects()) {
        const u = el('div', `cx-underline ${f.severity}`)
        u.style.left = `${rect.left}px`
        u.style.top = `${rect.bottom - 1}px`
        u.style.width = `${rect.width}px`
        this.overlay.appendChild(u)
      }
    }
  }

  destroy(): void {
    this.host.remove()
  }
}

function el(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

// Map [start,end) character offsets (into el.textContent) onto a DOM Range.
function rangeForOffsets(el: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let pos = 0
  let startNode: Node | undefined
  let startOff = 0
  let node = walker.nextNode()
  while (node) {
    const len = node.textContent?.length ?? 0
    if (!startNode && start <= pos + len) {
      startNode = node
      startOff = start - pos
    }
    if (startNode && end <= pos + len) {
      const range = document.createRange()
      range.setStart(startNode, startOff)
      range.setEnd(node, end - pos)
      return range
    }
    pos += len
    node = walker.nextNode()
  }
  return null
}
