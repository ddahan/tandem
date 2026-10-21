// The welcome note: on a notes folder Tandem has never used, a first page to play with (a few
// features, by doing them: not a manual), a page inside it, and a small database. Written by
// "tandem", so that the authorship view has something to show. Only once per folder: a marker in
// `.tandem/` says it was offered (or that the folder already had notes), so a deleted welcome
// note never comes back. The standalone app asks for it (startServer's `welcome`).
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Vault } from './vault/vault.ts'

export const WELCOME_AUTHOR = 'tandem'
export const WELCOME_TITLE = 'Welcome to Tandem'

/** The welcome note's Markdown (as the editor writes it: unchanged by a first edit). */
export function welcomeMarkdown(port: number, databaseId: string): string {
  return `Hi! This page is yours: play with it, scribble on it, then delete it when you're done (it waits in the trash).

> [!TIP]
> Everything you write is a plain Markdown file in your notes folder. Any app can open it, and you can leave anytime.

## Five things to try

- [ ] Tick this box
- [ ] Type \`/\` on an empty line, and pick a block
- [ ] Select a word and press **⌘B** (or Ctrl+B)
- [ ] Type \`[[\` to link a page, like this one: [[Scratchpad]]
- [ ] Press **⌘⇧F** and search for the rocket in your Scratchpad: misspell it, on purpose

## Who wrote what?

Every line remembers its author. Tandem wrote this page: add a line anywhere, then switch to **Authorship** (the people icon, top right), and your color shows up next to Tandem's.

## You, your agent, and your notes

\`\`\`mermaid
flowchart LR
  You -- writes --> Notes["Your notes"]
  Agent["Your agent"] -- writes too --> Notes
\`\`\`

<details>
<summary>Connect Claude in one command</summary>

\`\`\`bash
claude mcp add --transport http tandem http://localhost:${port}/mcp --header "X-Tandem-Author: claude"
\`\`\`

Then ask it: *Add three ideas to my Scratchpad page.* Its lines will be in its own color.

</details>

## A tiny database

\`\`\`database
id: ${databaseId}
\`\`\`

Sort it, filter it, tick what you've done: its rows live in Tandem, the note only holds this block.
`
}

/** The page inside the welcome note: something to find, and room to write. */
export const SCRATCHPAD_MARKDOWN = `This page lives inside **${WELCOME_TITLE}**: any page can hold pages (look at the tree on the left).

- 🚀 A rocket-sized idea, waiting for you to write it down
- Ideas from your agent can land here too
`

/** The welcome database's rows: things to try, by effort. */
// Short: they show in full in the table's first column.
const THINGS_TO_TRY: [string, string][] = [
  ['Double-click a page', 'Easy'],
  ['Pick an accent color', 'Easy'],
  ['Drop in an image', 'Easy'],
  ['Drag a block by ⋮⋮', 'Fun'],
  ['Ask your agent for a row', 'Fun'],
]

/**
 * Writes the welcome note if this folder never had notes and never got one, and returns its
 * id (null when it doesn't).
 */
export async function welcome(vault: Vault, dataDir: string, port: number): Promise<string | null> {
  const marker = join(dataDir, '.tandem', 'welcomed')
  if (existsSync(marker)) return null
  const fresh = !(await vault.tree()).length && !(await vault.trashList()).length
  await mkdir(join(dataDir, '.tandem'), { recursive: true })
  await writeFile(marker, 'The welcome note was offered (or the folder had notes already).\n')
  if (!fresh) return null

  const note = await vault.createPage({ title: WELCOME_TITLE, author: WELCOME_AUTHOR })
  await vault.setIconEmoji(note.id, '👋')
  const scratchpad = await vault.createPage({
    parentId: note.id,
    title: 'Scratchpad',
    content: SCRATCHPAD_MARKDOWN,
    author: WELCOME_AUTHOR,
  })
  await vault.setIconEmoji(scratchpad.id, '✏️')

  const database = await vault.createDatabase(note.id, {
    title: 'Things to try',
    columns: [
      { name: 'Thing', type: 'text' },
      { name: 'Effort', type: 'select', options: ['Easy', 'Fun'] },
      { name: 'Done', type: 'checkbox' },
    ],
  })
  const column = (name: string) => database.columns.find((c) => c.name === name)!.id
  const cells = ([thing, effort]: [string, string]) => ({
    [column('Thing')]: thing,
    [column('Effort')]: effort,
    [column('Done')]: false,
  })
  // A new database comes with an empty row: the first thing goes there.
  const [first, ...rest] = THINGS_TO_TRY
  const empty = database.rows[0]
  if (empty) await vault.updateDatabaseRow(database.id, empty.id, cells(first!))
  else await vault.addDatabaseRow(database.id, { cells: cells(first!) })
  for (const thing of rest) await vault.addDatabaseRow(database.id, { cells: cells(thing) })

  await vault.saveContent(note.id, welcomeMarkdown(port, database.id), { author: WELCOME_AUTHOR })
  return note.id
}
