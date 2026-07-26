// Locating and reading/writing the chat composer across the supported sites.
// ChatGPT and Claude both use a contenteditable editor today; we keep a textarea
// path too for resilience to DOM changes.

export interface Composer {
  readonly el: HTMLElement
  readonly isTextarea: boolean
  getText(): string
  setText(text: string): void
}

const SELECTORS = [
  '#prompt-textarea', // ChatGPT
  'div.ProseMirror[contenteditable="true"]', // Claude / ProseMirror
  'div.ql-editor[contenteditable="true"]', // Gemini / AI Studio (Quill)
  'main textarea', // Perplexity, DeepSeek, and others
  'textarea[enterkeyhint], textarea[data-id]',
  'div[contenteditable="true"]',
]

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

function isEditable(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  return el.isContentEditable
}

// The focused element may live inside one or more shadow roots; `activeElement`
// only ever points one level deep, so walk down until we reach the real target.
function deepActiveElement(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement as HTMLElement
  }
  return el
}

// Some sites mount the composer inside a shadow root, where a top-level
// querySelector can't see it. Do a bounded breadth-first walk through open
// shadow roots and return the first visible match for any selector.
function queryDeep(root: ParentNode, selectors: readonly string[]): HTMLElement | null {
  const queue: ParentNode[] = [root]
  let visited = 0
  while (queue.length && visited < 2000) {
    const node = queue.shift()!
    for (const sel of selectors) {
      const el = node.querySelector<HTMLElement>(sel)
      if (el && isVisible(el)) return el
    }
    const hosts = node.querySelectorAll<HTMLElement>('*')
    for (const host of hosts) {
      visited++
      if (host.shadowRoot) queue.push(host.shadowRoot)
    }
  }
  return null
}

export function findComposer(root: ParentNode = document): Composer | null {
  for (const sel of SELECTORS) {
    const el = root.querySelector<HTMLElement>(sel)
    if (el && isVisible(el)) return makeComposer(el)
  }
  const active = deepActiveElement()
  if (isEditable(active) && isVisible(active)) return makeComposer(active)
  const deep = queryDeep(root, SELECTORS)
  if (deep) return makeComposer(deep)
  return null
}

export function makeComposer(el: HTMLElement): Composer {
  const isTextarea = el instanceof HTMLTextAreaElement
  return {
    el,
    isTextarea,
    getText: () => (isTextarea ? (el as HTMLTextAreaElement).value : (el.textContent ?? '')),
    setText: (text: string) => (isTextarea ? setTextarea(el as HTMLTextAreaElement, text) : setEditable(el, text)),
  }
}

// React-controlled textareas ignore a plain `.value =`; go through the native
// setter and dispatch an input event so the framework picks up the change.
function setTextarea(el: HTMLTextAreaElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (setter) setter.call(el, text)
  else el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

// contenteditable editors (ProseMirror etc.) track their own state; replacing
// the whole selection via execCommand fires the input events they listen for.
function setEditable(el: HTMLElement, text: string): void {
  el.focus()
  const selection = window.getSelection()
  if (!selection) {
    el.textContent = text
    el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    return
  }
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
  const ok = document.execCommand('insertText', false, text)
  if (!ok) {
    el.textContent = text
    el.dispatchEvent(new InputEvent('input', { bubbles: true }))
  }
}
