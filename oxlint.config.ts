// Linting for the whole repository (Oxlint), with 0 warnings allowed (`pnpm lint`).
import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'import', 'oxc', 'vue', 'vitest'],
  categories: {
    correctness: 'error',
    suspicious: 'warn',
    perf: 'warn',
  },
  rules: {
    'no-console': 'off',
    'typescript/no-explicit-any': 'error',
    'typescript/consistent-type-imports': 'error',
    'import/no-cycle': 'error',
    'unicorn/prefer-node-protocol': 'error',
    eqeqeq: 'error',
    'no-await-in-loop': 'off',
    'import/no-unassigned-import': ['warn', { allow: ['**/*.css'] }],
  },
  ignorePatterns: [
    '**/dist/**',
    '**/drizzle/**',
    '**/.nuxt/**',
    '**/.output/**',
    '**/.data/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/*.generated.ts',
  ],
})
