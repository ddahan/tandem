import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BOOKMARKS_OFF,
  EXTENSION_ORIGIN,
  OWNER,
  bookmarkBlock,
  type BookmarkImportResult,
  type ServerEvent,
} from '@tandem/shared'
import { openDatabase } from '../src/db/client.ts'
import { createApp } from '../src/app.ts'
import { createClient } from '../src/client.ts'
import { Vault, type BookmarkPlace } from '../src/vault/vault.ts'
import type { BookmarkInput } from '../src/vault/bookmarks.ts'
import type { Favicon } from '../src/vault/web-pages.ts'
import { createTestVault } from './helpers.ts'

/** A fake web: pages and files by URL. */
function fakeWeb(files: Record<string, { type: string; body: string | Uint8Array }>) {
  const requested: string[] = []
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input)
    requested.push(url)
    const file = files[url]
    if (!file)
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    return new Response(file.body, { headers: { 'content-type': file.type } })
  }) as typeof fetch
  return { fetcher, requested }
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

/** A new bookmark (or the one of its page), without what else `createBookmark` answers. */
async function add(
  vault: Vault,
  input: BookmarkInput,
  icon?: Favicon | null,
  place?: BookmarkPlace,
) {
  return (await vault.createBookmark(input, icon, place)).bookmark
}

