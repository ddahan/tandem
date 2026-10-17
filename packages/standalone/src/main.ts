// The standalone Tandem app: one executable, without Docker or Node. `tandem serve` runs the
// app; every other command is the CLI (packages/cli), talking to the running app.
import { join } from 'node:path'
import { processIo, run, USAGE } from '@tandem/cli/cli'
import { startServer } from '@tandem/server/server'
import { SERVE_USAGE, serveOptions } from './options.ts'
import { appDir, buildVersion, runtimeFiles } from './runtime.ts'

async function serve(args: string[]) {
  const { dataDir, port } = serveOptions(args)
  const home = appDir()
  const { version, webDir, migrationsFolder } = runtimeFiles(home)
  console.log(`Tandem ${version}`)
  const app = await startServer({
    dataDir,
    dbPath: join(home, 'tandem.db'),
    webDir,
    migrationsFolder,
    port,
    // Local only: there is no authentication.
    hostname: '127.0.0.1',
  })
  const stop = async () => {
    await app.stop()
    process.exit(0)
  }
  process.on('SIGTERM', () => void stop())
  process.on('SIGINT', () => void stop())
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'serve') {
  await serve(rest).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
} else if (command === 'version' || command === '--version') {
  console.log(buildVersion())
} else if (!command || command === 'help' || command === '--help' || command === '-h') {
  console.log(`${USAGE.trimEnd()}\n\n${SERVE_USAGE}`)
} else {
  process.exitCode = await run([command, ...rest], processIo)
}
