// Builds the Chrome extension into dist/ (loaded unpacked from there, or from the installed
// app's `extension/` folder, which the standalone build copies):
//   ./td pnpm --filter @tandem/extension build
//
// Its scripts are bundled (they use @tandem/shared); its pages, styles and icons are copied; its
// version is the app's (packages/standalone/package.json).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'

const root = new URL('..', import.meta.url).pathname
const outDir = join(root, 'dist')
const { version } = JSON.parse(
  readFileSync(join(root, '..', 'standalone', 'package.json'), 'utf8'),
) as { version: string }

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: ['popup', 'background', 'options'].map((name) => join(root, 'src', `${name}.ts`)),
  outdir: outDir,
  bundle: true,
  format: 'esm',
  // The Chrome that runs Manifest V3 extensions with these APIs (favicon, omnibox).
  target: 'chrome116',
  legalComments: 'none',
  logLevel: 'warning',
})

cpSync(join(root, 'static'), outDir, { recursive: true })
const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) as {
  version: string
}
manifest.version = version
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Extension ${version} built in ${outDir}`)
