// The SQLite database: Node's built-in `node:sqlite` (no native module to compile), used by
// Drizzle through its "proxy" driver. Queries run synchronously under the hood, so callers
// serialize writes with the vault's lock rather than with SQLite transactions across awaits.
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator'
import * as schema from './schema.ts'

export type Db = SqliteRemoteDatabase<typeof schema>

export interface Database {
  db: Db
  sqlite: DatabaseSync
  /** Writes a consistent copy of the database to `target` (atomically replaced). */
  backup(target: string): void
  close(): void
}

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url))

/**
 * Opens (and migrates) the database at `path` (`:memory:` for tests). When the file is missing
 * and `restoreFrom` exists, that backup is copied first: the live database is on a local volume
 * that can be lost, the backup is in the synced data folder.
 */
export async function openDatabase(path: string, restoreFrom?: string): Promise<Database> {
  let restored = false
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
    if (!existsSync(path) && restoreFrom && existsSync(restoreFrom)) {
      copyFileSync(restoreFrom, path)
      restored = true
    }
  }

  const sqlite = new DatabaseSync(path)
  // NORMAL: the safe setting for WAL (no corruption; a power cut may lose the last commits,
  // which the Markdown files and the next reconcile restore). FULL syncs the disk on every commit.
  sqlite.exec(
    'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
  )

  // Drizzle sends the same few SQL strings again and again: compile each once.
  const statements = new Map<string, StatementSync>()
  const db = drizzle(
    async (sql, params, method) => {
      let statement = statements.get(sql)
      if (!statement) {
        // `IN (?, ?, …)` lists make new strings: keep the cache bounded.
        if (statements.size >= 500) statements.clear()
        statement = sqlite.prepare(sql)
        statements.set(sql, statement)
      }
      const values = params as SQLInputValue[]
      if (method === 'run') {
        statement.run(...values)
        return { rows: [] }
      }
      statement.setReturnArrays(true)
      if (method === 'get') {
        // Drizzle expects `undefined` rows (not an empty row) when nothing matches.
        return { rows: statement.get(...values) as unknown as unknown[] }
      }
      return { rows: statement.all(...values) as unknown[] }
    },
    { schema },
  )

  await migrate(
    db,
    async (queries) => {
      sqlite.exec('BEGIN')
      try {
        for (const query of queries) sqlite.exec(query)
        sqlite.exec('COMMIT')
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
    { migrationsFolder: MIGRATIONS },
  )

  if (restored) console.log(`Restored the database from ${restoreFrom}`)

  return {
    db,
    sqlite,
    backup(target) {
      mkdirSync(dirname(target), { recursive: true })
      const temporary = join(dirname(target), `.tandem-backup-${process.pid}.tmp`)
      rmSync(temporary, { force: true })
      sqlite.prepare('VACUUM INTO ?').run(temporary)
      renameSync(temporary, target)
    },
    close() {
      sqlite.close()
    },
  }
}
