// Builds the standalone executables (`./td release` runs it, after building the web app):
//   ./td pnpm --filter @tandem/standalone package [--targets darwin-arm64,linux-x64]
//
// 1. Bundles src/main.ts (server, CLI and their dependencies) into one JavaScript file.
// 2. Lists the web app (packages/web/.output/public) and the migrations as embedded assets.
// 3. For each target, takes Node's official binary of the running version (downloaded once
//    into .cache/, checked against nodejs.org's SHA-256 sums) and makes it a single
//    executable with `node --build-sea`: dist/tandem-<os>-<arch>.
// macOS executables must then be signed (ad hoc is enough) on a Mac: `./td release` does it.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { build } from 'esbuild'

const ALL_TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64']

const root = new URL('..', import.meta.url).pathname
const repo = join(root, '..', '..')
const webDir = join(repo, 'packages', 'web', '.output', 'public')
const drizzleDir = join(repo, 'packages', 'server', 'drizzle')
const cacheDir = join(root, '.cache')
const distDir = join(root, 'dist')
const workDir = join(distDir, 'work')

const { values } = parseArgs({ options: { targets: { type: 'string' } } })
const targets = values.targets?.split(',') ?? ALL_TARGETS
for (const target of targets) {
  if (!ALL_TARGETS.includes(target)) throw new Error(`Unknown target ${target}`)
}
if (!existsSync(join(webDir, 'index.html'))) {
  throw new Error('Build the web app first: ./td pnpm --filter @tandem/web build')
}

const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version

rmSync(distDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })

// --- 1. The bundle -------------------------------------------------------------------------
await build({
  entryPoints: [join(root, 'src', 'main.ts')],
  outfile: join(workDir, 'tandem.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: `node${process.versions.node.split('.')[0]}`,
  // Some dependencies are CommonJS and `require` Node's modules.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(process.execPath);",
  },
  legalComments: 'none',
  logLevel: 'warning',
})

// --- 2. The embedded files -----------------------------------------------------------------
function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
}

const assets: Record<string, string> = {}
for (const path of files(webDir)) assets[`web/${relative(webDir, path)}`] = path
for (const path of files(drizzleDir)) assets[`drizzle/${relative(drizzleDir, path)}`] = path

const hash = createHash('sha256').update(readFileSync(join(workDir, 'tandem.mjs')))
for (const key of Object.keys(assets).toSorted())
  hash.update(key).update(readFileSync(assets[key]!))
const manifest = { version, build: hash.digest('hex').slice(0, 16), files: Object.keys(assets) }
writeFileSync(join(workDir, 'manifest.json'), JSON.stringify(manifest))
assets['manifest.json'] = join(workDir, 'manifest.json')

// --- 3. One executable per target ----------------------------------------------------------
async function download(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/** Node's binary for a target, of the version running this script. */
async function nodeBinary(target: string): Promise<string> {
  const nodeVersion = process.version
  // Not the archive's own folder name, which is removed after extraction.
  const binary = join(cacheDir, `node-${nodeVersion}-${target}.bin`)
  if (existsSync(binary)) return binary
  mkdirSync(cacheDir, { recursive: true })
  const name = `node-${nodeVersion}-${target}`
  const archive = `${name}.tar.gz`
  const base = `https://nodejs.org/dist/${nodeVersion}`
  const sums = (await download(`${base}/SHASUMS256.txt`)).toString()
  const expected = sums
    .split('\n')
    .find((line) => line.endsWith(`  ${archive}`))
    ?.split(' ')[0]
  const data = await download(`${base}/${archive}`)
  if (createHash('sha256').update(data).digest('hex') !== expected) {
    throw new Error(`Checksum mismatch for ${archive}`)
  }
  const archivePath = join(cacheDir, archive)
  writeFileSync(archivePath, data)
  execFileSync('tar', ['-xzf', archivePath, '-C', cacheDir, `${name}/bin/node`])
  execFileSync('mv', [join(cacheDir, name, 'bin', 'node'), binary])
  rmSync(join(cacheDir, name), { recursive: true, force: true })
  rmSync(archivePath)
  return binary
}

for (const target of targets) {
  const output = join(distDir, `tandem-${target}`)
  const config = join(workDir, `sea-${target}.json`)
  writeFileSync(
    config,
    JSON.stringify({
      main: join(workDir, 'tandem.mjs'),
      mainFormat: 'module',
      executable: await nodeBinary(target),
      output,
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
      assets,
    }),
  )
  execFileSync(process.execPath, ['--build-sea', config], { stdio: 'inherit' })
}

rmSync(workDir, { recursive: true, force: true })
console.log(
  `Tandem ${version} (${manifest.build}): ${targets.map((t) => `dist/tandem-${t}`).join(', ')}`,
)
