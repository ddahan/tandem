import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXTERNAL, OWNER } from '@tandem/shared'
import { ConflictError, NotFoundError, ValidationError } from '../src/vault/errors.ts'
import { rewriteAssetLinks } from '../src/vault/vault.ts'
import { createTestVault } from './helpers.ts'

describe('pages and folders', () => {
  it('creates pages as Markdown files, without front matter', async () => {
    const { vault, dataDir } = await createTestVault()
    const page = await vault.createPage({ title: 'Hello', content: '# Hi\n', author: OWNER })
    expect(page).toMatchObject({ kind: 'page', title: 'Hello', path: 'Hello.md', parentId: null })
    expect(await readFile(join(dataDir, 'Hello.md'), 'utf8')).toBe('# Hi\n')
    const note = await vault.getNote(page.id)
    expect(note.content).toBe('# Hi\n')
    expect(note.lastAuthor).toBe(OWNER)
  })

  it('nests child pages in a folder named after the parent page', async () => {
    const { vault, dataDir } = await createTestVault()
    const parent = await vault.createPage({ title: 'Projects', author: OWNER })
    const child = await vault.createPage({ parentId: parent.id, title: 'Tandem', author: OWNER })
    expect(child.path).toBe('Projects/Tandem.md')
    expect(child.parentId).toBe(parent.id)
    expect(existsSync(join(dataDir, 'Projects/Tandem.md'))).toBe(true)
    const tree = await vault.tree()
    expect(tree.map((n) => n.path).toSorted()).toEqual(['Projects.md', 'Projects/Tandem.md'])
  })

  it('creates folders and keeps titles unique among siblings (pages and folders alike)', async () => {
    const { vault } = await createTestVault()
    const folder = await vault.createFolder({ title: 'Archive' })
    expect(folder).toMatchObject({ kind: 'folder', path: 'Archive' })
    const page = await vault.createPage({ title: 'archive', author: OWNER })
    expect(page.title).toBe('archive 2')
    const inFolder = await vault.createPage({ parentId: folder.id, title: 'a/b', author: OWNER })
    expect(inFolder.path).toBe('Archive/a-b.md')
  })

  it('resolves references by id, path and title', async () => {
    const { vault } = await createTestVault()
    const a = await vault.createPage({ title: 'Alpha', author: OWNER })
    const folder = await vault.createFolder({ title: 'F' })
    const other = await vault.createFolder({ title: 'G' })
    await vault.createPage({ parentId: folder.id, title: 'Alpha', author: OWNER })
    await vault.createPage({ parentId: folder.id, title: 'Beta', author: OWNER })
    await vault.createPage({ parentId: other.id, title: 'Beta', author: OWNER })
    expect((await vault.resolveRef(a.id)).id).toBe(a.id)
    expect((await vault.resolveRef('Alpha.md')).id).toBe(a.id)
    expect((await vault.resolveRef('alpha')).id).toBe(a.id)
    expect((await vault.resolveRef('F/Alpha')).path).toBe('F/Alpha.md')
    await expect(vault.resolveRef('beta')).rejects.toThrow(ValidationError)
    await expect(vault.resolveRef('nothing')).rejects.toThrow(NotFoundError)
  })
})

