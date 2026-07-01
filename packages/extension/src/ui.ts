import type { Finding } from '@sbr0nch/contextia-engine'
import type { Composer } from './composer.js'
import type { Mode } from './storage.js'
import { mask } from './mask.js'
import { MARK_SVG } from './brand.js'

export interface UIHandlers {
  onRedactAll: () => void
  onRedactOne: (finding: Finding) => void
  onAllowOnce: (finding: Finding) => void
  onAllowAll: (findings: Finding[]) => void
  onAllowPattern: (finding: Finding) => void
}

// Brand palette (contextia.dev): green identity; red/amber strictly for severity.
const BRAND = '#00D084'
const DANGER = '#ff5d5f'
const WARN = '#f5a623'
const FONT = `'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif`
const EASE = 'cubic-bezier(.2,.8,.2,1)'

const STYLE = `
:host { all: initial; }

/* frosted-glass surface shared by the floating panels */
.glass {
  background: rgba(18,18,20,.66);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid rgba(255,255,255,.09);
  box-shadow: 0 8px 30px rgba(0,0,0,.42);
}

.cx-indicator {
  position: fixed; right: 14px; bottom: 14px; z-index: 2147483646;
  display: flex; align-items: center; gap: 6px;
  font: 600 11px/1 ${FONT}; letter-spacing: .02em;
  padding: 6px 9px; border-radius: 999px; cursor: pointer; user-select: none;
  color: #c4c7cf; transition: color .16s ${EASE}, border-color .16s ${EASE}, transform .12s ${EASE};
}
.cx-indicator:hover { transform: translateY(-1px); }
.cx-indicator:active { transform: translateY(0); }
.cx-indicator.cx-alert { color: ${DANGER}; border-color: rgba(255,93,95,.55); }
.cx-indicator.cx-blocked { color: ${DANGER}; border-color: rgba(255,93,95,.7); background: rgba(40,20,21,.66); }
.cx-mark { width: 15px; height: 15px; display: inline-flex; color: ${BRAND}; filter: drop-shadow(0 0 4px ${BRAND}66); transition: color .16s ${EASE}, filter .16s ${EASE}; }
.cx-mark svg { width: 100%; height: 100%; display: block; }
.cx-indicator.cx-alert .cx-mark, .cx-indicator.cx-blocked .cx-mark { color: ${DANGER}; filter: drop-shadow(0 0 4px ${DANGER}66); }
.cx-count { font-variant-numeric: tabular-nums; opacity: .9; }

/* clean-state card shown when the composer has no findings */
.cx-empty { padding: 15px 14px; display: flex; align-items: center; gap: 11px; }
.cx-emark { width: 22px; height: 22px; flex: 0 0 auto; display: inline-flex; color: ${BRAND}; }
.cx-emark svg { width: 100%; height: 100%; }
.cx-empty-t { font-weight: 600; color: #e9eaee; font-size: 12px; }
.cx-empty-s { font-size: 11px; color: #7f8492; margin-top: 2px; }

/* animated open/close for the floating panels */
.cx-pop, .cx-tip, .cx-banner {
  opacity: 0; pointer-events: none;
  transition: opacity .17s ${EASE}, transform .17s ${EASE};
}
.cx-pop.cx-on, .cx-tip.cx-on, .cx-banner.cx-on { opacity: 1; pointer-events: auto; }

.cx-pop {
  position: fixed; right: 14px; bottom: 52px; z-index: 2147483647;
  width: 300px; max-height: 52vh; overflow: auto; color: #e9eaee;
  border-radius: 14px; font: 12px/1.45 ${FONT};
  transform-origin: bottom right; transform: translateY(8px) scale(.96);
}
.cx-pop.cx-on { transform: none; }
.cx-head { padding: 12px 13px; display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,.06); }
.cx-title { font-weight: 700; font-size: 12px; }
.cx-go { background: ${BRAND}; color: #08130d; border: 0; border-radius: 8px; padding: 5px 10px; font-weight: 700; cursor: pointer; font-size: 11px; transition: background .14s ${EASE}; }
.cx-go:hover { background: #19e08f; }
.cx-row { padding: 11px 13px; }
.cx-row + .cx-row { border-top: 1px solid rgba(255,255,255,.05); }
.cx-row-top { display:flex; align-items:center; gap:8px; justify-content:space-between; }
.cx-row-label { display:flex; align-items:center; gap:7px; min-width:0; }
.cx-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cx-prev { color:#7f8492; font:11px/1.4 ui-monospace, monospace; margin-top:4px; }
.cx-sev { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
.cx-sev.critical { background:${DANGER}; } .cx-sev.warning { background:${WARN}; }
.cx-row-act { margin-top:8px; display:flex; gap:7px; }
.cx-ghost { background: rgba(255,255,255,.05); color:#c4c7cf; border:1px solid rgba(255,255,255,.08); border-radius:7px; padding:4px 9px; font-size:11px; cursor:pointer; transition: all .14s ${EASE}; }
.cx-ghost:hover { border-color:${BRAND}; color:${BRAND}; }
.cx-mini { background:${BRAND}; color:#08130d; border:0; border-radius:7px; padding:4px 9px; font-size:11px; font-weight:700; cursor:pointer; }

.cx-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483645; }
.cx-hl { position: fixed; pointer-events: none; border-radius: 3px; border-bottom: 2px solid ${DANGER}; background: ${DANGER}1f; transition: background .12s ${EASE}; }
.cx-hl.warning { border-bottom-color: ${WARN}; background: ${WARN}1f; }
.cx-hit { position: fixed; pointer-events: auto; cursor: help; background: transparent; }

.cx-tip {
  position: fixed; z-index: 2147483647; max-width: 250px; color:#e9eaee;
  border-radius: 11px; padding: 9px 11px; font: 11px/1.45 ${FONT};
  transform: scale(.97);
}
.cx-tip.cx-on { transform: none; }
.cx-tip-label { display:flex; align-items:center; gap:7px; font-weight:600; }
.cx-tip-prev { color:#7f8492; font:11px/1.4 ui-monospace, monospace; margin:6px 0 6px; }
.cx-tip-why { color:#9aa0ad; font-size:11px; line-height:1.45; margin:0 0 9px; }
.cx-tip-act { display:flex; gap:7px; }

.cx-banner {
  position: fixed; left: 50%; bottom: 58px; z-index: 2147483647;
  display:flex; align-items:center; gap:12px; color:#ffd9da;
  background: rgba(40,20,21,.72); border:1px solid rgba(255,93,95,.6); border-radius:12px;
  padding:9px 13px; font:600 12px/1 ${FONT};
  -webkit-backdrop-filter: blur(16px) saturate(150%); backdrop-filter: blur(16px) saturate(150%);
  box-shadow: 0 10px 32px rgba(0,0,0,.5);
  transform: translateX(-50%) translateY(8px);
}
.cx-banner.cx-on { transform: translateX(-50%); }
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
  private tipTimer: ReturnType<typeof setTimeout> | undefined
  private bannerTimer: ReturnType<typeof setTimeout> | undefined

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
    this.indicator = el('div', 'cx-indicator glass')
    const mark = el('span', 'cx-mark')
    mark.innerHTML = MARK_SVG
    this.label = el('span', '', 'Contextia')
    this.countEl = el('span', 'cx-count')
    this.indicator.append(mark, this.label, this.countEl)
    this.indicator.addEventListener('click', () => this.setOpen(!this.open))

    this.popover = el('div', 'cx-pop glass')
    this.tooltip = el('div', 'cx-tip glass')
    this.tooltip.addEventListener('mouseenter', () => this.cancelTip())
    this.tooltip.addEventListener('mouseleave', () => this.scheduleTipHide())
    this.banner = el('div', 'cx-banner')

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
      this.hideTip()
      this.hideBanner()
    }
  }

  flashBlocked(count: number): void {
    this.banner.replaceChildren(el('span', '', `Send blocked — ${count} secret${count > 1 ? 's' : ''} to resolve`))
    const btn = el('button', 'cx-go', 'Redact all') as HTMLButtonElement
    btn.addEventListener('click', () => {
      this.handlers.onRedactAll()
      this.hideBanner()
    })
    this.banner.append(btn)
    this.banner.classList.add('cx-on')
    if (this.bannerTimer) clearTimeout(this.bannerTimer)
    this.bannerTimer = setTimeout(() => this.hideBanner(), 4200)
  }
  private hideBanner(): void {
    this.banner.classList.remove('cx-on')
  }

  private setOpen(open: boolean): void {
    this.open = open
    this.popover.classList.toggle('cx-on', open)
  }

  private renderPopover(findings: Finding[]): void {
    this.popover.replaceChildren()
    if (findings.length === 0) {
      const wrap = el('div', 'cx-empty')
      const mk = el('span', 'cx-emark')
      mk.innerHTML = MARK_SVG
      const txt = el('div')
      txt.append(el('div', 'cx-empty-t', 'No secrets detected'), el('div', 'cx-empty-s', 'Contextia is watching this message.'))
      wrap.append(mk, txt)
      this.popover.append(wrap)
      return
    }
    const head = el('div', 'cx-head')
    head.append(el('span', 'cx-title', `${findings.length} secret${findings.length > 1 ? 's' : ''} detected`))
    const allowAll = el('button', 'cx-ghost', 'Allow all') as HTMLButtonElement
    allowAll.addEventListener('click', () => this.handlers.onAllowAll(findings))
    const go = el('button', 'cx-go', 'Redact all') as HTMLButtonElement
    go.addEventListener('click', () => this.handlers.onRedactAll())
    head.append(allowAll, go)
    this.popover.append(head)

    for (const f of findings) {
      const row = el('div', 'cx-row')
      const top = el('div', 'cx-row-top')
      const lbl = el('div', 'cx-row-label')
      lbl.append(el('span', `cx-sev ${f.severity}`), el('span', 'cx-name', f.label))
      const redact = el('button', 'cx-mini', 'Redact') as HTMLButtonElement
      redact.addEventListener('click', () => this.handlers.onRedactOne(f))
      top.append(lbl, redact)
      const act = el('div', 'cx-row-act')
      const once = el('button', 'cx-ghost', 'Allow once') as HTMLButtonElement
      once.addEventListener('click', () => this.handlers.onAllowOnce(f))
      const pat = el('button', 'cx-ghost', 'Allow pattern') as HTMLButtonElement
      pat.addEventListener('click', () => this.handlers.onAllowPattern(f))
      act.append(once, pat)
      row.append(top, el('div', 'cx-prev', mask(f.match)), act)
      this.popover.append(row)
    }
  }

  private drawHighlights(findings: Finding[], composer: Composer | null): void {
    this.overlay.replaceChildren()
    this.scheduleTipHide() // a redraw shouldn't leave a stale tooltip pinned
    if (!composer || composer.isTextarea) return
    for (const f of findings) {
      const range = rangeForOffsets(composer.el, f.start, f.end)
      if (!range) continue
      for (const rect of range.getClientRects()) {
        const hl = el('div', `cx-hl ${f.severity}`)
        place(hl, rect.left, rect.top, rect.width, rect.height)
        this.overlay.appendChild(hl)
        const hit = el('div', 'cx-hit')
        place(hit, rect.left, rect.bottom - 6, rect.width, 9)
        hit.addEventListener('mouseenter', () => this.showTip(f, rect))
        hit.addEventListener('mouseleave', () => this.scheduleTipHide())
        this.overlay.appendChild(hit)
      }
    }
  }

  private showTip(f: Finding, rect: DOMRect): void {
    this.cancelTip()
    this.tooltip.replaceChildren()
    const head = el('div', 'cx-tip-label')
    head.append(el('span', `cx-sev ${f.severity}`), el('span', '', `${f.label} · ${f.severity}`))
    const act = el('div', 'cx-tip-act')
    const redact = el('button', 'cx-mini', 'Redact') as HTMLButtonElement
    redact.addEventListener('click', () => {
      this.handlers.onRedactOne(f)
      this.hideTip()
    })
    const allow = el('button', 'cx-ghost', 'Allow once') as HTMLButtonElement
    allow.addEventListener('click', () => {
      this.handlers.onAllowOnce(f)
      this.hideTip()
    })
    act.append(redact, allow)
    this.tooltip.append(head, el('div', 'cx-tip-prev', mask(f.match)), el('div', 'cx-tip-why', f.rationale), act)

    const top = Math.max(8, rect.top - 92)
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 262)
    this.tooltip.style.top = `${top}px`
    this.tooltip.style.left = `${left}px`
    this.tooltip.classList.add('cx-on')
  }
  private scheduleTipHide(): void {
    this.cancelTip()
    this.tipTimer = setTimeout(() => this.hideTip(), 220)
  }
  private cancelTip(): void {
    if (this.tipTimer) clearTimeout(this.tipTimer)
  }
  private hideTip(): void {
    this.cancelTip()
    this.tooltip.classList.remove('cx-on')
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
