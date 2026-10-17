// Writes the app's static icons from the logo (app/utils/logo.ts) in the default indigo:
// public/icon.svg and the PNG icons of the web app manifest. Run after changing the logo:
// `./td pnpm --filter @tandem/web icons`. Full-bleed variants (no rounded corners) are used
// where the system applies its own mask (iOS/macOS touch icon, maskable icon).
import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { logoSvg, type LogoShade } from '../app/utils/logo.ts'

// Tailwind's indigo.
const INDIGO: Record<LogoShade, string> = {
  50: '#eef2ff',
  200: '#c7d2fe',
  300: '#a5b4fc',
  400: '#818cf8',
  500: '#6366f1',
  600: '#4f46e5',
}
const indigo = (n: LogoShade) => INDIGO[n]
const rounded = logoSvg(indigo, 'icon')
const fullBleed = logoSvg(indigo, 'icon', 0)

writeFileSync(new URL('../public/icon.svg', import.meta.url), `${rounded}\n`)
console.log('public/icon.svg')

const outputs: [string, string, number][] = [
  ['icon-192.png', rounded, 192],
  ['icon-512.png', rounded, 512],
  ['icon-maskable-512.png', fullBleed, 512],
  ['apple-touch-icon.png', fullBleed, 180],
]

for (const [name, source, size] of outputs) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png)
  console.log(`public/${name}`)
}
