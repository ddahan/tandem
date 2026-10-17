// Where the standalone app keeps its own files, and the files it carries.
//
// - The app folder (`appDir`): the live database and the extracted runtime files, outside the
//   notes folder (SQLite and file sync don't mix). The notes folder keeps the backup, as in
//   Docker. `TANDEM_HOME` overrides it.
// - The runtime files (web app, database migrations) are embedded in the executable (Node's
//   single executable assets, listed in `manifest.json`) and extracted once per build into
//   `<app folder>/runtime/<build>/`, where the server reads them like ordinary files.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { getAsset, isSea } from 'node:sea'
import { fileURLToPath } from 'node:url'

export interface Manifest {
  version: string
  /** A hash of the bundle and its files: a new build gets a new runtime folder. */
  build: string
  /** Asset keys: `web/…` and `drizzle/…` paths. */
  files: string[]
}

export function appDir(env = process.env, platform = process.platform): string {
  if (env.TANDEM_HOME) return env.TANDEM_HOME
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Tandem')
  if (platform === 'win32')
    return join(env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Tandem')
  return join(env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'tandem')
}

export interface Runtime {
  version: string
  webDir: string
  /** Undefined outside the executable: the server's own `drizzle/` folder. */
  migrationsFolder?: string
}

/** The version of this build (`dev` when not run as the executable). */
export function buildVersion(): string {
  if (!isSea()) return 'dev'
  return (JSON.parse(getAsset('manifest.json', 'utf8')) as Manifest).version
}

/** The web app and migrations to use: extracted from the executable, or the repo's in development. */
export function runtimeFiles(home = appDir()): Runtime {
  if (!isSea()) {
    return {
      version: 'dev',
      webDir: fileURLToPath(new URL('../../web/.output/public', import.meta.url)),
    }
  }
  const manifest = JSON.parse(getAsset('manifest.json', 'utf8')) as Manifest
  const root = join(home, 'runtime')
  const target = join(root, manifest.build)
  if (!existsSync(join(target, '.complete'))) {
    // Into a temporary folder first: a crash halfway never leaves a partial runtime behind.
    const temporary = `${target}.${process.pid}.tmp`
    rmSync(temporary, { recursive: true, force: true })
    for (const key of manifest.files) {
      const path = join(temporary, key)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, new Uint8Array(getAsset(key)))
    }
    writeFileSync(join(temporary, '.complete'), manifest.version)
    rmSync(target, { recursive: true, force: true })
    renameSync(temporary, target)
  }
  // Older builds' files are no longer needed.
  for (const name of readdirSync(root)) {
    if (name !== manifest.build) rmSync(join(root, name), { recursive: true, force: true })
  }
  return {
    version: manifest.version,
    webDir: join(target, 'web'),
    migrationsFolder: join(target, 'drizzle'),
  }
}
