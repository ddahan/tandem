// Starts Myfluence: database (restored from the data folder's backup if needed), vault,
// reconciliation with the files, watcher, background jobs and the HTTP server.
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { openDatabase } from './db/client.ts'
import { Vault } from './vault/vault.ts'
import { watchVault } from './watcher.ts'

const env = process.env
const dataDir = resolve(env.MYFLUENCE_DATA_DIR ?? '/data')
const dbPath = resolve(env.MYFLUENCE_DB_PATH ?? '/var/lib/myfluence/myfluence.db')
const webDir = env.MYFLUENCE_WEB_DIR ? resolve(env.MYFLUENCE_WEB_DIR) : undefined
const port = Number(env.PORT ?? 3000)
const hostname = env.HOST ?? '0.0.0.0'
const backupPath = join(dataDir, '.myfluence', 'myfluence.db')
// A history version is kept after this long without saves (shorter in end-to-end tests).
const sessionIdleMs = Number(env.MYFLUENCE_SESSION_IDLE_MS ?? 30_000)

await mkdir(join(dataDir, '.myfluence'), { recursive: true })
await writeFile(
  join(dataDir, '.myfluence', 'README.md'),
  `# Myfluence internal folder

Managed by Myfluence: don't edit by hand.

- \`myfluence.db\`: a backup of the app's database (ids, tags, order, history index,
  authorship, settings), refreshed about every minute. Restored automatically if the app's
  own database is lost.
- \`history/<note id>/\`: past versions of notes.
- \`trash/\`: deleted notes, until the trash is emptied.
`,
)

const database = await openDatabase(dbPath, backupPath)
const vault = new Vault({ dataDir, database, sessionIdleMs })

console.log(`Data folder: ${dataDir}`)
await vault.reconcile()
await vault.reindexAll()

const watcher = watchVault(vault, { polling: env.MYFLUENCE_WATCH_POLLING === 'true' })

function backup() {
  if (!vault.dirty) return
  vault.dirty = false
  try {
    database.backup(backupPath)
  } catch (error) {
    vault.dirty = true
    console.error('Backup failed', error)
  }
}

const timers = [
  setInterval(
    () => void vault.flushIdleSessions().catch(console.error),
    Math.min(10_000, sessionIdleMs),
  ),
  setInterval(backup, 60_000),
  setInterval(() => void vault.thinHistory().catch(console.error), 6 * 3600_000),
]
vault.dirty = true
backup()

const server = serve({ fetch: createApp(vault, { webDir }).fetch, port, hostname }, (info) => {
  console.log(`Myfluence listens on http://${hostname}:${info.port}`)
})

async function shutdown() {
  for (const timer of timers) clearInterval(timer)
  await watcher.close()
  server.close()
  vault.dirty = true
  backup()
  database.close()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
