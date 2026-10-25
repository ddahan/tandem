import { describe, expect, it } from 'vitest'
import { BOOKMARKS_OFF, type Bookmark } from '@tandem/shared'
import {
  DEFAULT_ADDRESS,
  TandemError,
  createTandem,
  folderPath,
  normalizeAddress,
} from '../src/tandem.ts'

function bookmark(fields: Partial<Bookmark>): Bookmark {
  return {
    id: 'b1',
    kind: 'bookmark',
    parentId: null,
    title: 'Example',
    url: 'https://example.com/',
    description: '',
    icon: null,
    emoji: null,
    position: 1,
    createdAt: 0,
    updatedAt: 0,
    ...fields,
  }
}

/** A fake Tandem: answers by method and path. */
function fake(answers: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    const answer = answers[`${init?.method ?? 'GET'} ${path.split('?')[0]}`]
    if (!answer) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 })
  }) as typeof fetch
  return { fetcher, calls }
}

describe('the extension’s Tandem client', () => {
  it('normalizes addresses', () => {
    expect(normalizeAddress('')).toBe(DEFAULT_ADDRESS)
    expect(normalizeAddress(' localhost:3000/ ')).toBe('http://localhost:3000')
    expect(normalizeAddress('https://127.0.0.1:3864')).toBe('https://127.0.0.1:3864')
  })

  it('reads the status, the bookmarks, a page’s bookmark and searches', async () => {
    const found = bookmark({})
    const { fetcher, calls } = fake({
      'GET /api/bookmarks/status': { body: { enabled: true } },
      'GET /api/bookmarks': { body: [found] },
      'GET /api/bookmarks/lookup': { body: { bookmark: found } },
      'GET /api/bookmarks/search': { body: [{ bookmark: found, titleHtml: 'Ex', folders: '' }] },
    })
    const tandem = createTandem('localhost:3864', fetcher)
    expect(tandem.address).toBe('http://localhost:3864')
    expect(await tandem.enabled()).toBe(true)
    expect(await tandem.list()).toEqual([found])
    expect(await tandem.lookup('https://example.com/?a=1&b')).toEqual(found)
    expect(calls.at(-1)?.url).toBe(
      'http://localhost:3864/api/bookmarks/lookup?url=https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b',
    )
    expect((await tandem.search('ex a', 3))[0]?.bookmark).toEqual(found)
    expect(calls.at(-1)?.url).toContain('q=ex%20a&limit=3')
  })

  it('creates and changes bookmarks, and returns the page’s when it’s already saved', async () => {
    const created = bookmark({ id: 'new' })
    const existing = bookmark({ id: 'old' })
    const { fetcher, calls } = fake({
      'POST /api/bookmarks': { status: 201, body: created },
      'PATCH /api/bookmarks/old': { body: existing },
    })
    const tandem = createTandem(DEFAULT_ADDRESS, fetcher)
    const fields = { url: 'https://e.com', title: 'E', description: '' }
    expect(await tandem.create(fields)).toEqual({ bookmark: created, duplicate: false })
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(fields)
    expect(await tandem.update('old', { title: 'T' })).toEqual({
      bookmark: existing,
      duplicate: false,
    })

    const duplicate = createTandem(
      DEFAULT_ADDRESS,
      fake({
        'POST /api/bookmarks': { status: 409, body: { error: 'Already', bookmark: existing } },
      }).fetcher,
    )
    expect(await duplicate.create(fields)).toEqual({ bookmark: existing, duplicate: true })
  })

  it('tells Tandem not running, bookmarks off and other errors apart', async () => {
    const offline = createTandem(DEFAULT_ADDRESS, fake({}).fetcher)
    await expect(offline.enabled()).rejects.toMatchObject({
      problem: 'offline',
      message: 'Tandem isn’t running at http://localhost:3864.',
    })
    const off = createTandem(
      DEFAULT_ADDRESS,
      fake({ 'GET /api/bookmarks': { status: 409, body: { code: BOOKMARKS_OFF } } }).fetcher,
    )
    await expect(off.list()).rejects.toMatchObject({ problem: 'off' })
    const broken = createTandem(
      DEFAULT_ADDRESS,
      fake({
        'GET /api/bookmarks': { status: 500, body: null },
        'POST /api/bookmarks': { status: 400, body: { error: 'Bad address' } },
      }).fetcher,
    )
    await expect(broken.list()).rejects.toMatchObject({
      problem: 'error',
      message: 'Tandem answered with an error (500).',
    })
    const error = await broken
      .create({ url: 'x', title: '', description: '' })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TandemError)
    expect(error).toMatchObject({ message: 'Bad address', status: 400 })
  })

  it('names a bookmark’s folders', () => {
    const work = bookmark({ id: 'w', kind: 'folder', title: 'Work', position: 2 })
    const home = bookmark({ id: 'h', kind: 'folder', title: 'Home', position: 1 })
    const tools = bookmark({ id: 't', kind: 'folder', title: 'Tools', parentId: 'w' })
    const link = bookmark({ parentId: 't' })
    const all = [work, home, tools, link]
    expect(folderPath(all, link)).toBe('Work / Tools')
    expect(folderPath(all, bookmark({}))).toBe('Bookmarks')
  })
})
