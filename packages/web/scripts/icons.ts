// Renders the PNG icons of the web app manifest from public/icon.svg (run after changing it:
// `./mf pnpm --filter @myfluence/web icons`). Full-bleed variants (no rounded corners) are
// used where the system applies its own mask (iOS/macOS touch icon, maskable icon).
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const fullBleed = svg.replace('rx="114"', 'rx="0"')

const outputs: [string, string, number][] = [
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['icon-maskable-512.png', fullBleed, 512],
  ['apple-touch-icon.png', fullBleed, 180],
]

for (const [name, source, size] of outputs) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png)
  console.log(`public/${name}`)
}
