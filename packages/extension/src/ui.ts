import type { Finding } from '@contextia/engine'
import type { Composer } from './composer.js'
import type { Mode } from './storage.js'

export interface UIHandlers {
  onRedactAll: () => void
  onRedactOne: (finding: Finding) => void
  onAllowOnce: (finding: Finding) => void
  onAllowPattern: (finding: Finding) => void
}

// Brand palette (contextia.dev): green identity; red/amber strictly for severity.
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
.cx-indicator.cx-blocked { color: ${DANGER}; border-color: ${DANGER}; background:#241416; }
.cx-dot { width: 8px; height: 8px; border-radius: 50%; background: ${BRAND}; box-shadow: 0 0 8px ${BRAND}55; }
.cx-indicator.cx-alert .cx-dot, .cx-indicator.cx-blocked .cx-dot { background: ${DANGER}; box-shadow: 0 0 8px ${DANGER}; }
.cx-count { font-variant-numeric: tabular-nums; }

.cx-popover {
  position: fixed; right: 16px; bottom: 58px; z-index: 2147483647;
  width: 330px; max-height: 50vh; overflow: auto;
  background: #1a1a1a; color: #e8e8ea; border: 1px solid #2a2a2a; border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,.55); font: 13px/1.4 ${FONT};
}
.cx-popover[hidden] { display: none; }
.cx-head { padding: 11px 13px; border-bottom: 1px solid #2a2a2a; display:flex; justify-content:space-between; align-items:center; }
.cx-title { font-weight: 700; }
.cx-redact-all { background: ${BRAND}; color: #08130d; border: 0; border-radius: 8px; padding: 6px 11px; font-weight: 700; cursor: pointer; font-size: 12px; }
.cx-redact-all:hover { background: #00b070; }
.cx-row { padding: 10px 13px; border-bottom: 1px solid #242424; }
.cx-row:last-child { border-bottom: 0; }
.cx-row-top { display:flex; align-items:center; gap:7px; justify-content:space-between; }
.cx-row-label { display:flex; align-items:center; gap:7px; min-width:0; }
.cx-row-label span.cx-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cx-preview { color:#8b90a0; font:11px/1.4 ui-monospace, monospace; margin-top:3px; }
.cx-sev { width:7px; height:7px; border-radius:50%; flex:0 0 auto; }
.cx-sev.critical { background:${DANGER}; } .cx-sev.warning { background:${WARN}; }
.cx-actions { margin-top:7px; display:flex; gap:8px; }
.cx-actions button { background:#242424; color:#c9ccd3; border:1px solid #2a2a2a; border-radius:7px; padding:4px 9px; font-size:11px; cursor:pointer; }
.cx-actions button:hover { border-color:${BRAND}; color:${BRAND}; }
.cx-mini { background:${BRAND}; color:#08130d; border:0; border-radius:6px; padding:3px 8px; font-size:11px; font-weight:700; cursor:pointer; }

.cx-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483645; }
.cx-hl { position: fixed; pointer-events: none; border-radius: 2px; border-bottom: 2px solid ${DANGER}; background: ${DANGER}22; }
.cx-hl.warning { border-bottom-color: ${WARN}; background: ${WARN}22; }
.cx-hit { position: fixed; pointer-events: auto; cursor: help; background: transparent; }

.cx-tooltip {
  position: fixed; z-index: 2147483647; max-width: 280px;
  background:#1a1a1a; color:#e8e8ea; border:1px solid #2a2a2a; border-radius:10px;
  box-shadow:0 8px 24px rgba(0,0,0,.5); padding:9px 11px; font:12px/1.4 ${FONT};
}
.cx-tooltip[hidden] { display:none; }
.cx-tt-label { display:flex; align-items:center; gap:7px; font-weight:600; }
.cx-tt-prev { color:#8b90a0; font:11px/1.4 ui-monospace, monospace; margin:5px 0 8px; }
.cx-tt-actions { display:flex; gap:7px; }

.cx-banner {
  position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%);
  z-index: 2147483647; display:flex; align-items:center; gap:12px;
  background:#241416; color:#ffd7d8; border:1px solid ${DANGER}; border-radius:10px;
  padding:10px 14px; font:600 13px/1 ${FONT}; box-shadow:0 8px 28px rgba(0,0,0,.55);
}
.cx-banner[hidden] { display:none; }
.cx-banner .cx-redact-all { padding:5px 10px; }
`

export class Hud {
  private host: HTMLElement
  private root: ShadowRoot
  private overlay!: HTMLElement
  private indicator!: HTMLElement
  private label!: HTMLElement
  private countEl!: HTMLElement
  private popover!: HTMLElement
  private tooltip!: HTMLElement
  private banner!: HTMLElement
  private open = false
  private hideTooltipTimer: ReturnType<typeof setTimeout> | undefined
  private hideBannerTimer: ReturnType<typeof setTimeout> | undefined

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
    this.label = el('span', '', 'Contextia')
    this.countEl = el('span', 'cx-count')
    this.indicator.append(el('span', 'cx-dot'), this.label, this.countEl)
    this.indicator.addEventListener('click', () => this.setOpen(!this.open))

    this.popover = el('div', 'cx-popover')
    this.popover.hidden = true
    this.tooltip = el('div', 'cx-tooltip')
    this.tooltip.hidden = true
    this.tooltip.addEventListener('mouseenter', () => this.cancelTooltipHide())
    this.tooltip.addEventListener('mouseleave', () => this.scheduleTooltipHide())
    this.banner = el('div', 'cx-banner')
    this.banner.hidden = true

    this.root.append(this.overlay, this.indicator, this.popover, this.tooltip, this.banner)
    document.body.appendChild(this.host)
  }

  setState(findings: Finding[], composer: Composer | null, mode: Mode): void {
    const has = findings.length > 0
    const blocked = mode === 'block' && has
    this.indicator.classList.toggle('cx-alert', has && !blocked)
    this.indicator.classList.toggle('cx-blocked', blocked)
    this.label.textContent = blocked ? '🔒 Blocked' : 'Contextia'
    this.countEl.textContent = has ? String(findings.length) : ''
    this.renderPopover(findings)
    this.drawHighlights(findings, composer)
    if (!has) {
      this.setOpen(false)
      this.hideTooltip()
      this.hideBanner()
    }
  }

  /** Visible confirmation that a send was just blocked. */
  flashBlocked(count: number): void {
    this.banner.replaceChildren()
    this.banner.append(
      el('span', '', `Send blocked — ${count} secret${count > 1 ? 's' : ''} to resolve`),
    )
    const btn = el('button', 'cx-redact-all', 'Redact all') as HTMLButtonElement
    btn.addEventListener('click', () => {
      this.handlers.onRedactAll()
      this.hideBanner()
    })
    this.banner.append(btn)
    this.banner.hidden = false
    if (this.hideBannerTimer) clearTimeout(this.hideBannerTimer)
    this.hideBannerTimer = setTimeout(() => this.hideBanner(), 4000)
  }

  private hideBanner(): void {
    this.banner.hidden = true
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
      const top = el('div', 'cx-row-top')
      const lbl = el('div', 'cx-row-label')
      lbl.append(el('span', `cx-sev ${f.severity}`), el('span', 'cx-name', f.label))
      const redact = el('button', 'cx-mini', 'Redact') as HTMLButtonElement
      redact.addEventListener('click', () => this.handlers.onRedactOne(f))
      top.append(lbl, redact)
      const preview = el('div', 'cx-preview', mask(f.match))
      const actions = el('div', 'cx-actions')
      const once = el('button', '', 'Allow once') as HTMLButtonElement
      once.addEventListener('click', () => this.handlers.onAllowOnce(f))
      const pat = el('button', '', 'Allow pattern') as HTMLButtonElement
      pat.addEventListener('click', () => this.handlers.onAllowPattern(f))
      actions.append(once, pat)
      row.append(top, preview, actions)
      this.popover.append(row)
    }
  }

  private drawHighlights(findings: Finding[], composer: Composer | null): void {
    this.overlay.replaceChildren()
    if (!composer || composer.isTextarea) return // textarea substrings aren't measurable
    for (const f of findings) {
      const range = rangeForOffsets(composer.el, f.start, f.end)
      if (!range) continue
      for (const rect of range.getClientRects()) {
        const hl = el('div', `cx-hl ${f.severity}`)
        place(hl, rect.left, rect.top, rect.width, rect.height)
        this.overlay.appendChild(hl)
        // thin hover strip at the baseline so the tooltip never blocks typing
        const hit = el('div', 'cx-hit')
        place(hit, rect.left, rect.bottom - 6, rect.width, 8)
        hit.addEventListener('mouseenter', () => this.showTooltip(f, rect))
        hit.addEventListener('mouseleave', () => this.scheduleTooltipHide())
        this.overlay.appendChild(hit)
      }
    }
  }

  private showTooltip(f: Finding, rect: DOMRect): void {
    this.cancelTooltipHide()
    this.tooltip.replaceChildren()
    const head = el('div', 'cx-tt-label')
    head.append(el('span', `cx-sev ${f.severity}`), el('span', '', `${f.label} (${f.severity})`))
    const prev = el('div', 'cx-tt-prev', mask(f.match))
    const actions = el('div', 'cx-tt-actions')
    const redact = el('button', 'cx-mini', 'Redact') as HTMLButtonElement
    redact.addEventListener('click', () => {
      this.handlers.onRedactOne(f)
      this.hideTooltip()
    })
    const allow = el('button', '', 'Allow') as HTMLButtonElement
    allow.className = ''
    allow.textContent = 'Allow once'
    allow.style.cssText = 'background:#242424;color:#c9ccd3;border:1px solid #2a2a2a;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer'
    allow.addEventListener('click', () => {
      this.handlers.onAllowOnce(f)
      this.hideTooltip()
    })
    actions.append(redact, allow)
    this.tooltip.append(head, prev, actions)
    this.tooltip.hidden = false
    // position above the span, clamped to viewport
    const top = Math.max(8, rect.top - 86)
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 290)
    this.tooltip.style.top = `${top}px`
    this.tooltip.style.left = `${left}px`
  }

  private scheduleTooltipHide(): void {
    this.cancelTooltipHide()
    this.hideTooltipTimer = setTimeout(() => this.hideTooltip(), 200)
  }
  private cancelTooltipHide(): void {
    if (this.hideTooltipTimer) clearTimeout(this.hideTooltipTimer)
  }
  private hideTooltip(): void {
    this.cancelTooltipHide()
    this.tooltip.hidden = true
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

function place(node: HTMLElement, left: number, top: number, width: number, height: number): void {
  node.style.left = `${left}px`
  node.style.top = `${top}px`
  node.style.width = `${width}px`
  node.style.height = `${height}px`
}

/** A safe preview of the matched value (never the whole secret in clear UI). */
function mask(value: string): string {
  if (value.length <= 10) return '•'.repeat(Math.max(4, value.length))
  return `${value.slice(0, 4)}…${value.slice(-4)} · ${value.length} chars`
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
