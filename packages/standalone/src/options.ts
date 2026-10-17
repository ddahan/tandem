// The standalone app's own command, `serve`: its usage and options.
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { SavedSettings } from './settings.ts'

export const SERVE_USAGE = `Running the app
  serve [--data <folder>]       run Tandem on a notes folder (TANDEM_DATA_DIR, or the one
                                saved by the installer or in Settings), at
                                http://localhost:3000 (--port, TANDEM_PORT)
  version                       this app's version
`

/** The login item's name (or TANDEM_SERVICE_LABEL's): running as it, the server can switch folders (it gets restarted). */
export const SERVICE_LABEL = 'app.tandem'

export interface ServeOptions {
  dataDir: string
  port: number
  /** Started as the login item (by launchd): Settings can change the notes folder. */
  asService: boolean
}

/**
 * `serve`'s options. By hand, the arguments win, then the environment, then the saved
 * settings. As the login item, the saved settings win: they hold the folder chosen in
 * Settings (an older installer also wrote it in the login item's arguments).
 */
export function serveOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  saved: SavedSettings = {},
): ServeOptions {
  const { values } = parseArgs({
    args,
    options: { data: { type: 'string' }, port: { type: 'string' } },
  })
  const asService = env.XPC_SERVICE_NAME === (env.TANDEM_SERVICE_LABEL ?? SERVICE_LABEL)
  const data = asService
    ? (saved.dataDir ?? values.data ?? env.TANDEM_DATA_DIR)
    : (values.data ?? env.TANDEM_DATA_DIR ?? saved.dataDir)
  if (!data) throw new Error('Which notes folder? Use: tandem serve --data <folder>')
  const rawPort = asService
    ? (saved.port ?? values.port ?? env.TANDEM_PORT)
    : (values.port ?? env.TANDEM_PORT ?? saved.port)
  const port = Number(rawPort ?? 3000)
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid port: ${rawPort}`)
  return { dataDir: resolve(data), port, asService }
}
