import { defineConfig } from 'vitest/config'

// Unit suite + coverage gate. The corpus/roster acceptance gate runs separately
// (vitest.acceptance.config.ts) so a missing detector fails acceptance without
// dragging down the unit run.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 100,
      },
    },
  },
})
