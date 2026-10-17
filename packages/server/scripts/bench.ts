// Measures the server on a large generated vault (performance work: compare before / after):
//   ./td pnpm --filter @tandem/server bench [pages]
// Writes the notes as files in a temporary folder, imports them as at startup, then times the
// API calls the app makes most (through the real HTTP app, JSON included). Prints medians.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.ts'
import { openDatabase } from '../src/db/client.ts'
import { Vault } from '../src/vault/vault.ts'

const PAGES = Number(process.argv[2] ?? 5000)
const RUNS = 15
// A realistic vocabulary: 6,000 made-up words, a few frequent and most rare (Zipf-like), with
// real words at fixed ranks so that the searches below have common and rarer matches.
const SYLLABLES = 'ka lo mi ne ru sa ti vo be da fe gi ho ju li ma no pe qui re'.split(' ')
const VOCABULARY = Array.from({ length: 6000 }, (_, i) => {
  let word = ''
  for (let n = i + 7; word.length < 4 || n > 0; n = Math.floor(n / 20)) word += SYLLABLES[n % 20]
  return word
})
VOCABULARY[30] = 'project'
VOCABULARY[60] = 'meeting'
VOCABULARY[120] = 'budget'
VOCABULARY[400] = 'review'
VOCABULARY[2500] = 'architecture'

/** Deterministic pseudo-random numbers (the same vault on every run). */
let seed = 42
function random(): number {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
  return seed / 2_147_483_648
}
const word = () => VOCABULARY[Math.floor(VOCABULARY.length * random() ** 3)]!

/** About `kb` kilobytes of Markdown: headings, paragraphs, a list, a link. */
function note(index: number, kb: number): string {
  const lines = [`# Note ${index}`, '']
  let size = 0
  let paragraph = 0
  while (size < kb * 1024) {
    const words = Array.from({ length: 60 }, word)
    const line =
      paragraph % 5 === 0
        ? `## Section ${paragraph}\n\n- ${words.slice(0, 8).join(' ')}\n- [[Note ${(index + 1) % PAGES}]]`
        : `${words.join(' ')}.`
    lines.push(line, '')
    size += line.length + 1
    paragraph++
  }
  return lines.join('\n')
}

const dataDir = await mkdtemp(join(tmpdir(), 'tandem-bench-'))
const database = await openDatabase(join(dataDir, '.tandem-bench.db'))
try {
  // 50 folders of pages; a few large notes (200 KB), the rest 2 to 8 KB.
  let totalKb = 0
  for (let i = 0; i < PAGES; i++) {
    const dir = join(dataDir, `Folder ${i % 50}`)
    if (i < 50) await mkdir(dir, { recursive: true })
    const kb = i % 500 === 0 ? 200 : 2 + (i % 7)
    totalKb += kb
    await writeFile(join(dir, `Note ${i}.md`), note(i, kb))
  }

  const vault = new Vault({ dataDir, database, sessionIdleMs: 30_000 })
  let start = performance.now()
  await vault.reconcile()
  const importMs = performance.now() - start
  const app = createApp(vault)
  const tree = (await (await app.request('/api/tree')).json()) as { id: string; kind: string }[]
  const pageIds = tree.filter((n) => n.kind === 'page').map((n) => n.id)

  async function time(label: string, path: (run: number) => string) {
    const samples: number[] = []
    let bytes = 0
    for (let run = 0; run < RUNS; run++) {
      start = performance.now()
      const response = await app.request(path(run))
      bytes = (await response.arrayBuffer()).byteLength
      samples.push(performance.now() - start)
      if (!response.ok) throw new Error(`${path(run)}: ${response.status}`)
    }
    samples.sort((a, b) => a - b)
    const median = samples[Math.floor(samples.length / 2)]!
    console.log(
      `${label.padEnd(28)} ${median.toFixed(1).padStart(8)} ms   ${(bytes / 1024).toFixed(0).padStart(6)} KB`,
    )
  }

  console.log(`${PAGES} pages, ${(totalKb / 1024).toFixed(0)} MB of Markdown`)
  console.log(`${'import (reconcile)'.padEnd(28)} ${importMs.toFixed(0).padStart(8)} ms`)
  await time('tree', () => '/api/tree')
  await time('search "budget review"', () => '/api/search?q=budget%20review')
  await time('search "architecture"', () => '/api/search?q=architecture')
  await time('search (typing "rev")', () => '/api/search?q=rev')
  await time('search with a typo', () => '/api/search?q=architecure')
  await time('search "" (recent notes)', () => '/api/search?q=')
  await time('open a note', (run) => `/api/notes/${pageIds[(run * 37) % pageIds.length]}`)
  await time('backlinks', (run) => `/api/notes/${pageIds[(run * 37) % pageIds.length]}/backlinks`)
} finally {
  database.close()
  await rm(dataDir, { recursive: true, force: true })
}