describe('saving', () => {
  it('detects conflicts with the base hash', async () => {
    const { vault } = await createTestVault()
    const page = await vault.createPage({ title: 'N', content: 'one\n', author: OWNER })
    const { hash } = await vault.getNote(page.id)
    await vault.saveContent(page.id, 'two\n', { author: 'claude' })
    const error = await vault
      .saveContent(page.id, 'three\n', { author: OWNER, baseHash: hash })
      .catch((e) => e)
    expect(error).toBeInstanceOf(ConflictError)
    expect(error.current.content).toBe('two\n')
  })

  it('appends and replaces text for agents', async () => {
    const { vault } = await createTestVault()
    const page = await vault.createPage({ title: 'N', content: 'Intro', author: OWNER })
    await vault.appendContent(page.id, '## Next\nMore', 'claude')
    expect((await vault.getNote(page.id)).content).toBe('Intro\n\n## Next\nMore\n')
    const { count } = await vault.replaceText(page.id, 'More', 'Less', { author: 'claude' })
    expect(count).toBe(1)
    await expect(vault.replaceText(page.id, 'absent', 'x', { author: 'claude' })).rejects.toThrow(
      ValidationError,
    )
    await vault.appendContent(page.id, 'Less', 'claude')
    await expect(vault.replaceText(page.id, 'Less', 'x', { author: 'claude' })).rejects.toThrow(
      /2 times/,
    )
    expect(
      (await vault.replaceText(page.id, 'Less', 'x', { author: 'claude', all: true })).count,
    ).toBe(2)
  })

  it('tracks line authorship across authors', async () => {
    const { vault, clock } = await createTestVault()
    const page = await vault.createPage({ title: 'N', content: 'a\nb\n', author: OWNER })
    clock.advance(1000)
    await vault.saveContent(page.id, 'a\nb\nc by claude\n', { author: 'claude' })
    clock.advance(1000)
    // The editor re-serializes: `*` bullets become `-`, which isn't a real change.
    await vault.saveContent(page.id, 'a\nB\nc by claude\n', { author: OWNER })
    const blame = await vault.blame(page.id)
    expect(blame.map((r) => [r.start, r.count, r.author])).toEqual([
      [0, 1, OWNER],
      [1, 1, OWNER],
      [2, 1, 'claude'],
    ])
  })

  it('takes external edits into account, as the external author', async () => {
    const { vault, dataDir } = await createTestVault()
    const page = await vault.createPage({ title: 'N', content: 'a\n', author: OWNER })
    await writeFile(join(dataDir, 'N.md'), 'a\nfrom vim\n')
    const note = await vault.getNote(page.id)
    expect(note.content).toBe('a\nfrom vim\n')
    expect(note.lastAuthor).toBe(EXTERNAL)
    expect((await vault.blame(page.id)).at(-1)?.author).toBe(EXTERNAL)
  })
})

/** One author per line of the note. */
async function authors(vault: Awaited<ReturnType<typeof createTestVault>>['vault'], id: string) {
  return (await vault.blame(id)).flatMap((r) => Array.from({ length: r.count }, () => r.author))
}

describe('authorship of moved lines', () => {
  it('keeps the author of a block moved up or down (drag handle)', async () => {
    const { vault } = await createTestVault()
    const page = await vault.createPage({ title: 'N', content: 'Mine.\n', author: OWNER })
    await vault.saveContent(page.id, 'Mine.\n\nTheirs.\n', { author: 'claude' })
    await vault.saveContent(page.id, 'Theirs.\n\nMine.\n', { author: OWNER })
    // Line 1 is the blank line between them: its author doesn't matter.
    const textLines = async () => (await authors(vault, page.id)).filter((_, i) => i !== 1)
    expect(await textLines()).toEqual(['claude', OWNER])
    await vault.saveContent(page.id, 'Mine.\n\nTheirs.\n', { author: OWNER })
    expect(await textLines()).toEqual([OWNER, 'claude'])
  })

  it('keeps the authors of a numbered list when its items move (renumbering)', async () => {
    const { vault } = await createTestVault()
    const page = await vault.createPage({ title: 'N', content: '1. a\n2. b\n', author: OWNER })
    await vault.saveContent(page.id, '1. a\n2. b\n3. c\n', { author: 'claude' })
    await vault.saveContent(page.id, '1. c\n2. a\n3. b\n', { author: OWNER })
    expect(await authors(vault, page.id)).toEqual(['claude', OWNER, OWNER])
  })

  it('still gives new lines to their writer', async () => {
    const { vault } = await createTestVault()
    const page = await vault.createPage({ title: 'N', content: 'a\n', author: 'claude' })
    await vault.saveContent(page.id, 'b\na\n', { author: OWNER })
    expect(await authors(vault, page.id)).toEqual([OWNER, 'claude'])
  })
})

