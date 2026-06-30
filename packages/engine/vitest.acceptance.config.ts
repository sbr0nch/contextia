import { defineConfig } from 'vitest/config'

// Acceptance gate (SPEC §8): the full critical roster must exist, every detector
// must detect its positive fixtures (0 missed criticals) and reject its negatives
// (false-positive rate under threshold). No coverage here — this is about the
// corpus, not the code.
export default defineConfig({
  test: {
    include: ['acceptance/**/*.accept.ts'],
  },
})
