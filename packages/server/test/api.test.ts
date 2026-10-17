import { describe, expect, it } from 'vitest'
import { OWNER } from '@tandem/shared'
import { createApp } from '../src/app.ts'
import { createClient } from '../src/client.ts'
import { createTestVault } from './helpers.ts'

async function setup(author = OWNER) {
  const test = await createTestVault()
  const app = createApp(test.vault)
  const fetcher = ((...args: Parameters<typeof fetch>) => app.request(...args)) as typeof fetch
  const client = createClient('http://test', { author, fetch: fetcher })
  return { ...test, app, client }
}

describe('API', () => {
  it('creates, reads and saves notes, crediting the author header', async () => {
    const { client } = await setup('claude')
    const created = await (
      await client.notes.$post({ json: { title: 'Hello', content: 'Hi' } })
    ).json()
    const note = await (await client.notes[':id'].$get({ param: { id: created.id } })).json()
    expect(note).toMatchObject({ content: 'Hi', lastAuthor: 'claude' })
    const saved = await client.notes[':id'].content.$put({
      param: { id: created.id },
      json: { content: 'Hi there', baseHash: note.hash },
    })
    expect(saved.status).toBe(200)
  })

  it('returns conflicts with the current content', async () => {
    const { client } = await setup()
    const created = await (await client.notes.$post({ json: { title: 'N', content: 'a' } })).json()
    await client.notes[':id'].content.$put({ param: { id: created.id }, json: { content: 'b' } })
    const response = await client.notes[':id'].content.$put({
      param: { id: created.id },
      json: { content: 'c', baseHash: 'stale' },
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ current: { content: 'b' } })
  })

  it('maps errors to statuses', async () => {
    const { client } = await setup()
    expect((await client.notes[':id'].$get({ param: { id: 'missing' } })).status).toBe(404)
    const folder = await (await client.folders.$post({ json: { title: 'F' } })).json()
    expect((await client.notes[':id'].$get({ param: { id: folder.id } })).status).toBe(400)
    expect((await client.notes.$post({ json: { title: 3 as unknown as string } })).status).toBe(400)
  })

  it('uploads attachments and serves them, but never hidden files', async () => {
    const { client, app } = await setup()
    const page = await (await client.notes.$post({ json: { title: 'P' } })).json()
    const response = await client.notes[':id'].attachments.$post({
      param: { id: page.id },
      form: { file: new File(['hello'], 'hello world.txt', { type: 'text/plain' }) },
    })
    expect(response.status).toBe(201)
    const attachment = await response.json()
    expect(attachment).toMatchObject({
      name: 'hello world.txt',
      markdownPath: 'P.assets/hello%20world.txt',
    })
    const file = await app.request(`/files/${encodeURI(attachment.path)}`)
    expect(file.status).toBe(200)
    expect(await file.text()).toBe('hello')
    expect(file.headers.get('content-type')).toContain('text/plain')
    expect((await app.request('/files/.tandem/README.md')).status).toBe(404)
    expect((await app.request('/files/..%2F..%2Fetc%2Fpasswd')).status).toBe(404)
  })

  it('covers tree, move, tags, search, history, blame, trash and settings', async () => {
    const { client, clock, vault } = await setup()
    const a = await (
      await client.notes.$post({ json: { title: 'Alpha', content: 'Searchable words' } })
    ).json()
    const b = await (
      await client.notes.$post({ json: { title: 'Beta', content: 'See [[Alpha]]' } })
    ).json()
    expect((await (await client.tree.$get()).json()).length).toBe(2)
    await client.nodes[':id'].move.$post({ param: { id: b.id }, json: { parentId: a.id } })
    await client.notes[':id'].tags.$put({ param: { id: a.id }, json: { tags: ['x'] } })
    expect(await (await client.tags.$get()).json()).toEqual([{ tag: 'x', count: 1 }])
    const search = await (await client.search.$get({ query: { q: 'searchab' } })).json()
    expect(search.results[0]?.id).toBe(a.id)
    expect(
      (await (await client.notes[':id'].backlinks.$get({ param: { id: a.id } })).json())[0]?.id,
    ).toBe(b.id)
    expect(
      (await (await client.links.resolve.$get({ query: { target: 'alpha' } })).json()).node?.id,
    ).toBe(a.id)
    clock.advance(60_000)
    await vault.flushIdleSessions()
    const history = await (await client.notes[':id'].history.$get({ param: { id: a.id } })).json()
    expect(history).toHaveLength(1)
    const version = await (
      await client.versions[':id'].$get({ param: { id: history[0]!.id } })
    ).json()
    expect(version.content).toBe('Searchable words')
    expect(
      (await (await client.notes[':id'].blame.$get({ param: { id: a.id } })).json())[0]?.author,
    ).toBe(OWNER)
    await client.nodes[':id'].$patch({ param: { id: a.id }, json: { title: 'Gamma' } })
    expect((await (await client.resolve.$get({ query: { ref: 'Gamma' } })).json()).id).toBe(a.id)
    const { trashId } = await (await client.nodes[':id'].$delete({ param: { id: a.id } })).json()
    expect((await (await client.trash.$get()).json())[0]?.id).toBe(trashId)
    await client.trash[':id'].restore.$post({ param: { id: trashId } })
    expect((await (await client.trash.$delete()).json()).deleted).toBe(0)
    const settings = await (
      await client.settings.$patch({ json: { primaryColor: 'emerald' } })
    ).json()
    expect(
      (await (await client.settings.$patch({ json: { editorFontSize: 'large' } })).json())
        .editorFontSize,
    ).toBe('large')
    expect(
      (await client.settings.$patch({ json: { editorFontSize: 'huge' as 'large' } })).status,
    ).toBe(400)
    expect(
      (await (await client.settings.$patch({ json: { backgroundTone: 'paper' } })).json())
        .backgroundTone,
    ).toBe('paper')
    expect(settings.primaryColor).toBe('emerald')
    expect((await client.settings.$patch({ json: { primaryColor: 'Not a color!' } })).status).toBe(
      400,
    )
  })

  it('sets, serves and clears icons', async () => {
    const { client, app } = await setup()
    const page = await (await client.notes.$post({ json: { title: 'P' } })).json()
    const emoji = await (
      await client.nodes[':id'].icon.$put({ param: { id: page.id }, json: { emoji: '🎯' } })
    ).json()
    expect(emoji.icon).toEqual({ type: 'emoji', emoji: '🎯' })
    expect((await app.request(`/api/nodes/${page.id}/icon`)).status).toBe(404)

    const response = await client.nodes[':id'].icon.$post({
      param: { id: page.id },
      form: {
        file: new File([new Uint8Array([137, 80, 78, 71])], 'icon.png', { type: 'image/png' }),
      },
    })
    const image = await response.json()
    expect(image.icon).toMatchObject({ type: 'image' })
    const url = image.icon?.type === 'image' ? image.icon.url : ''
    const served = await app.request(url)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(served.headers.get('cache-control')).toContain('immutable')

    const bad = await client.nodes[':id'].icon.$post({
      param: { id: page.id },
      form: { file: new File(['x'], 'notes.txt') },
    })
    expect(bad.status).toBe(400)
    expect(
      (await (await client.nodes[':id'].icon.$delete({ param: { id: page.id } })).json()).icon,
    ).toBeNull()
  })

  it('streams events', async () => {
    const { app, vault } = await setup()
    const response = await app.request('/api/events')
    const reader = response.body!.getReader()
    await reader.read() // ping
    await vault.createFolder({ title: 'F' })
    const { value } = await reader.read()
    expect(new TextDecoder().decode(value)).toContain('"type":"tree"')
    await reader.cancel()
  })
})
