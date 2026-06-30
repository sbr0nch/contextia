import { defineConfig } from 'vitest/config'

// Unit tests for the testable, non-DOM extension logic (storage invariants).
// UI behaviour is covered separately by the Chromium e2e in e2e/.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
  },
})