describe('authorship normalization', () => {
  it('ignores table padding and bullet style changes', async () => {
    const { normalizeLine } = await import('../src/vault/blame.ts')
    expect(normalizeLine('| a | b |')).toBe(normalizeLine('| a   | b    |'))
    expect(normalizeLine('| --- | --- |')).toBe(normalizeLine('| ----- | ------ |'))
    expect(normalizeLine('* item')).toBe(normalizeLine('- item'))
    expect(normalizeLine('snake\\_case')).toBe(normalizeLine('snake_case'))
    expect(normalizeLine('(&lt;/&gt; button)')).toBe(normalizeLine('(</> button)'))
    expect(normalizeLine('10. item')).toBe(normalizeLine('2. item'))
    expect(normalizeLine('  3) item')).toBe(normalizeLine('  1. item'))
  })
})

describe('renaming and moving', () => {
  it('renames files, attachments and links', async () => {
    const { vault, dataDir } = await createTestVault()
    const page = await vault.createPage({
      title: 'Old',
      content: '![x](Old.assets/a.png)\n',
      author: OWNER,
    })
    await vault.addAttachment(page.id, 'a.png', new Uint8Array([1, 2]))
    await vault.createPage({ parentId: page.id, title: 'Child', author: OWNER })
    const other = await vault.createPage({
      title: 'Other',
      content: 'See [[Old]], [[Old/Child|child]] and [[old#Top]].\n',
      author: OWNER,
    })
    await vault.rename(page.id, 'New name', 'owner')
    expect(existsSync(join(dataDir, 'New name.md'))).toBe(true)
    expect(existsSync(join(dataDir, 'New name.assets/a.png'))).toBe(true)
    expect(existsSync(join(dataDir, 'New name/Child.md'))).toBe(true)
    expect(existsSync(join(dataDir, 'Old.md'))).toBe(false)
    expect((await vault.getNote(page.id)).content).toBe('![x](New%20name.assets/a.png)\n')
    expect((await vault.getNote(other.id)).content).toBe(
      'See [[New name]], [[New name/Child|child]] and [[New name#Top]].\n',
    )
    expect((await vault.backlinks(page.id)).map((b) => b.title)).toEqual(['Other'])
  })

  it('handles case-only renames', async () => {
    const { vault, dataDir } = await createTestVault()
    const page = await vault.createPage({ title: 'note', author: OWNER })
    await vault.rename(page.id, 'Note', OWNER)
    expect((await vault.getNode(page.id)).path).toBe('Note.md')
    expect(existsSync(join(dataDir, 'Note.md'))).toBe(true)
  })

  it('refuses a name that is taken', async () => {
    const { vault } = await createTestVault()
    await vault.createPage({ title: 'A', author: OWNER })
    const b = await vault.createPage({ title: 'B', author: OWNER })
    await expect(vault.rename(b.id, 'a', OWNER)).rejects.toThrow(ConflictError)
  })

  it('moves and reorders, and refuses to move a node into itself', async () => {
    const { vault, dataDir } = await createTestVault()
    const a = await vault.createPage({ title: 'A', author: OWNER })
    const b = await vault.createPage({ title: 'B', author: OWNER })
    const c = await vault.createPage({ title: 'C', author: OWNER })
    await vault.move(c.id, { parentId: null, index: 0 }, OWNER)
    const order = (await vault.tree())
      .toSorted((x, y) => x.position - y.position)
      .map((n) => n.title)
    expect(order).toEqual(['C', 'A', 'B'])

    const child = await vault.createPage({ parentId: a.id, title: 'Child', author: OWNER })
    await vault.move(child.id, { parentId: b.id }, OWNER)
    expect((await vault.getNode(child.id)).path).toBe('B/Child.md')
    // A's children folder is gone with its last child.
    expect(existsSync(join(dataDir, 'A'))).toBe(false)
    await expect(vault.move(b.id, { parentId: child.id }, OWNER)).rejects.toThrow(ValidationError)
  })
})

