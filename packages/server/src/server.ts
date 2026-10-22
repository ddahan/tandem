// Starts Tandem: database (restored from the data folder's backup if needed), vault,
// reconciliation with the files, watcher, background jobs and the HTTP server. Used by the
// Docker entry point (main.ts) and by the standalone app (packages/standalone).
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import type { NotesFolderControl } from './folders.ts'
import { waitForPort } from './port.ts'
import { openDatabase } from './db/client.ts'
import { Vault } from './vault/vault.ts'
import { watchVault } from './watcher.ts'
import { welcome } from './welcome.ts'

export interface ServerOptions {
  /** The notes folder. */
  dataDir: string
  /** The live database (outside the synced notes folder). */
  dbPath: string
  /** The built web app, served at `/`. */
  webDir?: string
  /** Where the database migrations are (default: the package's `drizzle/` folder). */
  migrationsFolder?: string
  port: number
  hostname: string
  /** A history version is kept after this long without saves. */
  sessionIdleMs?: number
  /** Poll the notes folder instead of relying on file system events. */
  watchPolling?: boolean
  /** How the notes folder can change from the app (default: it can't). */
  notesFolder?: NotesFolderControl
  /** Folders that can't be the notes folder (the app's own). */
  forbiddenFolders?: string[]
  /** Writes the welcome note in a folder that never had notes (see welcome.ts). */
  welcome?: boolean
  /** Host names answered besides localhost (api/guard.ts), e.g. a container's name. */
  allowedHosts?: string[]
  /** Where the Chrome extension is, shown in Docs › Browser Extension (the standalone app's). */
  extensionDir?: string
}

const README = `# Tandem internal folder

Managed by Tandem: don't edit by hand.

- \`tandem.db\`: a backup of the app's database (ids, tags, order, history index,
  authorship, settings, databases, bookmarks), refreshed about every minute. Restored
  automatically if the app's own database is lost.
- \`history/<note id>/\`: past versions of notes.
- \`trash/\`: deleted notes, until the trash is emptied.
- \`icons/\`: image icons of pages and folders, and bookmarks' favicons.
`

/** Starts the app; `stop()` backs up the database and closes everything. */
export async function startServer(options: ServerOptions): Promise<{ stop(): Promise<void> }> {
  const { dataDir, dbPath, webDir, port, hostname } = options
  const sessionIdleMs = options.sessionIdleMs ?? 30_000
  const backupPath = join(dataDir, '.tandem', 'tandem.db')

  // Before opening anything: another app may hold the port for a while (see port.ts).
  await waitForPort(port, hostname)

  await mkdir(join(dataDir, '.tandem'), { recursive: true })
  await writeFile(join(dataDir, '.tandem', 'README.md'), README)

  const database = await openDatabase(dbPath, backupPath, {
    migrationsFolder: options.migrationsFolder,
  })
  // It reads web pages for bookmarks (their titles and favicons).
  const vault = new Vault({ dataDir, database, sessionIdleMs, fetch: globalThis.fetch })

  console.log(`Data folder: ${dataDir}`)
  await vault.reconcile()
  await vault.reindexAll()
  if (options.welcome) await welcome(vault, dataDir, port)

  const watcher = watchVault(vault, { polling: options.watchPolling ?? false })

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

  const server = serve(
    {
      fetch: createApp(vault, {
        webDir,
        notesFolder: options.notesFolder,
        forbiddenFolders: options.forbiddenFolders,
        allowedHosts: options.allowedHosts,
        extensionDir: options.extensionDir,
      }).fetch,
      port,
      hostname,
    },
    (info) => {
      console.log(`Tandem listens on http://${hostname}:${info.port}`)
    },
  )

  return {
    async stop() {
      for (const timer of timers) clearInterval(timer)
      await watcher.close()
      server.close()
      vault.dirty = true
      backup()
      database.close()
    },
  }
}
