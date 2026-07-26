// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { markNode, svgNode, MARK_SVG } from '../src/brand.js'

describe('svgNode', () => {
  it('builds a real SVG element rather than writing markup into the DOM', () => {
    const node = markNode()
    expect(node.tagName.toLowerCase()).toBe('svg')
    expect(node.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('returns a fresh node each call, so two surfaces can mount the mark', () => {
    expect(markNode()).not.toBe(markNode())
  })

  it('does not carry script through', () => {
    const node = svgNode('<svg><script>window.x=1</script><circle r="1"/></svg>')
    // Parsed as image/svg+xml and appended as a node: nothing executes.
    expect((globalThis as Record<string, unknown>)['x']).toBeUndefined()
    expect(node.querySelector('circle')).not.toBeNull()
  })

  it('keeps the mark markup a constant with nothing interpolated', () => {
    expect(MARK_SVG).not.toContain('${')
  })
})

describe('svgNode namespace', () => {
  // The regression this exists for: an SVG parsed as XML without an xmlns lands
  // in no namespace. Size, children and querySelector all still behave, so the
  // only symptom is that nothing is painted. Assert the namespace directly.
  it('puts the mark in the SVG namespace, or it will not paint', () => {
    const node = markNode()
    expect(node.namespaceURI).toBe('http://www.w3.org/2000/svg')
    for (const path of Array.from(node.querySelectorAll('path'))) {
      expect(path.namespaceURI).toBe('http://www.w3.org/2000/svg')
    }
  })

  it('adds the declaration when markup omits it', () => {
    const node = svgNode('<svg viewBox="0 0 10 10"><circle r="4"/></svg>')
    expect(node.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(node.querySelector('circle')?.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })

  it('declares the namespace in the mark markup itself', () => {
    expect(MARK_SVG).toContain('xmlns="http://www.w3.org/2000/svg"')
  })
})
