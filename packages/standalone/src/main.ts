// The standalone Tandem app, run by the computer's Node (built into tandem.mjs, see
// scripts/build.ts): `tandem serve` runs the app; every other command is the CLI
// (packages/cli), talking to the running app.
import { processIo, run, USAGE } from '@tandem/cli/cli'
import { startServer } from '@tandem/server/server'
import { SERVE_USAGE, serveOptions } from './options.ts'
import { appDir, buildVersion, NODE_REQUIREMENT, nodeSupported, runtimeFiles } from './runtime.ts'
import { databaseFor, readSettings, writeSettings } from './settings.ts'

async function serve(args: string[]) {
  const home = appDir()
  const saved = readSettings(home)
  const { dataDir, port, asService } = serveOptions(args, process.env, saved)
  const { version, webDir, migrationsFolder } = runtimeFiles()
  console.log(`Tandem ${version}`)
  const app = await startServer({
    dataDir,
    dbPath: databaseFor(home, dataDir),
    webDir,
    migrationsFolder,
    port,
    // Local only: there is no authentication.
    hostname: '127.0.0.1',
    forbiddenFolders: [home],
    notesFolder: {
      readOnlyReason: asService
        ? null
        : 'Tandem was started by hand: start it again with --data <folder> to change it.',
      // Saved, then a clean exit: launchd starts the login item again, on the new folder.
      async change(path) {
        writeSettings(home, { ...saved, dataDir: path, port })
        setTimeout(() => void stop(), 300)
      },
    },
  })
  const stop = async () => {
    await app.stop()
    process.exit(0)
  }
  process.on('SIGTERM', () => void stop())
  process.on('SIGINT', () => void stop())
}

// The installer checks Node's version; this says it to anyone starting tandem.mjs by hand.
if (!nodeSupported(process.versions.node)) {
  console.error(`Tandem needs ${NODE_REQUIREMENT}; this is Node ${process.versions.node}.`)
  process.exit(1)
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
