// The standalone app's own command, `serve`: its usage and options.
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

export const SERVE_USAGE = `Running the app
  serve --data <folder>         run Tandem on a notes folder (TANDEM_DATA_DIR), at
                                http://localhost:3000 (--port, TANDEM_PORT)
  version                       this app's version
`

export interface ServeOptions {
  dataDir: string
  port: number
}

/** `serve`'s options, from its arguments and the environment. */
export function serveOptions(args: string[], env = process.env): ServeOptions {
  const { values } = parseArgs({
    args,
    options: { data: { type: 'string' }, port: { type: 'string' } },
  })
  const data = values.data ?? env.TANDEM_DATA_DIR
  if (!data) throw new Error('Which notes folder? Use: tandem serve --data <folder>')
  const port = Number(values.port ?? env.TANDEM_PORT ?? 3000)
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid port: ${values.port}`)
  return { dataDir: resolve(data), port }
}