describe('bookmarks', () => {
  it('keeps one bookmark per page, the latest first, and changes them', async () => {
    const { vault, clock } = await createTestVault()
    const events: ServerEvent[] = []
    vault.events.on('event', (event) => events.push(event))
    const a = await add(vault, { url: 'github.com/ddahan', title: 'GitHub' })
    clock.advance(1000)
    const b = await add(vault, { url: 'https://example.com' })
    expect(a).toMatchObject({ url: 'https://github.com/ddahan', title: 'GitHub', uses: 0 })
    // No title: the site's name.
    expect(b.title).toBe('example.com')
    expect((await vault.listBookmarks()).map((x) => x.title)).toEqual(['example.com', 'GitHub'])
    expect(events.filter((event) => event.type === 'bookmarks')).toHaveLength(2)

    const edited = await vault.updateBookmark(b.id, {
      url: 'http://example.org/x',
      description: 'An example',
      title: '  Example  site ',
    })
    expect(edited).toMatchObject({
      url: 'http://example.org/x',
      description: 'An example',
      title: 'Example site',
    })
  })

  it('refuses what isn’t a bookmark: other schemes, empty names', async () => {
    const { vault } = await createTestVault()
    await expect(vault.createBookmark({ url: 'javascript:alert(1)' })).rejects.toThrow(
      'web address',
    )
    await expect(vault.createBookmark({ url: '' })).rejects.toThrow('web address')
    const link = await add(vault, { url: 'https://a.com' })
    await expect(vault.updateBookmark(link.id, { title: '' })).rejects.toThrow('empty')
    await expect(vault.updateBookmark(link.id, { url: 'ftp://x' })).rejects.toThrow('web address')
    await expect(vault.getBookmark('nope')).rejects.toThrow('No such bookmark')
    await expect(vault.bookmarkRefs('nope')).rejects.toThrow('No such bookmark')
  })

  it('uses the bookmark of a page already saved (give or take www, the scheme, #…, a final /)', async () => {
    const { vault } = await createTestVault()
    const first = await vault.createBookmark({ url: 'https://www.example.com/docs/' })
    expect(first.created).toBe(true)
    expect(await vault.findBookmark('http://example.com/docs#intro')).toMatchObject({
      id: first.bookmark.id,
    })
    expect(await vault.findBookmark('https://example.com/Docs')).toBeNull()
    expect(await vault.findBookmark('not a url at all ://')).toBeNull()
    const again = await vault.createBookmark({ url: 'example.com/docs', title: 'Other name' })
    expect(again).toMatchObject({ created: false, bookmark: { id: first.bookmark.id } })
    // Kept as it was.
    expect(again.bookmark.title).toBe(first.bookmark.title)
    expect(await vault.listBookmarks()).toHaveLength(1)
    // Changing another one's address to it is refused, naming it.
    const other = await add(vault, { url: 'https://example.com/other' })
    await expect(
      vault.updateBookmark(other.id, { url: 'https://example.com/docs' }),
    ).rejects.toMatchObject({ name: 'DuplicateBookmarkError', bookmark: { id: first.bookmark.id } })
    // Its own address again is fine.
    await vault.updateBookmark(first.bookmark.id, { url: 'https://www.example.com/docs' })
  })

  it('searches titles, addresses and descriptions, as notes are searched', async () => {
    const { vault, clock } = await createTestVault()
    const github = await add(vault, {
      url: 'https://github.com',
      title: 'GitHub',
      description: 'Where the code lives',
    })
    await vault.createPage({ title: 'Tools', content: bookmarkBlock(github.id), author: OWNER })
    clock.advance(1000)
    await add(vault, {
      url: 'https://www.lemonde.fr',
      title: 'Le Monde',
      description: 'Actualités',
    })
    clock.advance(1000)
    await add(vault, { url: 'https://code.visualstudio.com', title: 'Visual Studio Code' })
    const titles = async (query: string) =>
      (await vault.searchBookmarks(query)).map((result) => result.bookmark.title)

    // Title matches first, then the address, then the description.
    expect(await titles('code')).toEqual(['Visual Studio Code', 'GitHub'])
    expect(await titles('git')).toEqual(['GitHub'])
    expect(await titles('lemonde')).toEqual(['Le Monde'])
    expect(await titles('actualites')).toEqual(['Le Monde'])
    // Inside a word, from 3 letters.
    expect(await titles('hub')).toEqual(['GitHub'])
    // A typo.
    expect(await titles('vsual')).toEqual(['Visual Studio Code'])
    expect(await titles('code -studio')).toEqual(['GitHub'])
    expect(await titles('"code lives"')).toEqual(['GitHub'])
    // in: the notes showing it.
    expect(await titles('in:Tools')).toEqual(['GitHub'])
    expect(await titles('code in:tools')).toEqual(['GitHub'])
    expect(await titles('in:Nowhere')).toEqual([])
    expect(await titles('tag:work')).toEqual([])
    // No words: the latest.
    expect(await titles('')).toEqual(['Visual Studio Code', 'Le Monde', 'GitHub'])
    expect(await titles('-monde')).toEqual(['Visual Studio Code', 'GitHub'])

    const [result] = await vault.searchBookmarks('vis')
    expect(result).toEqual({
      bookmark: expect.objectContaining({ title: 'Visual Studio Code' }),
      titleHtml: '<mark>Visual</mark> Studio Code',
    })
    expect((await vault.searchBookmarks('git'))[0]?.bookmark.uses).toBe(1)
  })

  it('counts the notes showing a bookmark, and removes its cards when it is deleted', async () => {
    const { vault, dataDir, clock } = await createTestVault()
    const a = await add(vault, { url: 'https://a.com', title: 'A' })
    clock.advance(1000)
    const b = await add(vault, { url: 'https://b.com', title: 'B' })
    const events: ServerEvent[] = []
    vault.events.on('event', (event) => events.push(event))
    const first = await vault.createPage({
      title: 'First',
      content: `Intro\n\n${bookmarkBlock(a.id)}\n\nMiddle\n\n${bookmarkBlock(b.id)}\n`,
      author: OWNER,
    })
    const second = await vault.createPage({
      title: 'Second',
      content: `${bookmarkBlock(a.id)}\n\n${bookmarkBlock(a.id)}\n`,
      author: OWNER,
    })
    // Its uses changed: announced.
    expect(events.filter((event) => event.type === 'bookmarks')).toHaveLength(2)
    expect((await vault.bookmarkRefs(a.id)).map((page) => page.title)).toEqual(['First', 'Second'])
    expect((await vault.getBookmark(a.id)).uses).toBe(2)
    expect((await vault.getBookmark(b.id)).uses).toBe(1)
    expect((await vault.listBookmarks()).map((x) => x.uses)).toEqual([1, 2])

    clock.advance(1000)
    const result = await vault.deleteBookmark(a.id, 'claude')
    expect(result.pages.map((page) => page.title)).toEqual(['First', 'Second'])
    expect(await readFile(join(dataDir, 'First.md'), 'utf8')).toBe(
      `Intro\n\nMiddle\n\n${bookmarkBlock(b.id)}\n`,
    )
    expect(await readFile(join(dataDir, 'Second.md'), 'utf8')).toBe('')
    expect((await vault.listBookmarks()).map((x) => x.title)).toEqual(['B'])
    // The version with the cards is in the history, the change credited to who deleted.
    const versions = await vault.history(first.id)
    expect((await vault.readVersion(versions[0]!.id)).content).toContain(bookmarkBlock(a.id))
    expect((await vault.getNote(second.id)).lastAuthor).toBe('claude')
    expect(await vault.bookmarkRefs(b.id)).toHaveLength(1)
  })

  it('forgets a page’s cards when it is edited, trashed or emptied, and back when restored', async () => {
    const { vault } = await createTestVault()
    const a = await add(vault, { url: 'https://a.com' })
    const page = await vault.createPage({ title: 'P', content: bookmarkBlock(a.id), author: OWNER })
    expect(await vault.bookmarkRefs(a.id)).toHaveLength(1)
    const { trashId } = await vault.remove(page.id)
    expect(await vault.bookmarkRefs(a.id)).toHaveLength(0)
    await vault.restoreFromTrash(trashId)
    expect(await vault.bookmarkRefs(a.id)).toHaveLength(1)
    await vault.saveContent(page.id, 'No card', { author: OWNER })
    expect(await vault.bookmarkRefs(a.id)).toHaveLength(0)
  })

  it('puts new cards in the inbox note (made when needed), or at the end of a note', async () => {
    const { vault, dataDir } = await createTestVault()
    expect(await vault.unsortedBookmarks()).toEqual({ noteId: null, bookmarks: [] })
    // Nothing asked: no card anywhere (the editor puts it), and no inbox made.
    await add(vault, { url: 'https://none.com' })
    expect((await vault.getSettings()).bookmarkInbox).toBeNull()

    const a = await add(vault, { url: 'https://a.com', title: 'A' }, undefined, { inbox: true })
    const inbox = (await vault.getSettings()).bookmarkInbox!
    expect((await vault.getNode(inbox)).path).toBe('Bookmarks.md')
    const b = await add(vault, { url: 'https://b.com', title: 'B' }, undefined, {
      inbox: true,
      author: 'claude',
    })
    // The latest at the start.
    expect(await readFile(join(dataDir, 'Bookmarks.md'), 'utf8')).toBe(
      `${bookmarkBlock(b.id)}\n\n${bookmarkBlock(a.id)}\n`,
    )
    expect((await vault.getNote(inbox)).lastAuthor).toBe('claude')
    const unsorted = await vault.unsortedBookmarks()
    expect(unsorted.noteId).toBe(inbox)
    expect(unsorted.bookmarks.map((x) => x.title)).toEqual(['B', 'A'])
    // Already there: not twice.
    await vault.createBookmark({ url: 'https://a.com' }, undefined, { inbox: true })
    expect((await vault.unsortedBookmarks()).bookmarks).toHaveLength(2)

    // Into a note: at its end, the page already saved used.
    const note = await vault.createPage({ title: 'Work', content: 'Text', author: OWNER })
    const again = await vault.createBookmark({ url: 'a.com' }, undefined, { noteId: note.id })
    expect(again).toMatchObject({ created: false, bookmark: { id: a.id, uses: 2 } })
    expect(await readFile(join(dataDir, 'Work.md'), 'utf8')).toBe(
      `Text\n\n${bookmarkBlock(a.id)}\n`,
    )

    // Sorted: out of the inbox, the bookmark kept.
    await vault.removeBookmarkCards(inbox, a.id, OWNER)
    expect((await vault.unsortedBookmarks()).bookmarks.map((x) => x.title)).toEqual(['B'])
    expect((await vault.getBookmark(a.id)).uses).toBe(1)
    // A note not showing it: unchanged.
    await vault.removeBookmarkCards(inbox, a.id, OWNER)

    // The inbox trashed: Unsorted is empty, and a new one is made when needed.
    await vault.remove(inbox)
    expect(await vault.unsortedBookmarks()).toEqual({ noteId: null, bookmarks: [] })
    await add(vault, { url: 'https://c.com' }, undefined, { inbox: true })
    const next = (await vault.getSettings()).bookmarkInbox!
    expect(next).not.toBe(inbox)
    expect((await vault.unsortedBookmarks()).bookmarks).toHaveLength(1)
  })

  it('reads favicons and page previews from the web, or takes the one given', async () => {
    const { fetcher, requested } = fakeWeb({
      'https://site.com/': {
        type: 'text/html; charset=utf-8',
        body: `<html><head><title>  Site &amp; co  </title>
          <meta name="description" content="All about &quot;sites&quot;">
          <link rel="mask-icon" href="/mask.svg">
          <link rel="shortcut icon" href="/static/icon.png">
          </head><body><link rel="icon" href="/body.png"></body></html>`,
      },
      'https://site.com/static/icon.png': { type: 'image/png', body: PNG },
      'https://bare.com/favicon.ico': { type: 'image/x-icon', body: PNG },
      'https://og.com/': {
        type: 'text/html',
        body: `<head><meta property="og:title" content="OG title"><meta property='og:description' content='OG &#233;t&#xE9;'></head>`,
      },
    })
    const { vault, dataDir } = await createTestVault({ fetch: fetcher })

    expect(await vault.previewPage('https://site.com/')).toEqual({
      url: 'https://site.com/',
      title: 'Site & co',
      description: 'All about "sites"',
    })
    expect(await vault.previewPage('https://og.com/')).toMatchObject({
      title: 'OG title',
      description: 'OG été',
    })
    expect(await vault.previewPage('https://nowhere.com/')).toMatchObject({ title: '' })

    // Its title, description and favicon, from one read of the page.
    const site = await add(vault, { url: 'https://site.com/' })
    expect(site).toMatchObject({ title: 'Site & co', description: 'All about "sites"' })
    expect(requested.filter((url) => url === 'https://site.com/')).toHaveLength(2)
    expect(site.icon).toMatch(/^\/api\/bookmarks\/\w+\/icon\?v=bookmark-/)
    expect(requested).not.toContain('https://site.com/body.png')
    expect(await readFile(await vault.bookmarkIconFile(site.id))).toEqual(Buffer.from(PNG))

    const bare = await add(vault, { url: 'https://bare.com/' })
    expect(await vault.bookmarkIconFile(bare.id)).toMatch(/\.ico$/)
    const none = await add(vault, { url: 'https://nowhere.com/' })
    expect(none.icon).toBeNull()

    // Given (the extension), nothing is fetched; a title given is kept.
    const count = requested.length
    const given = await add(
      vault,
      { url: 'https://given.com/', title: 'Given', description: '' },
      { data: PNG, extension: 'png' },
    )
    expect(requested).toHaveLength(count)
    expect(given.title).toBe('Given')
    // Only the title missing: the page is read, not its favicon.
    await add(vault, { url: 'https://site.com/other' }, { data: PNG, extension: 'png' })
    expect(requested.slice(count)).toEqual(['https://site.com/other'])
    expect(given.icon).not.toBeNull()

    // A new icon replaces the file; deleting the bookmark deletes it.
    const before = await vault.bookmarkIconFile(given.id)
    await vault.setBookmarkIcon(given.id, 'icon.ico', PNG)
    expect(existsSync(before)).toBe(false)
    await expect(vault.setBookmarkIcon(given.id, 'icon.exe', PNG)).rejects.toThrow('image')
    const after = await vault.bookmarkIconFile(given.id)
    await vault.deleteBookmark(given.id, OWNER)
    expect(existsSync(after)).toBe(false)
    expect(existsSync(join(dataDir, '.tandem', 'icons'))).toBe(true)
  })

  it('says where the extension is, when the app has it', async () => {
    const { vault, dataDir } = await createTestVault()
    const without = createApp(vault)
    expect(await (await without.request('http://localhost/api/extension')).json()).toEqual({
      folder: null,
    })
    await mkdir(join(dataDir, 'extension'))
    await writeFile(join(dataDir, 'extension', 'manifest.json'), '{}')
    const app = createApp(vault, { extensionDir: join(dataDir, 'extension') })
    expect(await (await app.request('http://localhost/api/extension')).json()).toEqual({
      folder: join(dataDir, 'extension'),
    })
  })

  it('is reachable through the API, and tells the extension when bookmarks are off', async () => {
    const { vault } = await createTestVault()
    const app = createApp(vault)
    const fetcher = ((...args: Parameters<typeof fetch>) => app.request(...args)) as typeof fetch
    const client = createClient('http://localhost', { author: OWNER, fetch: fetcher })

    const created = await client.bookmarks.$post({
      json: {
        url: 'https://example.com/a',
        title: 'A',
        description: 'Desc',
        inbox: true,
        iconDataUrl: `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`,
      },
    })
    expect(created.status).toBe(201)
    const bookmark = await created.json()
    expect(bookmark).toMatchObject({ title: 'A', uses: 1 })

    const icon = await app.request(`http://localhost${bookmark.icon}`)
    expect(icon.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await icon.arrayBuffer())).toEqual(PNG)

    // Already saved: its bookmark, not a new one.
    const duplicate = await client.bookmarks.$post({ json: { url: 'example.com/a/' } })
    expect(duplicate.status).toBe(200)
    expect(await duplicate.json()).toMatchObject({ id: bookmark.id })

    const unsorted = await (await client.bookmarks.unsorted.$get()).json()
    expect(unsorted.bookmarks.map((b) => b.id)).toEqual([bookmark.id])
    expect(await (await client.bookmarks.$get()).json()).toHaveLength(1)
    expect(
      await (
        await client.bookmarks.lookup.$get({ query: { url: 'https://example.com/a' } })
      ).json(),
    ).toMatchObject({ bookmark: { id: bookmark.id } })
    const found = await (await client.bookmarks.search.$get({ query: { q: 'desc' } })).json()
    expect(found.map((r) => r.bookmark.id)).toEqual([bookmark.id])
    const patched = await client.bookmarks[':id'].$patch({
      param: { id: bookmark.id },
      json: { title: 'B', iconDataUrl: 'data:image/x-icon;base64,AAAA' },
    })
    expect(await patched.json()).toMatchObject({ title: 'B' })
    expect((await client.bookmarks[':id'].$get({ param: { id: bookmark.id } })).status).toBe(200)
    expect(
      await (await client.bookmarks[':id'].refs.$get({ param: { id: bookmark.id } })).json(),
    ).toMatchObject([{ title: 'Bookmarks' }])
    // Its card taken out of the inbox note.
    const cards = client.bookmarks[':id'].cards[':noteId']
    const param = { id: bookmark.id, noteId: unsorted.noteId! }
    expect((await cards.$delete({ param })).status).toBe(200)
    expect((await (await client.bookmarks.unsorted.$get()).json()).bookmarks).toEqual([])
    // Without a fetcher (tests), a preview is empty; a non-web address is refused.
    expect(
      await (await client.bookmarks.preview.$post({ json: { url: 'https://example.com' } })).json(),
    ).toMatchObject({ title: '' })
    expect(
      (await client.bookmarks.preview.$post({ json: { url: 'javascript:alert(1)' } })).status,
    ).toBe(400)
    expect(
      (
        await client.bookmarks.$post({
          json: { url: 'https://x.com', iconDataUrl: 'data:text/html;base64,AA' },
        })
      ).status,
    ).toBe(400)

    // Bookmarks off (the default): the extension is told, the app and agents aren't stopped.
    expect(await (await client.bookmarks.status.$get()).json()).toEqual({ enabled: false })
    const fromExtension = (path: string, init: RequestInit = {}) =>
      app.request(`http://localhost/api${path}`, {
        ...init,
        headers: { origin: EXTENSION_ORIGIN, 'content-type': 'application/json', ...init.headers },
      })
    const off = await fromExtension('/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://new.com' }),
    })
    expect(off.status).toBe(409)
    expect(await off.json()).toMatchObject({ code: BOOKMARKS_OFF })
    expect((await fromExtension('/bookmarks/lookup?url=https://new.com')).status).toBe(409)
    expect((await fromExtension('/bookmarks/status')).status).toBe(200)
    await vault.updateSettings({ bookmarks: true })
    expect(await (await fromExtension('/bookmarks/status')).json()).toEqual({ enabled: true })
    expect(
      (
        await fromExtension('/bookmarks', {
          method: 'POST',
          body: JSON.stringify({ url: 'https://new.com', inbox: true }),
        })
      ).status,
    ).toBe(201)

    const deleted = await client.bookmarks[':id'].$delete({ param: { id: bookmark.id } })
    expect(await deleted.json()).toEqual({ pages: [] })
    expect((await client.bookmarks[':id'].$get({ param: { id: bookmark.id } })).status).toBe(404)
    expect((await app.request(`http://localhost${bookmark.icon}`)).status).toBe(404)
  })

  it('imports a browser’s tree into the inbox note, a heading per folder', async () => {
    const { vault, dataDir } = await createTestVault()
    await vault.updateSettings({ bookmarks: true })
    const app = createApp(vault)
    const already = await add(vault, {
      url: 'https://github.com',
      title: 'GitHub',
      description: '',
    })
    const send = async (children: unknown[]) => {
      const response = await app.request('http://localhost/api/bookmarks/import', {
        method: 'POST',
        headers: { origin: EXTENSION_ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ children }),
      })
      expect(response.status).toBe(200)
      return (await response.json()) as BookmarkImportResult
    }
    const events: ServerEvent[] = []
    vault.events.on('event', (event) => events.push(event))
    const icon = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
    const tree = [
      { title: 'Loose', url: 'https://loose.example.com' },
      {
        title: 'Bookmarks bar',
        children: [
          { title: 'Docs', url: 'https://docs.example.com', iconDataUrl: icon },
          { title: 'GitHub', url: 'https://www.github.com/' },
          { title: 'Tool', url: 'javascript:alert(1)' },
          { title: 'Work', children: [{ title: 'Board', url: 'https://board.example.com' }] },
          { title: 'Empty', children: [] },
        ],
      },
    ]
    const result = await send(tree)
    expect(result).toMatchObject({ bookmarks: 3, duplicates: 1, skipped: 1 })
    expect(result.noteId).toBe((await vault.getSettings()).bookmarkInbox)
    expect(events.filter((event) => event.type === 'bookmarks')).toHaveLength(1)

    const all = await vault.listBookmarks()
    const idOf = (title: string) => all.find((b) => b.title === title)!.id
    expect(await readFile(join(dataDir, 'Bookmarks.md'), 'utf8')).toBe(
      [
        bookmarkBlock(idOf('Loose')),
        '## Bookmarks bar',
        bookmarkBlock(idOf('Docs')),
        '## Bookmarks bar / Work',
        `${bookmarkBlock(idOf('Board'))}\n`,
      ].join('\n\n'),
    )
    const docs = all.find((b) => b.title === 'Docs')!
    const image = await app.request(`http://localhost${docs.icon}`)
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG)
    expect(all.find((b) => b.title === 'GitHub')!.id).toBe(already.id)

    // Again, with one more: only that one is added, at the end.
    tree[1]!.children![3]!.children!.push({ title: 'Wiki', url: 'https://wiki.example.com' })
    expect(await send(tree)).toMatchObject({ bookmarks: 1, duplicates: 4 })
    const wiki = (await vault.listBookmarks()).find((b) => b.title === 'Wiki')!
    const content = await readFile(join(dataDir, 'Bookmarks.md'), 'utf8')
    expect(content.endsWith(`\n\n## Bookmarks bar / Work\n\n${bookmarkBlock(wiki.id)}\n`)).toBe(
      true,
    )
    expect(await vault.listBookmarks()).toHaveLength(all.length + 1)
  })

  it('takes an icon chosen for a bookmark: an emoji, an image, or back to its favicon', async () => {
    const { vault } = await createTestVault()
    await vault.updateSettings({ bookmarks: true })
    const app = createApp(vault)
    const bookmark = await add(vault, { url: 'https://work.com', title: 'Work' })
    const call = (method: string, init: RequestInit = {}) =>
      app.request(`http://localhost/api/bookmarks/${bookmark.id}/icon`, { method, ...init })
    const json = { 'content-type': 'application/json' }

    const withEmoji = await call('PUT', { headers: json, body: JSON.stringify({ emoji: '📚' }) })
    expect(await withEmoji.json()).toMatchObject({ emoji: '📚', icon: null })
    expect(
      (await call('PUT', { headers: json, body: JSON.stringify({ emoji: 'not one at all' }) }))
        .status,
    ).toBe(400)

    // An image replaces the emoji, and is served.
    const form = new FormData()
    form.append('file', new File([PNG], 'work.png', { type: 'image/png' }))
    const withImage = (await (await call('POST', { body: form })).json()) as {
      icon: string
      emoji: string | null
    }
    expect(withImage.emoji).toBeNull()
    const image = await app.request(`http://localhost${withImage.icon}`)
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG)

    // The default again: no file left behind.
    expect(await (await call('DELETE')).json()).toMatchObject({ icon: null, emoji: null })
    expect((await app.request(`http://localhost${withImage.icon}`)).status).toBe(404)
  })

  it('exports them as a browser’s bookmarks file, the pages as folders: all, or a page’s', async () => {
    const { vault } = await createTestVault()
    await vault.updateSettings({ bookmarks: true })
    const app = createApp(vault)
    const docs = await add(
      vault,
      {
        url: 'https://docs.example.com/?a=1&b="2"',
        title: 'Docs <new>\nline',
        description: 'The  docs',
      },
      { data: PNG, extension: 'png' },
    )
    const board = await add(vault, { url: 'https://board.example.com', title: 'Board' })
    const top = await add(vault, { url: 'https://top.example.com', title: 'Top', description: '' })
    const work = await vault.createPage({
      title: 'Work & play',
      content: `${bookmarkBlock(docs.id)}\n\n${bookmarkBlock(board.id)}\n`,
      author: OWNER,
    })
    const inner = await vault.createPage({
      parentId: work.id,
      title: 'Inner',
      content: bookmarkBlock(top.id),
      author: OWNER,
    })
    await vault.createPage({ title: 'No cards', content: 'Text', author: OWNER })

    const response = await app.request('http://localhost/api/bookmarks/export')
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="tandem-bookmarks-\d{4}-\d{2}-\d{2}\.html"$/,
    )
    const html = await response.text()
    const at = Math.floor(docs.createdAt / 1000)
    const dates = `ADD_DATE="${at}" LAST_MODIFIED="${at}"`
    const icon = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
    // Chrome reads it line by line: one element per line, texts escaped, in the tree's order.
    expect(html).toBe(`<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ${dates}>Work &amp; play</H3>
    <DL><p>
        <DT><A HREF="https://docs.example.com/?a=1&amp;b=%222%22" ${dates} ICON="${icon}">Docs &lt;new&gt; line</A>
        <DD>The docs
        <DT><A HREF="https://board.example.com/" ${dates}>Board</A>
        <DT><H3 ${dates}>Inner</H3>
        <DL><p>
            <DT><A HREF="https://top.example.com/" ${dates}>Top</A>
        </DL><p>
    </DL><p>
</DL><p>
`)

    // A page alone: that page, with what is under it.
    const page = await (
      await app.request(`http://localhost/api/bookmarks/export?note=${inner.id}`)
    ).text()
    expect(page).toContain('>Inner</H3>')
    expect(page).not.toContain('Board')
    // A PNG saved as .ico is told as a PNG (Chrome only shows those); an ICO as one.
    const ico = new Uint8Array([0, 0, 1, 0, 1])
    const exported = async () =>
      (await app.request(`http://localhost/api/bookmarks/export?note=${work.id}`)).text()
    await vault.setBookmarkIcon(docs.id, 'icon.ico', PNG)
    expect(await exported()).toContain(`ICON="${icon}"`)
    await vault.setBookmarkIcon(docs.id, 'icon.ico', ico)
    expect(await exported()).toContain(
      `ICON="data:image/x-icon;base64,${Buffer.from(ico).toString('base64')}"`,
    )
    expect((await app.request('http://localhost/api/bookmarks/export?note=nope')).status).toBe(404)
  })

  it('turns the folders of before 0007 into page folders, each with a page of its bookmarks', async () => {
    // A database as it was before migration 0007, with folders.
    const temp = await mkdtemp(join(tmpdir(), 'tandem-legacy-'))
    const dataDir = join(temp, 'notes')
    await mkdir(join(dataDir, '.tandem', 'icons'), { recursive: true })
    const migrations = fileURLToPath(new URL('../drizzle', import.meta.url))
    const old = join(temp, 'drizzle')
    await cp(migrations, old, { recursive: true })
    const journal = JSON.parse(await readFile(join(old, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[]
    }
    journal.entries = journal.entries.filter((entry) => entry.tag < '0007')
    await writeFile(join(old, 'meta', '_journal.json'), JSON.stringify(journal))
    const path = join(temp, 'db.sqlite')
    const before = await openDatabase(path, undefined, { migrationsFolder: old })
    const insert = before.sqlite.prepare(
      'insert into bookmarks (id, kind, parent_id, title, url, url_key, description, icon, position, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)',
    )
    await writeFile(join(dataDir, '.tandem', 'icons', 'bookmark-F2-1.png'), PNG)
    insert.run('F1', 'folder', null, 'Work', '', '', '', 'emoji:💼', 2)
    insert.run('F2', 'folder', 'F1', 'Tools', '', '', '', 'image:bookmark-F2-1.png', 1)
    insert.run('F3', 'folder', null, 'Empty', '', '', '', null, 3)
    insert.run('B1', 'bookmark', null, 'Top', 'https://top.com/', 'top.com', '', null, 1)
    insert.run('B2', 'bookmark', 'F1', 'Board', 'https://board.com/', 'board.com', '', null, 2)
    insert.run('B3', 'bookmark', 'F2', 'Git', 'https://git.com/', 'git.com', '', null, 1)
    insert.run('B4', 'bookmark', 'F2', 'Shown', 'https://shown.com/', 'shown.com', '', null, 2)
    before.close()

    const database = await openDatabase(path)
    const vault = new Vault({ dataDir, database, now: () => 1000 })
    try {
      // A page already showing one, and a page named as a folder (used, not made again).
      await writeFile(join(dataDir, 'Elsewhere.md'), `${bookmarkBlock('B4')}\n`)
      await writeFile(join(dataDir, 'Work.md'), 'My work\n')
      await vault.reconcile()
      await vault.reindexAll()
      expect(await vault.listBookmarks()).toHaveLength(4)

      expect(await vault.convertLegacyBookmarks()).toEqual({ folders: 3, pages: 2, unsorted: 1 })
      const tree = await vault.tree()
      const node = (p: string) => tree.find((n) => n.path === p)
      expect(node('Work.md')?.icon).toEqual({ type: 'emoji', emoji: '💼' })
      expect(node('Work/Tools')).toMatchObject({ kind: 'folder' })
      expect(node('Work/Tools')?.icon).toMatchObject({ type: 'image' })
      expect(existsSync(join(dataDir, '.tandem', 'icons', 'bookmark-F2-1.png'))).toBe(false)
      expect(node('Empty')).toMatchObject({ kind: 'folder' })
      // Each folder's bookmarks in a Bookmarks page inside it (none for an empty one).
      expect(await readFile(join(dataDir, 'Work', 'Bookmarks.md'), 'utf8')).toBe(
        `${bookmarkBlock('B2')}\n`,
      )
      // B4 is shown by a note already: left there.
      expect(await readFile(join(dataDir, 'Work', 'Tools', 'Bookmarks.md'), 'utf8')).toBe(
        `${bookmarkBlock('B3')}\n`,
      )
      expect(node('Empty/Bookmarks.md')).toBeUndefined()
      // Those at the top: still to sort.
      expect(await readFile(join(dataDir, 'Bookmarks.md'), 'utf8')).toBe(`${bookmarkBlock('B1')}\n`)
      const unsorted = await vault.unsortedBookmarks()
      expect(unsorted.bookmarks.map((b) => b.id)).toEqual(['B1'])
      // Once.
      expect(await vault.convertLegacyBookmarks()).toBeNull()
    } finally {
      database.close()
      await rm(temp, { recursive: true, force: true })
    }
  })
})