describe('trash', () => {
  it('trashes a page with its children and attachments, and restores it', async () => {
    const { vault, dataDir } = await createTestVault()
    const page = await vault.createPage({ title: 'P', content: 'x', author: OWNER, tags: ['work'] })
    await vault.createPage({ parentId: page.id, title: 'Kid', author: OWNER })
    await vault.addAttachment(page.id, 'f.txt', new TextEncoder().encode('hi'))
    const { trashId } = await vault.remove(page.id)
    expect(existsSync(join(dataDir, 'P.md'))).toBe(false)
    expect(await vault.tree()).toEqual([])
    const [item] = await vault.trashList()
    expect(item).toMatchObject({ id: trashId, title: 'P', pageCount: 2 })

    const restored = await vault.restoreFromTrash(trashId)
    expect(restored.id).toBe(page.id)
    expect(existsSync(join(dataDir, 'P/Kid.md'))).toBe(true)
    expect(existsSync(join(dataDir, 'P.assets/f.txt'))).toBe(true)
    expect((await vault.getNote(page.id)).tags).toEqual(['work'])
    expect(await vault.trashList()).toEqual([])
  })

  it('restores under another name when the original is taken', async () => {
    const { vault } = await createTestVault()
    const page = await vault.createPage({ title: 'P', author: OWNER })
    const { trashId } = await vault.remove(page.id)
    await vault.createPage({ title: 'P', author: OWNER })
    expect((await vault.restoreFromTrash(trashId)).title).toBe('P (restored)')
  })

  it('deletes forever, with history', async () => {
    const { vault, dataDir, clock } = await createTestVault()
    const page = await vault.createPage({ title: 'P', content: 'v1', author: OWNER })
    clock.advance(60_000)
    await vault.flushIdleSessions()
    expect(existsSync(join(dataDir, '.tandem/history', page.id))).toBe(true)
    await vault.remove(page.id)
    expect(await vault.emptyTrash()).toBe(1)
    expect(existsSync(join(dataDir, '.tandem/history', page.id))).toBe(false)
    expect(await vault.trashList()).toEqual([])
  })
})

describe('history', () => {
  it('snapshots at the end of each editing session and on author change', async () => {
    const { vault, clock } = await createTestVault()
    const page = await vault.createPage({ title: 'N', content: 'v1', author: OWNER })
    clock.advance(5_000)
    await vault.saveContent(page.id, 'v2', { author: OWNER })
    clock.advance(5_000)
    // Another author: the owner's session (v2) is snapshotted.
    await vault.saveContent(page.id, 'v3', { author: 'claude' })
    clock.advance(31_000)
    expect(await vault.flushIdleSessions()).toBe(1)
    const versions = await vault.history(page.id)
    expect(versions.map((v) => v.author)).toEqual(['claude', OWNER])
    expect((await vault.readVersion(versions[1]!.id)).content).toBe('v2')
  })

  it('restores a version, keeping the current one in history', async () => {
    const { vault, clock } = await createTestVault()
    const page = await vault.createPage({ title: 'N', content: 'old', author: OWNER })
    clock.advance(60_000)
    await vault.flushIdleSessions()
    const [old] = await vault.history(page.id)
    await vault.saveContent(page.id, 'new', { author: OWNER })
    await vault.restoreVersion(page.id, old!.id, OWNER)
    expect((await vault.getNote(page.id)).content).toBe('old')
    expect((await vault.history(page.id)).length).toBe(2)
  })

  it('thins out old versions', async () => {
    const { vault, clock } = await createTestVault()
    const page = await vault.createPage({ title: 'N', content: 'v0', author: OWNER })
    // 3 sessions a day for 20 days.
    for (let i = 1; i <= 60; i++) {
      clock.advance(8 * 3600_000)
      await vault.saveContent(page.id, `v${i}`, { author: OWNER })
    }
    clock.advance(60_000)
    await vault.flushIdleSessions()
    const before = (await vault.history(page.id)).length
    const removed = await vault.thinHistory()
    const after = await vault.history(page.id)
    expect(removed).toBeGreaterThan(0)
    expect(after.length).toBe(before - removed)
    // The last 7 days are complete.
    const recent = after.filter((v) => clock.now - v.createdAt < 7 * 86_400_000)
    expect(recent.length).toBeGreaterThanOrEqual(20)
  })
})

