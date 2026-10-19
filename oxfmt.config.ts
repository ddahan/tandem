// Formatting for the whole repository (Oxfmt).
import { defineConfig } from 'oxfmt'

export default defineConfig({
  printWidth: 100,
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  ignorePatterns: [
    'pnpm-lock.yaml',
    '**/drizzle/meta/**',
    '**/.nuxt/**',
    '**/.output/**',
    '**/test/fixtures/**',
    '**/*.generated.ts',
    // The built app (./td release).
    'app/tandem/**',
  ],
  sortTailwindcss: { stylesheet: './packages/web/app/assets/css/main.css', attributes: ['ui'] },
})
