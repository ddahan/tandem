import { describe, expect, it } from 'vitest'
import { OWNER, bookmarkBlock, type SubtreeItems } from '@tandem/shared'
import { createApp } from '../src/app.ts'
import { createTestVault } from './helpers.ts'

describe('a page with its sub-pages', () => {
  it('lists what the side panel shows for each, in the tree’s order', async () => {
    const { vault } = await createTestVault()
    const { bookmark } = await vault.createBookmark({ url: 'https://docs.example.com' })
    const root = await vault.createPage({
      title: 'Projects',
      content: 'See [[Ideas]] and [[Nowhere]], then [[ideas]] again.',
      author: OWNER,
    })
    const ideas = await vault.createPage({ title: 'Ideas', content: 'Plain', author: OWNER })
    const first = await vault.createPage({
      parentId: root.id,
      title: 'First',
      content: `Read [the guide](https://guide.example.com).\n\n${bookmarkBlock(bookmark.id)}\n`,
      author: OWNER,
    })
    const database = await vault.createDatabase(first.id, { title: 'Tasks' })
    await vault.addDatabaseRow(database.id, {})
    await vault.appendContent(first.id, `\`\`\`database\nid: ${database.id}\n\`\`\``, OWNER)
    await vault.addAttachment(first.id, 'notes.txt', new TextEncoder().encode('hello'))
    const folder = await vault.createFolder({ parentId: root.id, title: 'Archive' })
    await vault.createPage({ parentId: folder.id, title: 'Old', content: '', author: OWNER })

    const { pages, truncated } = await vault.subtreeItems(root.id)
    expect(truncated).toBe(false)
    expect(pages.map((page) => [page.title, page.depth, page.kind])).toEqual([
      ['Projects', 0, 'page'],
      ['First', 1, 'page'],
      ['Archive', 1, 'folder'],
      ['Old', 2, 'page'],
    ])
    expect(pages[0]!.wikiLinks).toEqual([
      { target: 'Ideas', id: ideas.id, title: 'Ideas' },
      { target: 'Nowhere', id: null, title: 'Nowhere' },
    ])
    expect(pages[1]).toMatchObject({
      bookmarkIds: [bookmark.id],
      links: [{ text: 'the guide', url: 'https://guide.example.com/' }],
      attachments: [{ name: 'notes.txt', size: 5 }],
      databases: [{ id: database.id, title: 'Tasks', rowCount: 2 }],
    })
    expect(pages[2]).toMatchObject({ attachments: [], databases: [], wikiLinks: [] })

    // Through the API; an unknown page is a 404.
    const app = createApp(vault)
    const response = await app.request(`http://localhost/api/notes/${first.id}/subtree`)
    expect(((await response.json()) as SubtreeItems).pages).toHaveLength(1)
    expect((await app.request('http://localhost/api/notes/nope/subtree')).status).toBe(404)
  })
})
