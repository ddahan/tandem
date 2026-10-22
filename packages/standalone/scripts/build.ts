// Builds the app people install (`./td release` runs it, after building the web app, and copies
// it into the repository's app/ folder):
//   ./td pnpm --filter @tandem/standalone package
//
// dist/tandem/ holds tandem.mjs (src/main.ts: the server, the CLI and their dependencies, in one
// JavaScript file), web/ (the web app), drizzle/ (the database migrations), extension/ (the
// Chrome extension, loaded unpacked from there) and manifest.json.
// No Node inside: it runs on the computer's own (see `nodeSupported`; app/install.sh checks).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { build } from 'esbuild'

import { NODE_REQUIREMENT } from '../src/runtime.ts'

const root = new URL('..', import.meta.url).pathname
const repo = join(root, '..', '..')
const webDir = join(repo, 'packages', 'web', '.output', 'public')
const drizzleDir = join(repo, 'packages', 'server', 'drizzle')
const extensionDir = join(repo, 'packages', 'extension', 'dist')
const outDir = join(root, 'dist', 'tandem')

if (!existsSync(join(webDir, 'index.html'))) {
  throw new Error('Build the web app first: ./td pnpm --filter @tandem/web build')
}
if (!existsSync(join(extensionDir, 'manifest.json'))) {
  throw new Error('Build the extension first: ./td pnpm --filter @tandem/extension build')
}
const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version

rmSync(join(root, 'dist'), { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [join(root, 'src', 'main.ts')],
  outfile: join(outDir, 'tandem.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  // Syntax for the oldest Node it supports, whichever builds it.
  target: 'node22',
  // Some dependencies are CommonJS and `require` Node's modules.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  legalComments: 'none',
  logLevel: 'warning',
})
cpSync(webDir, join(outDir, 'web'), { recursive: true })
cpSync(drizzleDir, join(outDir, 'drizzle'), { recursive: true })
cpSync(extensionDir, join(outDir, 'extension'), { recursive: true })

// A hash of everything: tells builds apart (`tandem version` shows the version).
const hash = createHash('sha256').update(readFileSync(join(outDir, 'tandem.mjs')))
const manifest = { version, build: hash.digest('hex').slice(0, 16) }
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Tandem ${version} (${manifest.build}, ${NODE_REQUIREMENT}): dist/tandem`)
