import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // The pages and the service worker run in Chrome: the end-to-end tests cover them.
      exclude: ['src/popup.ts', 'src/background.ts', 'src/options.ts'],
      thresholds: { lines: 80 },
    },
  },
})
