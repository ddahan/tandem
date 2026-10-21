// End-to-end tests: the production build of the web app, served by the real server on a
// temporary data folder, and the website's build (landing.spec.ts), served as Caddy does. Run
// with `./td e2e` (it builds both first).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const dataDir = mkdtempSync(join(tmpdir(), 'tandem-e2e-'))
const port = 3020
/** The website (site/), for landing.spec.ts. */
const sitePort = 3021

export default defineConfig({
  testDir: './e2e',
  // One server, one data folder: tests run one after the other.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: [
    {
      command: 'node ../server/src/main.ts',
      url: `http://localhost:${port}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: String(port),
        HOST: '127.0.0.1',
        TANDEM_DATA_DIR: dataDir,
        TANDEM_DB_PATH: join(dataDir, '..', `${dataDir.split('/').pop()}-db`, 'tandem.db'),
        TANDEM_WEB_DIR: '.output/public',
        TANDEM_SESSION_IDLE_MS: '1500',
      },
    },
    {
      command: `node scripts/serve-site.ts ${sitePort}`,
      url: `http://localhost:${sitePort}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
