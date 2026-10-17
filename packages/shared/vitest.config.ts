import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // The entry point is covered by the end-to-end tests.
      exclude: ['src/main.ts'],
      thresholds: { lines: 80 },
    },
  },
})
