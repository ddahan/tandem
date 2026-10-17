import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests without the Nuxt runtime: code under test imports what it uses explicitly.
export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
})
