import { describe, it, expect } from 'vitest'
import * as engine from '../src/index.js'

// Exercises the public barrel so the entry point everyone imports is covered.
describe('public API surface', () => {
  it('exports the documented runtime members', () => {
    expect(typeof engine.detect).toBe('function')
    expect(typeof engine.redact).toBe('function')
    expect(Array.isArray(engine.detectors)).toBe(true)
    expect(engine.detectorsById.get('private_key')).toBeDefined()
  })
})
