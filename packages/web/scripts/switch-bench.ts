// Times going from page to page in the built app (performance work: compare before / after):
//   ./td pnpm --filter @tandem/web build
//   ./td pnpm --filter @tandem/web bench [tabs]
// Starts the real server on a temporary folder with notes of several sizes, opens `tabs` other
// pages in tabs of their own (12 by default: the tab bar is part of what a switch costs), then
// clicks the notes' rows in the tree, in turn. For each note, the medians of: the time from the
// click to the first frame showing the note (headless Chromium draws 60 frames a second, and
// the measure waits for one more frame: about 35 ms is the least it can read), and the time the
// page was blocked by tasks over 50 ms.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const TABS = Number(process.argv[2] ?? 12)
const ROUNDS = 7
const PORT = 3029
const base = `http://localhost:${PORT}`

const PARAGRAPH =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'

/** A section of mostly text, as most notes are: a code block, callout or table now and then. */
function prose(index: number): string {
  const block =
    index % 10 === 3
      ? `\n\`\`\`ts\nconst value${index} = compute(${index})\n\`\`\`\n`
      : index % 15 === 7
        ? '\n> [!TIP]\n> Remember this.\n'
        : index % 15 === 11
          ? '\n| A | B |\n| --- | --- |\n| 1 | 2 |\n'
          : ''
  return `## Topic ${index}\n\n${PARAGRAPH} With **bold**, *italic* and \`code\`.\n\n${PARAGRAPH}\n\n- A first point\n- A second point\n- [ ] Something to do\n${block}\n### Follow-up ${index}\n\n${PARAGRAPH}\n`
}

/** A section with every kind of block: a code block, a callout and a table each. */
function blocks(index: number): string {
  return `## Section ${index}\n\n${PARAGRAPH}\n\n- One\n  - Nested\n- [x] Done\n\n> [!NOTE]\n> About section ${index}.\n\n\`\`\`ts\nexport function compute${index}(a: number): number {\n  return a * ${index}\n}\n\`\`\`\n\n| Name | Value |\n| --- | --- |\n| alpha | ${index} |\n| beta | ${index * 2} |\n`
}

const sections = (make: (index: number) => string, count: number) =>
  Array.from({ length: count }, (_, i) => make(i + 1)).join('\n')

const NOTES = [
  { title: 'Bench small (1 KB)', content: sections(prose, 1) },
  { title: 'Bench text (8 KB)', content: sections(prose, 9) },
  { title: 'Bench text (30 KB)', content: sections(prose, 34) },
  { title: 'Bench blocks (6 KB)', content: sections(blocks, 12) },
  { title: 'Bench blocks (30 KB)', content: sections(blocks, 60) },
]

const dataDir = mkdtempSync(join(tmpdir(), 'tandem-bench-'))
const server = spawn('node', ['../server/src/main.ts'], {
  stdio: 'ignore',
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    TANDEM_DATA_DIR: join(dataDir, 'notes'),
    TANDEM_DB_PATH: join(dataDir, 'db', 'tandem.db'),
    TANDEM_WEB_DIR: '.output/public',
  },
})

async function post(path: string, body: unknown) {
  const response = await fetch(`${base}/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tandem-author': 'owner' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`POST ${path}: ${response.status}`)
}

const median = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!

try {
  for (let tries = 0; ; tries++) {
    if (
      await fetch(`${base}/health`).then(
        (r) => r.ok,
        () => false,
      )
    )
      break
    if (tries > 100) throw new Error('The server did not start.')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  for (const note of NOTES) await post('/notes', note)
  const fillers = Array.from({ length: Math.max(TABS, 30) }, (_, i) => `Page ${i + 1}`)
  for (const title of fillers) await post('/notes', { title, content: `${PARAGRAPH}\n` })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript(() => {
    const state = { clicked: 0, tasks: [] as number[] }
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.tasks.push(entry.duration)
    }).observe({ entryTypes: ['longtask'] })
    addEventListener(
      'click',
      (event) => {
        state.clicked = event.timeStamp
        state.tasks = []
      },
      true,
    )
    // Resolves at the frame after the first one showing the note `title` in its editor.
    Object.assign(window, {
      shown: (title: string) =>
        new Promise((resolve) => {
          const check = () => {
            const input = document.querySelector<HTMLInputElement>('input[aria-label="Title"]')
            const text = document.querySelector('.note-editor .ProseMirror')
            if (input?.value !== title || !text?.childElementCount) {
              requestAnimationFrame(check)
              return
            }
            requestAnimationFrame(() => {
              const painted = performance.now() - state.clicked
              // Tasks are reported late: wait for those of this switch.
              setTimeout(
                () => resolve({ painted, blocked: state.tasks.reduce((a, b) => a + b, 0) }),
                400,
              )
            })
          }
          requestAnimationFrame(check)
        }),
    })
  })
  await page.goto(base)
  for (const title of fillers.slice(0, TABS)) {
    await page.getByTestId(`tree-${title}`).dblclick()
    // Its own page, not the one before it still showing.
    await page.waitForFunction(
      (t) => document.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value === t,
      title,
    )
  }

  const results = new Map<string, { painted: number; blocked: number }[]>()
  for (let round = 0; round < ROUNDS; round++) {
    for (const { title } of NOTES) {
      const shown = page.evaluate(
        (t) => (window as unknown as { shown(t: string): Promise<unknown> }).shown(t),
        title,
      )
      await page.getByTestId(`tree-${title}`).click()
      const result = (await shown) as { painted: number; blocked: number }
      // The first round loads code and warms it up.
      if (round > 0) results.set(title, [...(results.get(title) ?? []), result])
    }
  }
  await browser.close()

  console.log(`Page switches, ${TABS} tabs open (medians of ${ROUNDS - 1}, ms)\n`)
  console.log(`${'note'.padEnd(24)}${'click to shown'.padStart(16)}${'blocked'.padStart(10)}`)
  for (const [title, list] of results) {
    const painted = median(list.map((one) => one.painted)).toFixed(0)
    const blocked = median(list.map((one) => one.blocked)).toFixed(0)
    console.log(`${title.padEnd(24)}${painted.padStart(16)}${blocked.padStart(10)}`)
  }
} finally {
  // The server writes as it stops (its database's backup copy): the folder goes after it.
  await new Promise((resolve) => {
    server.once('exit', resolve)
    server.kill()
  })
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 })
}
