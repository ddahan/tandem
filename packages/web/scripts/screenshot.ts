// Takes the README's screenshot (docs/screenshot.png) of a running Myfluence:
//   ./mf pnpm --filter @myfluence/web screenshot [base URL] [note title]
import { chromium } from '@playwright/test'

const baseUrl = process.argv[2] ?? 'http://host.docker.internal:3000'
const title = process.argv[3] ?? 'Myfluence'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const tree = (await (await fetch(`${baseUrl}/api/tree`)).json()) as { id: string; title: string }[]
const note = tree.find((node) => node.title === title)
await page.goto(note ? `${baseUrl}/notes/${note.id}` : baseUrl)
await page.locator('.ProseMirror').waitFor()
await page.waitForTimeout(1500)
await page.screenshot({ path: new URL('../../../docs/screenshot.png', import.meta.url).pathname })
await browser.close()
console.log('docs/screenshot.png')
