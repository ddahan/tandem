// The standalone app's saved settings: the notes folder and the port, in `install.env` in the
// app folder. The installer writes it (and reads it back to update); Settings › Notes folder
// changes the folder. Shell syntax (`data_dir='…'`), since the installer sources it.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'

export interface SavedSettings {
  dataDir?: string
  port?: number
}

export function settingsFile(home: string): string {
  return join(home, 'install.env')
}

/** A value in single quotes, as the shell reads it. */
const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
const unquote = (value: string) =>
  value.startsWith("'") ? value.slice(1, -1).replace(/'\\''/g, "'") : value

export function readSettings(home: string): SavedSettings {
  const path = settingsFile(home)
  if (!existsSync(path)) return {}
  const values = new Map<string, string>()
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^(\w+)=(.*)$/.exec(line.trim())
    if (match) values.set(match[1]!, unquote(match[2]!))
  }
  const port = Number(values.get('port'))
  return {
    dataDir: values.get('data_dir') || undefined,
    port: Number.isInteger(port) && port > 0 ? port : undefined,
  }
}

export function writeSettings(home: string, settings: SavedSettings): void {
  const path = settingsFile(home)
  mkdirSync(dirname(path), { recursive: true })
  const lines = [
    settings.dataDir ? `data_dir=${quote(settings.dataDir)}` : '',
    settings.port ? `port=${settings.port}` : '',
  ].filter(Boolean)
  writeFileSync(`${path}.tmp`, `${lines.join('\n')}\n`)
  renameSync(`${path}.tmp`, path)
}

/**
 * The live database of a notes folder: one per folder (switching folders must not mix their
 * ids, tags and history). A folder's first one is restored from its `.tandem` backup. The
 * single database of earlier versions becomes the current folder's.
 */
export function databaseFor(home: string, dataDir: string): string {
  const key = createHash('sha256').update(dataDir).digest('hex').slice(0, 16)
  const path = join(home, 'databases', `${key}.db`)
  const legacy = join(home, 'tandem.db')
  if (!existsSync(path) && existsSync(legacy)) {
    mkdirSync(dirname(path), { recursive: true })
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(legacy + suffix)) renameSync(legacy + suffix, path + suffix)
    }
  }
  return path
}
