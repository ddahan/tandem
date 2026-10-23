import { describe, expect, it } from 'vitest'
import { countBookmarks, importSummary, toImportNodes, withIcons } from '../src/import.ts'

/** Chrome's tree: its root, the bookmarks bar, other bookmarks, mobile bookmarks. */
const tree = [
  {
    id: '0',
    title: '',
    syncing: false,
    children: [
      {
        id: '1',
        title: 'Bookmarks bar',
        syncing: false,
        children: [
          { id: '3', title: 'Docs', url: 'https://docs.example.com', syncing: false },
          {
            id: '4',
            title: 'Work',
            syncing: false,
            children: [
              { id: '5', title: 'Board', url: 'https://board.example.com', syncing: false },
            ],
          },
          { id: '6', title: 'Empty', syncing: false, children: [] },
        ],
      },
      { id: '2', title: 'Other bookmarks', syncing: false, children: [] },
    ],
  },
] as chrome.bookmarks.BookmarkTreeNode[]

describe('importing Chrome’s bookmarks', () => {
  it('takes its top folders with their content, leaving out those without bookmarks', () => {
    const nodes = toImportNodes(tree)
    expect(nodes).toEqual([
      {
        title: 'Bookmarks bar',
        children: [
          { title: 'Docs', url: 'https://docs.example.com' },
          { title: 'Work', children: [{ title: 'Board', url: 'https://board.example.com' }] },
          { title: 'Empty', children: [] },
        ],
      },
    ])
    expect(countBookmarks(nodes)).toBe(2)
  })

  it('adds each bookmark’s icon, but not Chrome’s generic one', async () => {
    const done: number[] = []
    const nodes = await withIcons(
      toImportNodes(tree),
      async (url) => (url.includes('docs') ? 'data:image/png;base64,AA==' : 'generic'),
      'generic',
      (count) => done.push(count),
    )
    expect(nodes[0]!.children![0]).toEqual({
      title: 'Docs',
      url: 'https://docs.example.com',
      iconDataUrl: 'data:image/png;base64,AA==',
    })
    expect(nodes[0]!.children![1]!.children![0]).not.toHaveProperty('iconDataUrl')
    expect(done).toEqual([1, 2])
  })

  it('says what it did', () => {
    const result = { folderId: 'f', folders: 3, bookmarks: 1, duplicates: 0, skipped: 0 }
    expect(importSummary(result)).toBe('Imported 1 bookmark into the “Chrome” folder.')
    expect(importSummary({ ...result, bookmarks: 1200, duplicates: 3, skipped: 1 })).toBe(
      'Imported 1\u202f200 bookmarks into the “Chrome” folder; 3 already in Tandem, 1 left out (not web pages).',
    )
    expect(importSummary({ ...result, bookmarks: 0, duplicates: 2 })).toBe(
      'Nothing new to import; 2 already in Tandem.',
    )
  })
})
