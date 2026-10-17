// Fills a running Tandem with demo notes (development and screenshots):
//   ./td pnpm --filter @tandem/server seed [http://server:3011]
// Writes through the API, as the owner and as an agent, so history and authorship show both.
import { createClient } from '../src/client.ts'

const baseUrl = process.argv[2] ?? process.env.TANDEM_URL ?? 'http://localhost:3011'
const owner = createClient(baseUrl, { author: 'owner' })
const claude = createClient(baseUrl, { author: 'claude' })

async function json<T>(response: Promise<{ ok: boolean; json(): Promise<T> }>): Promise<T> {
  const result = await response
  if (!result.ok) throw new Error(JSON.stringify(await result.json()))
  return result.json()
}

const projects = await json(
  owner.notes.$post({
    json: {
      title: 'Projects',
      content: '# Projects\n\nEverything I am working on. The current one: [[Tandem]].\n',
    },
  }),
)

const tandem = await json(
  owner.notes.$post({
    json: {
      parentId: projects.id,
      title: 'Tandem',
      tags: ['work', 'app'],
      content: `Tandem is a **local-first** notes app, written by me *and* my agents. 🎉

> [!TIP]
> Type \`/\` for blocks, \`[[\` to link a note, \`:\` for emojis.

## Goals

- [x] Markdown files as the source of truth
- [x] Search that forgives typos
- [ ] Ship the first version

## Stack

| Layer | Choice |
| --- | --- |
| UI | Nuxt UI |
| API | Hono |
| Data | SQLite + Markdown |

\`\`\`ts
const vault = new Vault({ dataDir })
await vault.reconcile()
\`\`\`

<details>
<summary>Architecture notes</summary>

The database is an index that can be rebuilt; files win.

</details>

\`\`\`mermaid
flowchart LR
  You --> Editor --> Files
  Agent --> MCP --> Files
\`\`\`
`,
    },
  }),
)

await json(
  claude.notes[':id'].append.$post({
    param: { id: tandem.id },
    json: {
      content:
        '## Agent review\n\nThe sync design looks sound. Next: write the end-to-end tests. — *Claude*',
    },
  }),
)

await json(
  claude.notes.$post({
    json: {
      title: 'Meeting notes',
      tags: ['meetings'],
      content:
        '## Decisions\n\n- Use **SQLite** for metadata\n- Keep notes as Markdown files\n\n> [!NOTE]\n> Related: [[Tandem]]\n',
    },
  }),
)

const ideas = await json(owner.folders.$post({ json: { title: 'Ideas' } }))
await json(
  owner.notes.$post({
    json: {
      parentId: ideas.id,
      title: 'Reading list',
      content:
        '- *The Pragmatic Programmer*\n- *A Philosophy of Software Design*\n- *Désapprendre* (en français)\n',
      tags: ['books'],
    },
  }),
)

console.log(`Seeded ${baseUrl}`)