describe('folders, pages without content', () => {
  it('reads a folder as an empty page, and writing in it makes it one (same node)', async () => {
    const { vault, dataDir } = await createTestVault()
    const folder = await vault.createFolder({ title: 'Projects' })
    const child = await vault.createPage({ parentId: folder.id, title: 'Plan', author: OWNER })
    expect((await vault.getNode(folder.id)).empty).toBe(true)
    const note = await vault.getNote(folder.id)
    expect(note.content).toBe('')
    // Blank: still a folder, no file.
    await vault.saveContent(folder.id, '\n', { baseHash: note.hash, author: OWNER })
    expect(existsSync(join(dataDir, 'Projects.md'))).toBe(false)

    await vault.saveContent(folder.id, 'Goals\n', { baseHash: note.hash, author: OWNER })
    expect(await readFile(join(dataDir, 'Projects.md'), 'utf8')).toBe('Goals\n')
    const page = await vault.getNode(folder.id)
    expect(page).toMatchObject({ kind: 'page', path: 'Projects.md', empty: false })
    expect((await vault.getNode(child.id)).parentId).toBe(folder.id)
    expect((await vault.searchNotes('goals')).results.map((r) => r.id)).toEqual([folder.id])
    // The watcher's next pass agrees.
    await vault.reconcile()
    expect((await vault.getNode(folder.id)).kind).toBe('page')
  })

  it('makes a page with child pages a folder again when left blank, keeping its text in history', async () => {
    const { vault, dataDir } = await createTestVault()
    const page = await vault.createPage({ title: 'Area', content: 'Old text\n', author: OWNER })
    await vault.createPage({ parentId: page.id, title: 'Sub', author: OWNER })
    const note = await vault.getNote(page.id)
    await vault.saveContent(page.id, '', { baseHash: note.hash, author: OWNER })
    expect(existsSync(join(dataDir, 'Area.md'))).toBe(false)
    expect(await vault.getNode(page.id)).toMatchObject({
      kind: 'folder',
      path: 'Area',
      empty: true,
    })
    expect((await vault.searchNotes('old')).results).toEqual([])
    const [version] = await vault.history(page.id)
    expect((await vault.readVersion(version!.id)).content).toBe('Old text\n')
    await vault.reconcile()
    expect(await vault.getNode(page.id)).toMatchObject({ kind: 'folder', path: 'Area' })
    // Appending (an agent) makes it a page again.
    await vault.appendContent(page.id, 'Back', OWNER)
    expect(await readFile(join(dataDir, 'Area.md'), 'utf8')).toBe('Back\n')
  })

  it('keeps a blank page without child pages a page (an empty file)', async () => {
    const { vault, dataDir } = await createTestVault()
    const page = await vault.createPage({ title: 'Draft', content: 'x', author: OWNER })
    const note = await vault.getNote(page.id)
    await vault.saveContent(page.id, '', { baseHash: note.hash, author: OWNER })
    expect(await vault.getNode(page.id)).toMatchObject({ kind: 'page', empty: true })
    expect(await readFile(join(dataDir, 'Draft.md'), 'utf8')).toBe('')
  })

  it('resolves links to folders, and attaching to one makes it a page', async () => {
    const { vault } = await createTestVault()
    const folder = await vault.createFolder({ title: 'Box' })
    expect((await vault.resolveLink('Box'))?.id).toBe(folder.id)
    expect(await vault.attachments(folder.id)).toEqual([])
    expect(await vault.blame(folder.id)).toEqual([])
    await vault.addAttachment(folder.id, 'a.txt', new TextEncoder().encode('a'))
    expect((await vault.getNode(folder.id)).kind).toBe('page')
  })
})

