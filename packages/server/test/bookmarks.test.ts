import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BOOKMARKS_OFF,
  EXTENSION_ORIGIN,
  OWNER,
  bookmarkBlock,
  type ServerEvent,
} from '@tandem/shared'
import { createApp } from '../src/app.ts'
import { createClient } from '../src/client.ts'
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

describe('bookmarks', () => {
  it('keeps bookmarks in folders, in order, and moves them', async () => {
    const { vault } = await createTestVault()
    const events: ServerEvent[] = []
    vault.events.on('event', (event) => events.push(event))
    const work = await vault.createBookmark({ kind: 'folder', title: 'Work' })
    const a = await vault.createBookmark({
      url: 'github.com/ddahan',
      title: 'GitHub',
      parentId: work.id,
    })
    const b = await vault.createBookmark({ url: 'https://example.com', parentId: work.id })
    const c = await vault.createBookmark({
      url: 'https://nuxt.com',
      title: 'Nuxt',
      parentId: work.id,
      index: 0,
    })
    expect(a).toMatchObject({ kind: 'bookmark', url: 'https://github.com/ddahan', title: 'GitHub' })
    // No title: the site's name.
    expect(b.title).toBe('example.com')
    const order = async () =>
      (await vault.listBookmarks()).filter((x) => x.parentId === work.id).map((x) => x.title)
    expect(await order()).toEqual(['Nuxt', 'GitHub', 'example.com'])
    expect(events.filter((event) => event.type === 'bookmarks')).toHaveLength(4)

    await vault.updateBookmark(c.id, { index: 2 })
    expect(await order()).toEqual(['GitHub', 'example.com', 'Nuxt'])
    const moved = await vault.updateBookmark(a.id, { parentId: null, title: '  GitHub  me ' })
    expect(moved).toMatchObject({ parentId: null, title: 'GitHub me' })
    expect(await order()).toEqual(['example.com', 'Nuxt'])
    const edited = await vault.updateBookmark(b.id, {
      url: 'http://example.org/x',
      description: 'An example',
    })
    expect(edited).toMatchObject({ url: 'http://example.org/x', description: 'An example' })
  })

  it('refuses what isn’t a bookmark: other schemes, folders inside themselves, empty names', async () => {
    const { vault } = await createTestVault()
    await expect(vault.createBookmark({ url: 'javascript:alert(1)' })).rejects.toThrow(
      'web address',
    )
    await expect(vault.createBookmark({ url: '' })).rejects.toThrow('web address')
    await expect(vault.createBookmark({ kind: 'folder', title: ' ' })).rejects.toThrow('name')
    const folder = await vault.createBookmark({ kind: 'folder', title: 'F' })
    const inner = await vault.createBookmark({ kind: 'folder', title: 'G', parentId: folder.id })
    const link = await vault.createBookmark({ url: 'https://a.com' })
    await expect(vault.updateBookmark(folder.id, { parentId: inner.id })).rejects.toThrow('itself')
    await expect(vault.createBookmark({ url: 'https://b.com', parentId: link.id })).rejects.toThrow(
      'folders only',
    )
    await expect(vault.createBookmark({ url: 'https://b.com', parentId: 'nope' })).rejects.toThrow(
      'No such folder',
    )
    await expect(vault.updateBookmark(link.id, { title: '' })).rejects.toThrow('empty')
    await expect(vault.updateBookmark(link.id, { url: 'ftp://x' })).rejects.toThrow('web address')
    await expect(vault.getBookmark('nope')).rejects.toThrow('No such bookmark')
  })

  it('finds duplicates by address, give or take www, the scheme, #… and a final /', async () => {
    const { vault } = await createTestVault()
    const first = await vault.createBookmark({ url: 'https://www.example.com/docs/' })
    expect(await vault.findBookmark('http://example.com/docs#intro')).toMatchObject({
      id: first.id,
    })
    expect(await vault.findBookmark('https://example.com/Docs')).toBeNull()
    expect(await vault.findBookmark('not a url at all ://')).toBeNull()
    await expect(vault.createBookmark({ url: 'example.com/docs' })).rejects.toMatchObject({
      name: 'DuplicateBookmarkError',
      bookmark: { id: first.id },
    })
    const other = await vault.createBookmark({ url: 'https://example.com/other' })
    await expect(
      vault.updateBookmark(other.id, { url: 'https://example.com/docs' }),
    ).rejects.toThrow('Already bookmarked')
    // Its own address again is fine.
    await vault.updateBookmark(first.id, { url: 'https://www.example.com/docs' })
  })

  it('searches titles, addresses and descriptions, as notes are searched', async () => {
    const { vault, clock } = await createTestVault()
    const tools = await vault.createBookmark({ kind: 'folder', title: 'Tools' })
    await vault.createBookmark({
      url: 'https://github.com',
      title: 'GitHub',
      description: 'Where the code lives',
      parentId: tools.id,
    })
    clock.advance(1000)
    await vault.createBookmark({
      url: 'https://www.lemonde.fr',
      title: 'Le Monde',
      description: 'Actualités',
    })
    clock.advance(1000)
    await vault.createBookmark({
      url: 'https://code.visualstudio.com',
      title: 'Visual Studio Code',
    })
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
    expect(await titles('in:Tools')).toEqual(['GitHub'])
    expect(await titles('code in:tools')).toEqual(['GitHub'])
    expect(await titles('tag:work')).toEqual([])
    // No words: the latest.
    expect(await titles('')).toEqual(['Visual Studio Code', 'Le Monde', 'GitHub'])
    expect(await titles('-monde')).toEqual(['Visual Studio Code', 'GitHub'])

    const [result] = await vault.searchBookmarks('vis')
    expect(result).toMatchObject({ titleHtml: '<mark>Visual</mark> Studio Code', folders: '' })
    const [github] = await vault.searchBookmarks('git')
    expect(github?.folders).toBe('Tools')
  })

  it('knows the pages showing a bookmark, and removes its cards when it is deleted', async () => {
    const { vault, dataDir, clock } = await createTestVault()
    const folder = await vault.createBookmark({ kind: 'folder', title: 'Docs' })
    const a = await vault.createBookmark({ url: 'https://a.com', title: 'A', parentId: folder.id })
    const b = await vault.createBookmark({ url: 'https://b.com', title: 'B' })
    const first = await vault.createPage({
      title: 'First',
      content: `Intro\n\n${bookmarkBlock(a.id)}\n\nMiddle\n\n${bookmarkBlock(b.id)}\n`,
      author: OWNER,
    })
    const second = await vault.createPage({
      title: 'Second',
      content: `${bookmarkBlock(a.id)}\n`,
      author: OWNER,
    })
    expect((await vault.bookmarkRefs(a.id)).map((page) => page.title)).toEqual(['First', 'Second'])
    // A folder: the pages of everything in it.
    expect((await vault.bookmarkRefs(folder.id)).map((page) => page.title)).toEqual([
      'First',
      'Second',
    ])
    expect((await vault.bookmarkRefs(b.id)).map((page) => page.title)).toEqual(['First'])

    clock.advance(1000)
    const result = await vault.deleteBookmark(folder.id, 'claude')
    expect(result.deleted).toBe(2)
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
    const a = await vault.createBookmark({ url: 'https://a.com' })
    const page = await vault.createPage({ title: 'P', content: bookmarkBlock(a.id), author: OWNER })
    expect(await vault.bookmarkRefs(a.id)).toHaveLength(1)
    const { trashId } = await vault.remove(page.id)
    expect(await vault.bookmarkRefs(a.id)).toHaveLength(0)
    await vault.restoreFromTrash(trashId)
    expect(await vault.bookmarkRefs(a.id)).toHaveLength(1)
    await vault.saveContent(page.id, 'No card', { author: OWNER })
    expect(await vault.bookmarkRefs(a.id)).toHaveLength(0)
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
    const site = await vault.createBookmark({ url: 'https://site.com/' })
    expect(site).toMatchObject({ title: 'Site & co', description: 'All about "sites"' })
    expect(requested.filter((url) => url === 'https://site.com/')).toHaveLength(2)
    expect(site.icon).toMatch(/^\/api\/bookmarks\/\w+\/icon\?v=bookmark-/)
    expect(requested).not.toContain('https://site.com/body.png')
    expect(await readFile(await vault.bookmarkIconFile(site.id))).toEqual(Buffer.from(PNG))

    const bare = await vault.createBookmark({ url: 'https://bare.com/' })
    expect(await vault.bookmarkIconFile(bare.id)).toMatch(/\.ico$/)
    const none = await vault.createBookmark({ url: 'https://nowhere.com/' })
    expect(none.icon).toBeNull()

    // Given (the extension), nothing is fetched; a title given is kept.
    const count = requested.length
    const given = await vault.createBookmark(
      { url: 'https://given.com/', title: 'Given', description: '' },
      { data: PNG, extension: 'png' },
    )
    expect(requested).toHaveLength(count)
    expect(given.title).toBe('Given')
    // Only the title missing: the page is read, not its favicon.
    await vault.createBookmark({ url: 'https://site.com/other' }, { data: PNG, extension: 'png' })
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

    const folder = await (
      await client.bookmarks.$post({ json: { kind: 'folder', title: 'Read later' } })
    ).json()
    const created = await client.bookmarks.$post({
      json: {
        url: 'https://example.com/a',
        title: 'A',
        description: 'Desc',
        parentId: folder.id,
        iconDataUrl: `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`,
      },
    })
    expect(created.status).toBe(201)
    const bookmark = await created.json()
    expect(bookmark).toMatchObject({ title: 'A', parentId: folder.id })

    const icon = await app.request(`http://localhost${bookmark.icon}`)
    expect(icon.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await icon.arrayBuffer())).toEqual(PNG)

    const duplicate = await client.bookmarks.$post({ json: { url: 'example.com/a/' } })
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toMatchObject({ bookmark: { id: bookmark.id } })

    expect(await (await client.bookmarks.$get()).json()).toHaveLength(2)
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
    ).toEqual([])
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
          body: JSON.stringify({ url: 'https://new.com' }),
        })
      ).status,
    ).toBe(201)

    const deleted = await client.bookmarks[':id'].$delete({ param: { id: folder.id } })
    expect(await deleted.json()).toEqual({ deleted: 2, pages: [] })
    expect((await client.bookmarks[':id'].$get({ param: { id: bookmark.id } })).status).toBe(404)
    expect((await app.request(`http://localhost${bookmark.icon}`)).status).toBe(404)
  })
})
