// Where the standalone app keeps its own files, and the files it carries.
//
// - The app folder (`appDir`): the live database and the settings, outside the notes folder
//   (SQLite and file sync don't mix). The notes folder keeps the backup, as in Docker.
//   `TANDEM_HOME` overrides it.
// - The built app (scripts/build.ts) is tandem.mjs with web/, drizzle/ and manifest.json next to
//   it, run by the computer's Node. Run from the repository instead (development), the web app
//   and migrations are the packages' own.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Manifest {
  version: string
  /** A hash of the bundle: tells builds apart. */
  build: string
}

/** Said when Node doesn't fit (README and app/install.sh say the same). */
export const NODE_REQUIREMENT = 'Node 22.16 or later (not 23)'

/**
 * Whether this Node runs Tandem: it needs node:sqlite with `setReturnArrays`, which came in
 * 22.16 and 24.0, never in 23 (tried on 22.13 to 22.23, 23.11 and 24 to 26; `./td release`
 * checks 22.16 and app/node.env's, the one the installer downloads, with scripts/smoke.mjs).
 */
export function nodeSupported(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major >= 24 || (major === 22 && minor >= 16)
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
  /** Undefined in development: the server's own `drizzle/` folder. */
  migrationsFolder?: string
}

/** The folder of the running code: the built app's, or src/ in development. */
const here = dirname(fileURLToPath(import.meta.url))

/** The built app's manifest, next to tandem.mjs (none in development). */
export function manifest(dir = here): Manifest | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest
  } catch {
    return null
  }
}

/** The version of this build (`dev` when run from the repository). */
export function buildVersion(dir = here): string {
  return manifest(dir)?.version ?? 'dev'
}

/** The web app and migrations to use: the built app's, or the repository's in development. */
export function runtimeFiles(dir = here): Runtime {
  const built = manifest(dir)
  if (!built) {
    return {
      version: 'dev',
      webDir: fileURLToPath(new URL('../../web/.output/public', import.meta.url)),
    }
  }
  return {
    version: built.version,
    webDir: join(dir, 'web'),
    migrationsFolder: join(dir, 'drizzle'),
  }
}
