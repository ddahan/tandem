// The server's entry point in Docker and in development: options from the environment (see
// compose.yaml and the Dockerfile), then startServer (server.ts).
import { resolve } from 'node:path'
import { startServer } from './server.ts'

const env = process.env
const app = await startServer({
  dataDir: resolve(env.TANDEM_DATA_DIR ?? '/data'),
  dbPath: resolve(env.TANDEM_DB_PATH ?? '/var/lib/tandem/tandem.db'),
  webDir: env.TANDEM_WEB_DIR ? resolve(env.TANDEM_WEB_DIR) : undefined,
  port: Number(env.PORT ?? 3864),
  hostname: env.HOST ?? '0.0.0.0',
  // Shorter in end-to-end tests.
  sessionIdleMs: Number(env.TANDEM_SESSION_IDLE_MS ?? 30_000),
  watchPolling: env.TANDEM_WATCH_POLLING === 'true',
  // The welcome note in a folder that never had notes (compose.yaml asks for it; tests don't).
  welcome: env.TANDEM_WELCOME === 'true',
  // Names it answers to besides localhost: the dev servers reach it as `server` (compose.dev.yaml).
  allowedHosts: env.TANDEM_ALLOWED_HOSTS?.split(',')
    .map((host) => host.trim())
    .filter(Boolean),
})

async function shutdown() {
  await app.stop()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
