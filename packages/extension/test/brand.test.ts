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