describe('tags, links and attachments', () => {
  it('stores and counts tags', async () => {
    const { vault } = await createTestVault()
    const a = await vault.createPage({ title: 'A', author: OWNER })
    const b = await vault.createPage({ title: 'B', author: OWNER })
    expect(await vault.setTags(a.id, ['#work', 'ideas', 'work', ' '])).toEqual(['ideas', 'work'])
    await vault.setTags(b.id, ['work'])
    expect(await vault.listTags()).toEqual([
      { tag: 'ideas', count: 1 },
      { tag: 'work', count: 2 },
    ])
  })

  it('lists TODOs by page, updated with the content, without trashed pages', async () => {
    const { vault } = await createTestVault()
    const b = await vault.createPage({ title: 'B', content: 'TODO: second\n', author: OWNER })
    const a = await vault.createPage({
      title: 'A',
      content: 'Intro\n\nTODO: first\n\n`TODO: code`\n',
      author: OWNER,
    })
    await vault.createPage({ title: 'C', content: 'todo: lowercase\n', author: OWNER })
    expect(await vault.listTodos()).toEqual([
      { id: a.id, title: 'A', path: 'A.md', todos: [{ text: 'first', line: 3 }] },
      { id: b.id, title: 'B', path: 'B.md', todos: [{ text: 'second', line: 1 }] },
    ])
    const note = await vault.getNote(a.id)
    await vault.saveContent(a.id, 'Done\n', { baseHash: note.hash, author: OWNER })
    await vault.remove(b.id)
    expect(await vault.listTodos()).toEqual([])
  })

  it('resolves wiki links by path, then by title', async () => {
    const { vault } = await createTestVault()
    const folder = await vault.createFolder({ title: 'Deep' })
    const deep = await vault.createPage({ parentId: folder.id, title: 'Target', author: OWNER })
    const top = await vault.createPage({ title: 'Target', author: OWNER })
    expect((await vault.resolveLink('target'))?.id).toBe(top.id)
    expect((await vault.resolveLink('Deep/Target'))?.id).toBe(deep.id)
    expect(await vault.resolveLink('Missing')).toBeNull()
  })

  it('stores attachments with unique, safe names', async () => {
    const { vault } = await createTestVault()
    const page = await vault.createPage({ title: 'My note', author: OWNER })
    const first = await vault.addAttachment(page.id, 'Screen shot.PNG', new Uint8Array([1]))
    const second = await vault.addAttachment(page.id, 'screen shot.png', new Uint8Array([1]))
    expect(first).toMatchObject({
      name: 'Screen shot.png',
      markdownPath: 'My%20note.assets/Screen%20shot.png',
      path: 'My note.assets/Screen shot.png',
      isImage: true,
    })
    expect(second.name).toBe('screen shot 2.png')
    expect((await vault.attachments(page.id)).length).toBe(2)
  })

  it('rewrites attachment links', () => {
    expect(
      rewriteAssetLinks(
        '![a](My%20note.assets/x.png) <img src="My note.assets/y.png">',
        'My note',
        'B',
      ),
    ).toBe('![a](B.assets/x.png) <img src="B.assets/y.png">')
  })
})

describe('reconciling with the files', () => {
  it('picks up new, edited, moved and deleted files and folders', async () => {
    const { vault, dataDir } = await createTestVault()
    await mkdir(join(dataDir, 'Inbox'))
    await writeFile(join(dataDir, 'Inbox/From agent.md'), '# Agent note\n')
    await writeFile(join(dataDir, '.hidden.md'), 'ignored')
    await vault.reconcile()
    let tree = await vault.tree()
    expect(tree.map((n) => `${n.kind}:${n.path}`).toSorted()).toEqual([
      'folder:Inbox',
      'page:Inbox/From agent.md',
    ])
    const page = tree.find((n) => n.kind === 'page')!

    // Moved by hand: same content elsewhere keeps its id.
    await mkdir(join(dataDir, 'Done'))
    await writeFile(join(dataDir, 'Done/From agent.md'), '# Agent note\n')
    await rm(join(dataDir, 'Inbox/From agent.md'))
    await vault.reconcile()
    tree = await vault.tree()
    expect(tree.find((n) => n.id === page.id)?.path).toBe('Done/From agent.md')

    // Edited by hand.
    await writeFile(join(dataDir, 'Done/From agent.md'), '# Agent note\nEdited\n')
    await vault.reconcile()
    expect((await vault.getNote(page.id)).lastAuthor).toBe(EXTERNAL)
    expect((await vault.searchNotes('edited')).results.map((r) => r.id)).toEqual([page.id])

    // A page next to an existing folder takes it over.
    await writeFile(join(dataDir, 'Done.md'), '')
    await vault.reconcile()
    tree = await vault.tree()
    const done = tree.find((n) => n.path === 'Done.md')!
    expect(tree.find((n) => n.id === page.id)?.parentId).toBe(done.id)
    expect(tree.some((n) => n.kind === 'folder' && n.path === 'Done')).toBe(false)

    await rm(join(dataDir, 'Done'), { recursive: true })
    await vault.reconcile()
    expect((await vault.tree()).map((n) => n.path).toSorted()).toEqual(['Done.md', 'Inbox'])
  })
})

