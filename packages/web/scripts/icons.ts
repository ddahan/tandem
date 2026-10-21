// Writes the app's static icons from the logo (app/utils/logo.ts) in the default amber:
// public/icon.svg and the PNG icons of the web app manifest. Run after changing the logo:
// `./td pnpm --filter @tandem/web icons`. Full-bleed variants (no rounded corners) are used
// where the system applies its own mask (iOS/macOS touch icon, maskable icon).
import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { logoSvg, type LogoShade } from '../app/utils/logo.ts'

// Tailwind's amber.
const AMBER: Record<LogoShade, string> = {
  50: '#fffbeb',
  200: '#fde68a',
  300: '#fcd34d',
  400: '#fbbf24',
  500: '#f59e0b',
  600: '#d97706',
}
const amber = (n: LogoShade) => AMBER[n]
const rounded = logoSvg(amber, 'icon')
const fullBleed = logoSvg(amber, 'icon', 0)

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
