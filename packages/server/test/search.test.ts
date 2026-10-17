import { describe, expect, it } from 'vitest'
import { OWNER } from '@tandem/shared'
import { editDistance, parseQuery } from '../src/vault/search.ts'
import { markdownToText } from '../src/vault/text.ts'
import { createTestVault } from './helpers.ts'

describe('query parsing', () => {
  it('splits words, phrases, exclusions and filters', () => {
    expect(parseQuery('Été "data base" -draft tag:#work in:Projects/ x')).toEqual({
      words: ['ete', 'x'],
      phrases: ['data base'],
      excluded: ['draft'],
      tags: ['work'],
      folders: ['Projects'],
    })
  })

  it('measures edit distance with transpositions', () => {
    expect(editDistance('serveur', 'serveur', 2)).toBe(0)
    expect(editDistance('sevreur', 'serveur', 2)).toBe(1)
    expect(editDistance('abc', 'xyzabc', 1)).toBe(2)
  })
})

describe('plain text for the index', () => {
  it('removes Markdown syntax but keeps the words', () => {
    const text = markdownToText(
      '# Title\n> [!NOTE]\n> **Bold** and _it_ [link](http://x.y) ![alt](a.png) [[Target|label]]\n- [ ] task\n| a | b |\n|---|---|\n<details><summary>More</summary>x</details>',
    )
    expect(text).not.toMatch(/[#*_[\]|]/)
    for (const word of ['Title', 'Bold', 'it', 'link', 'alt', 'label', 'task', 'More'])
      expect(text).toContain(word)
    expect(text).not.toContain('http')
  })
})

async function seeded() {
  const test = await createTestVault()
  const { vault, clock } = test
  const db = await vault.createPage({
    title: 'Database notes',
    content: 'SQLite and the serveur.\n',
    author: OWNER,
    tags: ['tech'],
  })
  clock.advance(1000)
  const summer = await vault.createPage({
    title: 'Été',
    content: 'Vacances à la plage. Mention of database too.\n',
    author: OWNER,
  })
  const folder = await vault.createFolder({ title: 'Projects' })
  const project = await vault.createPage({
    parentId: folder.id,
    title: 'Roadmap',
    content: 'Draft roadmap with milestones.\n',
    author: OWNER,
    tags: ['work'],
  })
  await vault.addAttachment(project.id, 'budget-2026.xlsx', new Uint8Array([1]))
  return { ...test, ids: { db: db.id, summer: summer.id, project: project.id } }
}

describe('search', () => {
  it('matches prefixes without accents, titles first, with highlighted snippets', async () => {
    const { vault, ids } = await seeded()
    const { results } = await vault.searchNotes('datab')
    expect(results.map((r) => r.id)).toEqual([ids.db, ids.summer])
    expect((await vault.searchNotes('ete')).results[0]?.id).toBe(ids.summer)
    const snippet = (await vault.searchNotes('plage')).results[0]?.snippet
    expect(snippet).toContain('<mark>plage</mark>')
  })

  it('filters by tag and folder, and excludes words', async () => {
    const { vault, ids } = await seeded()
    expect((await vault.searchNotes('database tag:tech')).results.map((r) => r.id)).toEqual([
      ids.db,
    ])
    expect((await vault.searchNotes('roadmap in:projects')).results.map((r) => r.id)).toEqual([
      ids.project,
    ])
    expect((await vault.searchNotes('roadmap in:other')).results).toEqual([])
    expect((await vault.searchNotes('database -sqlite')).results.map((r) => r.id)).toEqual([
      ids.summer,
    ])
  })

  it('corrects typos', async () => {
    const { vault, ids } = await seeded()
    const response = await vault.searchNotes('milestnoes')
    expect(response.correctedQuery).toBe('milestones')
    expect(response.results.map((r) => r.id)).toEqual([ids.project])
  })

  it('finds words inside words, and attachment names', async () => {
    const { vault, ids } = await seeded()
    expect((await vault.searchNotes('base')).results.map((r) => r.id)).toContain(ids.db)
    const result = (await vault.searchNotes('budget')).results[0]
    expect(result?.id).toBe(ids.project)
    expect(result?.attachments).toEqual(['budget-2026.xlsx'])
  })

  it('lists notes matching only filters', async () => {
    const { vault, ids } = await seeded()
    expect((await vault.searchNotes('tag:work')).results.map((r) => r.id)).toEqual([ids.project])
    expect((await vault.searchNotes('in:Projects')).results.map((r) => r.id)).toEqual([ids.project])
    expect((await vault.searchNotes('tag:nothing')).results).toEqual([])
  })

  it('lists recent notes for an empty query', async () => {
    const { vault } = await seeded()
    const { results } = await vault.searchNotes('')
    expect(results).toHaveLength(3)
  })

  it('ranks recently updated notes higher among equal matches', async () => {
    const { vault, clock } = await createTestVault()
    const old = await vault.createPage({ title: 'A', content: 'apple tart\n', author: OWNER })
    clock.advance(365 * 86_400_000)
    const recent = await vault.createPage({ title: 'B', content: 'apple tart\n', author: OWNER })
    expect((await vault.searchNotes('apple')).results.map((r) => r.id)).toEqual([recent.id, old.id])
  })

  it('follows edits, removals and a full reindex', async () => {
    const { vault, ids } = await seeded()
    await vault.saveContent(ids.summer, 'Montagne cette année.\n', { author: OWNER })
    expect((await vault.searchNotes('plage')).results).toEqual([])
    expect((await vault.searchNotes('montagne')).results.map((r) => r.id)).toEqual([ids.summer])
    await vault.remove(ids.db)
    expect((await vault.searchNotes('sqlite')).results).toEqual([])
    await vault.reindexAll()
    expect((await vault.searchNotes('montagne')).results.map((r) => r.id)).toEqual([ids.summer])
    expect((await vault.searchNotes('budget')).results[0]?.attachments).toEqual([
      'budget-2026.xlsx',
    ])
  })

  it('escapes HTML in snippets', async () => {
    const { vault } = await createTestVault()
    await vault.createPage({
      title: 'X',
      content: 'unsafe <script>alert(1)</script> word\n',
      author: OWNER,
    })
    const snippet = (await vault.searchNotes('word')).results[0]?.snippet ?? ''
    expect(snippet).not.toContain('<script>')
  })
})