describe('icons', () => {
  it('sets emoji and image icons, replacing and clearing them', async () => {
    const { vault, dataDir, clock } = await createTestVault()
    const page = await vault.createPage({ title: 'P', author: OWNER })
    expect(page.icon).toBeNull()
    expect((await vault.setIconEmoji(page.id, ' 🚀 ')).icon).toEqual({ type: 'emoji', emoji: '🚀' })
    await expect(vault.setIconEmoji(page.id, 'not an emoji at all')).rejects.toThrow(
      ValidationError,
    )

    const withImage = await vault.setIconImage(page.id, 'logo.PNG', new Uint8Array([1, 2, 3]))
    expect(withImage.icon).toMatchObject({ type: 'image' })
    const first = await vault.iconFile(page.id)
    expect(existsSync(first)).toBe(true)
    clock.advance(1000)
    await vault.setIconImage(page.id, 'other.webp', new Uint8Array([4]))
    expect(existsSync(first)).toBe(false)
    await expect(vault.setIconImage(page.id, 'doc.pdf', new Uint8Array([1]))).rejects.toThrow(
      /must be an image/,
    )
    await expect(
      vault.setIconImage(page.id, 'big.png', new Uint8Array(6 * 1024 * 1024)),
    ).rejects.toThrow(/5 MB/)

    expect((await vault.clearIcon(page.id)).icon).toBeNull()
    expect(existsSync(join(dataDir, '.tandem/icons'))).toBe(true)
    await expect(vault.iconFile(page.id)).rejects.toThrow(NotFoundError)
  })

  it('keeps icons through renames, moves and the trash, and deletes them forever with the page', async () => {
    const { vault } = await createTestVault()
    const folder = await vault.createFolder({ title: 'F' })
    const page = await vault.createPage({ title: 'P', author: OWNER })
    await vault.setIconImage(page.id, 'i.png', new Uint8Array([1]))
    await vault.setIconEmoji(folder.id, '📁')
    await vault.rename(page.id, 'Q', OWNER)
    await vault.move(page.id, { parentId: folder.id }, OWNER)
    expect((await vault.getNode(page.id)).icon).toMatchObject({ type: 'image' })
    const file = await vault.iconFile(page.id)

    const { trashId } = await vault.remove(folder.id)
    await vault.restoreFromTrash(trashId)
    expect((await vault.getNode(folder.id)).icon).toEqual({ type: 'emoji', emoji: '📁' })
    expect(existsSync(file)).toBe(true)

    await vault.remove(folder.id)
    await vault.emptyTrash()
    expect(existsSync(file)).toBe(false)
  })

  it('shows icons in search results', async () => {
    const { vault } = await createTestVault()
    const page = await vault.createPage({ title: 'Iconic', content: 'words', author: OWNER })
    await vault.setIconEmoji(page.id, '✨')
    expect((await vault.searchNotes('iconic')).results[0]?.icon).toEqual({
      type: 'emoji',
      emoji: '✨',
    })
    expect((await vault.searchNotes('')).results[0]?.icon).toEqual({ type: 'emoji', emoji: '✨' })
  })
})

describe('settings', () => {
  it('merges stored settings with defaults', async () => {
    const { vault } = await createTestVault()
    expect((await vault.getSettings()).primaryColor).toBe('indigo')
    expect((await vault.getSettings()).workspaceName).toBe('Tandem')
    const updated = await vault.updateSettings({ primaryColor: 'emerald', displayName: 'David' })
    expect(updated).toMatchObject({
      primaryColor: 'emerald',
      displayName: 'David',
      neutralColor: 'zinc',
    })
  })

  it('reads a code theme saved before themes came in pairs as its pair', async () => {
    const { vault } = await createTestVault()
    await vault.updateSettings({ codeTheme: 'tomorrow-night-eighties' as 'tomorrow' })
    expect((await vault.getSettings()).codeTheme).toBe('tomorrow')
  })
})
