// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { findComposer, makeComposer } from '../src/composer.js'

// happy-dom reports 0×0 rects; treat every attached element as visible so the
// tests exercise the location logic rather than layout.
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0, toJSON() {} } as DOMRect
  }
  // happy-dom has no execCommand; return false so setText uses its textContent fallback.
  ;(document as unknown as { execCommand: () => boolean }).execCommand = () => false
  document.body.innerHTML = ''
})

describe('findComposer', () => {
  it('finds a textarea by selector and round-trips its text', () => {
    document.body.innerHTML = '<main><textarea id="prompt-textarea"></textarea></main>'
    const c = findComposer()
    expect(c).not.toBeNull()
    expect(c!.isTextarea).toBe(true)
    c!.setText('hello')
    expect(c!.getText()).toBe('hello')
  })

  it('finds a contenteditable composer', () => {
    document.body.innerHTML = '<div class="ProseMirror" contenteditable="true"></div>'
    const c = findComposer()
    expect(c).not.toBeNull()
    expect(c!.isTextarea).toBe(false)
  })

  it('falls back to the focused editable element when no selector matches', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    document.body.appendChild(div)
    div.focus()
    const c = findComposer()
    expect(c).not.toBeNull()
    expect(c!.el).toBe(div)
  })

  it('locates a composer mounted inside an open shadow root', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<textarea id="prompt-textarea"></textarea>'
    const c = findComposer()
    expect(c).not.toBeNull()
    expect(c!.isTextarea).toBe(true)
  })

  it('returns null when there is no composer', () => {
    document.body.innerHTML = '<div><p>no editor here</p></div>'
    expect(findComposer()).toBeNull()
  })
})

describe('makeComposer', () => {
  it('reads and writes contenteditable text', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    document.body.appendChild(div)
    const c = makeComposer(div)
    c.setText('abc')
    expect(c.getText()).toBe('abc')
  })
})
