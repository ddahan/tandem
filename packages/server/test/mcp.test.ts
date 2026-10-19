import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { createTestVault } from './helpers.ts'

async function call(
  app: ReturnType<typeof createApp>,
  method: string,
  params: unknown,
  author = 'claude',
) {
  const response = await app.request('/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-tandem-author': author,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return (await response.json()) as {
    result: { content?: { text: string }[]; tools?: { name: string }[]; isError?: boolean }
  }
}

function textOf(response: Awaited<ReturnType<typeof call>>): string {
  return response.result.content?.[0]?.text ?? ''
}

describe('MCP server', () => {
  it('lists tools', async () => {
    const { vault } = await createTestVault()
    const app = createApp(vault)
    const { result } = await call(app, 'tools/list', {})
    expect(result.tools?.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'search_notes',
        'read_note',
        'create_note',
        'append_to_note',
        'replace_in_note',
        'attach_file',
      ]),
    )
  })

  it('creates, edits, reads and searches notes as the named agent', async () => {
    const { vault } = await createTestVault()
    const app = createApp(vault)
    const tool = (name: string, args: Record<string, unknown>) =>
      call(app, 'tools/call', { name, arguments: args })

    await tool('create_folder', { title: 'Inbox' })
    const created = JSON.parse(
      textOf(
        await tool('create_note', {
          title: 'Plan',
          content: 'Step one',
          parent: 'Inbox',
          tags: ['ai'],
        }),
      ),
    )
    expect(created.path).toBe('Inbox/Plan.md')
    await tool('append_to_note', { note: 'Inbox/Plan', content: 'Step two' })
    await tool('replace_in_note', { note: 'Plan', find: 'one', replace: '1' })
    const read = textOf(await tool('read_note', { note: created.id }))
    expect(read).toContain('Step 1\n\nStep two')
    expect(read).toContain('tags: ai')
    expect(textOf(await tool('list_notes', {}))).toContain('Plan  (Inbox/Plan.md')
    const search = JSON.parse(textOf(await tool('search_notes', { query: 'step' })))
    expect(search.results[0].snippet).toContain('**Step**')
    expect((await vault.blame(created.id))[0]?.author).toBe('claude')

    const attach = textOf(
      await tool('attach_file', {
        note: 'Plan',
        fileName: 'pic.png',
        base64: 'AAEC',
        insert: true,
      }),
    )
    expect(attach).toBe('![pic.png](Plan.assets/pic.png)')

    await tool('set_icon', { note: 'Plan', emoji: '🗺️' })
    expect((await vault.getNode(created.id)).icon).toEqual({ type: 'emoji', emoji: '🗺️' })
    await tool('set_icon', { note: 'Plan' })
    expect((await vault.getNode(created.id)).icon).toBeNull()
  })

  it('returns errors as tool results', async () => {
    const { vault } = await createTestVault()
    const response = await call(createApp(vault), 'tools/call', {
      name: 'read_note',
      arguments: { note: 'Nope' },
    })
    expect(response.result.isError).toBe(true)
    expect(textOf(response)).toContain('No note or folder matches')
  })

  it('creates, reads and changes databases by column name', async () => {
    const { vault } = await createTestVault()
    const app = createApp(vault)
    const tool = (name: string, args: Record<string, unknown>) =>
      call(app, 'tools/call', { name, arguments: args })
    await vault.createPage({ title: 'Books', content: 'My books.', author: 'owner' })

    const created = await tool('create_database', {
      note: 'Books',
      title: 'Reading list',
      columns: [
        { name: 'Title', type: 'text' },
        { name: 'Pages', type: 'number' },
        { name: 'Status', type: 'select', choices: ['To read', 'Done'] },
      ],
      rows: [
        { Title: 'Dune', Pages: 412, Status: 'Done' },
        { title: 'Solaris', pages: '204' },
      ],
    })
    const { id } = JSON.parse(textOf(created)) as { id: string }
    // The block is in the note; the data is not.
    const note = await vault.getNote((await vault.resolveRef('Books')).id)
    expect(note.content).toBe(`My books.\n\n\`\`\`database\nid: ${id}\n\`\`\`\n`)
    expect(note.lastAuthor).toBe('claude')

    const listed = JSON.parse(textOf(await tool('list_databases', { note: 'Books' })))
    expect(listed).toEqual([
      {
        id,
        title: 'Reading list',
        columns: [
          { name: 'Title', type: 'text' },
          { name: 'Pages', type: 'number' },
          { name: 'Status', type: 'select', choices: ['To read', 'Done'] },
        ],
        rows: 2,
      },
    ])

    const added = JSON.parse(
      textOf(await tool('add_database_rows', { database: id, rows: [{ Title: 'Ubik' }] })),
    ) as { added: string[] }
    expect(added.added).toHaveLength(1)
    await tool('update_database_row', {
      database: id,
      row: added.added[0],
      values: { Status: 'to read', Pages: '1 234' },
    })
    const read = JSON.parse(textOf(await tool('read_database', { database: id })))
    expect(read.rows).toEqual([
      { id: expect.any(String), Title: 'Dune', Pages: 412, Status: 'Done' },
      { id: expect.any(String), Title: 'Solaris', Pages: 204, Status: null },
      { id: added.added[0], Title: 'Ubik', Pages: 1234, Status: 'To read' },
    ])

    const bad = await tool('update_database_row', {
      database: id,
      row: added.added[0],
      values: { Author: 'Dick' },
    })
    expect(bad.result.isError).toBe(true)
    expect(textOf(bad)).toBe('No column “Author” (columns: Title, Pages, Status)')

    await tool('delete_database_row', { database: id, row: added.added[0] })
    const after = JSON.parse(textOf(await tool('read_database', { database: id, all: true })))
    expect(after.rows).toHaveLength(2)
  })
})
