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
      'x-myfluence-author': author,
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
})
