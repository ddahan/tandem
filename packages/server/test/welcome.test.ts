// The welcome note: written once in a folder that never had notes, never again.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { welcome, WELCOME_AUTHOR, WELCOME_TITLE } from '../src/welcome.ts'
import { createTestVault } from './helpers.ts'

describe('welcome note', () => {
  it('writes a page, a page inside it and a database, by Tandem', async () => {
    const { vault, dataDir } = await createTestVault()
    const id = await welcome(vault, dataDir, 3864)
    expect(id).toBeTruthy()

    const note = await vault.getNote(id!)
    expect(note.node.title).toBe(WELCOME_TITLE)
    expect(note.node.icon).toEqual({ type: 'emoji', emoji: '👋' })
    expect(note.content).toContain('[[Scratchpad]]')
    expect(note.content).toContain('http://localhost:3864/mcp')
    expect((await vault.blame(id!)).every((range) => range.author === WELCOME_AUTHOR)).toBe(true)

    const tree = await vault.tree()
    expect(tree.find((n) => n.parentId === id)?.title).toBe('Scratchpad')
    const [database] = await vault.listDatabases(id!)
    expect(note.content).toContain(`id: ${database!.id}`)
    expect((await vault.getDatabase(database!.id)).rows).toHaveLength(5)
    // Something for the search to find, typo and all.
    const found = await vault.searchNotes('rokcet')
    expect(found.results.map((result) => result.title)).toContain('Scratchpad')
  })

  it('is written only once, even after it is deleted', async () => {
    const { vault, dataDir } = await createTestVault()
    const id = await welcome(vault, dataDir, 3864)
    await vault.remove(id!)
    const { id: trashId } = (await vault.trashList())[0]!
    await vault.deleteFromTrash(trashId)
    expect(await welcome(vault, dataDir, 3864)).toBeNull()
    expect(await vault.tree()).toEqual([])
  })

  it('leaves a folder that already has notes alone, for good', async () => {
    const { vault, dataDir } = await createTestVault()
    const mine = await vault.createPage({ title: 'Mine', author: 'owner' })
    expect(await welcome(vault, dataDir, 3864)).toBeNull()
    expect(existsSync(join(dataDir, '.tandem', 'welcomed'))).toBe(true)
    await vault.remove(mine.id)
    const { id: trashId } = (await vault.trashList())[0]!
    await vault.deleteFromTrash(trashId)
    expect(await welcome(vault, dataDir, 3864)).toBeNull()
  })
})
