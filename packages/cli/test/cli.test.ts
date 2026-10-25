import { describe, expect, it } from 'vitest'
import { createApp } from '@tandem/server/app'
import { createTestVault } from '../../server/test/helpers.ts'
import { run, type Io } from '../src/cli.ts'

async function cli(argv: string[], input = '') {
  let out = ''
  let err = ''
  const io: Io = {
    stdout: (t) => (out += t),
    stderr: (t) => (err += t),
    stdin: async () => input,
    stdinBytes: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]),
    readFile: async () => new TextEncoder().encode('file content'),
  }
  const code = await run(argv, io, {
    TANDEM_URL: 'http://localhost',
    TANDEM_AUTHOR: 'Claude Code',
  })
  return { code, out, err }
}

async function setup() {
  const test = await createTestVault()
  const app = createApp(test.vault)
  // The CLI's client uses the global fetch: route it to the app in memory.
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => app.request(...args)) as typeof fetch
  return test
}

describe('CLI', () => {
  it('prints help', async () => {
    await setup()
    const { code, out } = await cli(['--help'])
    expect(code).toBe(0)
    expect(out).toContain('Usage: tandem')
  })

  it('creates, appends, replaces and reads notes, as the given author', async () => {
    const { vault } = await setup()
    expect((await cli(['new', 'Inbox'])).out).toContain('Created Inbox.md')
    expect(
      (await cli(['new', 'Plan', 'Step one', '--parent', 'Inbox', '--tags', 'ai,todo'])).out,
    ).toContain('Created Inbox/Plan.md')
    await cli(['append', 'Plan'], 'Step two from stdin\n')
    await cli(['replace', 'Inbox/Plan', '--find', 'one', '--with', '1'])
    expect((await cli(['read', 'Plan'])).out).toBe('Step 1\n\nStep two from stdin\n')
    const meta = (await cli(['read', 'Plan', '--meta'])).out
    expect(meta).toContain('tags: ai, todo')
    const node = await vault.resolveRef('Plan')
    expect((await vault.blame(node.id))[0]?.author).toBe('claude-code')
  })

  it('searches, lists the tree and tags', async () => {
    await setup()
    await cli(['new', 'Roadmap', 'Milestones for the launch', '--tags', 'work'])
    const search = await cli(['search', 'milestnes'])
    expect(search.out).toContain('Showing results for "milestones"')
    expect(search.out).toContain('Roadmap')
    expect((await cli(['tree'])).out).toContain('└─ Roadmap')
    expect((await cli(['tags'])).out).toBe('work (1)\n')
    const json = JSON.parse((await cli(['search', 'launch', '--json'])).out)
    expect(json.results[0].title).toBe('Roadmap')
  })

  it('renames, moves, deletes and attaches', async () => {
    const { vault } = await setup()
    await cli(['new', 'A', 'x'])
    await cli(['new', 'F'])
    expect((await cli(['rename', 'A', 'B'])).out).toBe('Renamed to B.md\n')
    expect((await cli(['move', 'B', '--to', 'F'])).out).toBe('Moved to F/B.md\n')
    expect((await cli(['attach', 'B', '/tmp/report.pdf', '--insert'])).out).toBe(
      '[report.pdf](B.assets/report.pdf)\n',
    )
    expect((await cli(['read', 'B'])).out).toContain('[report.pdf](B.assets/report.pdf)')
    expect((await cli(['attach', 'B', '-', '--name', 'raw.png'])).out).toBe(
      '![raw.png](B.assets/raw.png)\n',
    )
    const raw = (await vault.attachments((await vault.resolveRef('B')).id)).find(
      (a) => a.name === 'raw.png',
    )
    expect(raw?.size).toBe(6)
    expect((await cli(['attach', 'B', '-'])).err).toContain('--name')
    expect((await cli(['icon', 'B', '📌'])).out).toBe('Icon of F/B.md: 📌\n')
    expect((await vault.resolveRef('B')).icon).toEqual({ type: 'emoji', emoji: '📌' })
    expect((await cli(['icon', 'B', '--clear'])).out).toBe('Removed the icon of F/B.md\n')
    expect((await cli(['delete', 'B'])).out).toBe('Moved F/B.md to the trash\n')
  })

  it('shows history and restores versions', async () => {
    const { vault, clock } = await setup()
    await cli(['new', 'N', 'v1'])
    clock.advance(60_000)
    await vault.flushIdleSessions()
    await cli(['write', 'N', 'v2'])
    const versionId = (await cli(['history', 'N'])).out.split(' ')[0]!
    expect((await cli(['version', versionId])).out).toBe('v1\n')
    await cli(['restore', 'N', versionId])
    expect((await cli(['read', 'N'])).out).toBe('v1\n')
  })

  it('reports errors with a non-zero exit code', async () => {
    await setup()
    const missing = await cli(['read', 'Nope'])
    expect(missing.code).toBe(1)
    expect(missing.err).toContain('No note or folder matches "Nope"')
    expect((await cli(['frobnicate'])).err).toContain('Unknown command')
    expect((await cli(['write', 'x'])).code).toBe(1)
    expect((await cli(['--bogus'])).code).toBe(2)
  })

  it('creates databases, adds and changes rows by column name, and reads them', async () => {
    await setup()
    await cli(['new', 'Books', 'My books.'])
    const created = await cli([
      'database-new',
      'Books',
      'Reading list',
      'Title:text',
      'Pages:number',
      'Status:select=To read|Done',
    ])
    expect(created.out).toContain('Created Reading list')
    const listed = await cli(['databases', 'Books'])
    expect(listed.out).toContain('Title: text · Pages: number · Status: select (To read, Done)')
    const id = /\(([^,]+), 1 rows\)/.exec(listed.out)?.[1] ?? ''

    const added = await cli(['row-add', id, 'Title=Dune', 'Pages=412', 'status=done'])
    const rowId = /Added row (\S+)/.exec(added.out)?.[1] ?? ''
    expect(rowId).not.toBe('')
    await cli(['row-set', id, rowId, 'Pages=1 234,5'])
    const read = await cli(['database', id])
    expect(read.out).toContain('| id | Title | Pages | Status |')
    expect(read.out).toContain(`| ${rowId} | Dune | 1\u202f234,5 | Done |`)

    const bad = await cli(['row-set', id, rowId, 'Author=Herbert'])
    expect(bad.code).toBe(1)
    expect(bad.err).toContain('No column “Author” (columns: Title, Pages, Status)')
    expect((await cli(['row-set', id, rowId, 'Pages=many'])).err).toContain(
      'Pages: “many” is not a number',
    )

    await cli(['row-delete', id, rowId])
    expect((await cli(['database', id, '--json'])).out).not.toContain('Dune')
  })

  it('reads and appends to a daily note', async () => {
    const { vault } = await setup()
    const added = await cli(['daily', '--date', '2026-10-21', 'Called the notary'])
    expect(added).toMatchObject({ code: 0, out: 'Appended to Calendar/2026-10-21.md\n' })
    const read = await cli(['daily', '--date', '2026-10-21'])
    expect(read.out).toBe('Calendar/2026-10-21.md\n---\nCalled the notary\n')
    const node = await vault.resolveRef('Calendar/2026-10-21')
    expect((await vault.getNote(node.id)).lastAuthor).toBe('claude-code')
  })

  it('reads, adds, changes and deletes events', async () => {
    const { vault } = await setup()
    expect((await cli(['agenda', '2026-10-21'])).out).toBe('No events.\n')
    const added = await cli(['event-add', '13:30-14:30', 'Lunch', '--date', '2026-10-21'])
    expect(added.code).toBe(0)
    const [event] = await vault.listEvents()
    expect(event).toMatchObject({ title: 'Lunch', start: '13:30', end: '14:30' })
    expect(added.out).toBe(`Added Lunch on 2026-10-21 (${event!.id})\n`)
    await cli([
      'event-add',
      'Gym',
      '--date',
      '2026-10-21',
      '--repeat',
      'weekly',
      '--until',
      '2026-12-31',
    ])
    expect((await cli(['agenda', '2026-10-21'])).out).toContain('- [ ] day Gym  (id ')
    expect((await cli(['daily', '--date', '2026-10-21'])).out).toContain('agenda:\n- [ ] day Gym')
    const node = await vault.calendarNote('2026-10-21', 'claude-code')
    expect((await cli(['read', node.id, '--meta'])).out).toContain('event [ ] 13:30 → 14:30 Lunch')
    expect((await cli(['event-set', event!.id, '15:00', '--day', '2026-10-22'])).code).toBe(0)
    expect(await vault.getEvent(event!.id)).toMatchObject({
      date: '2026-10-22',
      start: '15:00',
      end: null,
      title: 'Lunch',
    })
    await cli(['event-set', event!.id, '--time', 'day', '--title', 'Lunch out'])
    expect(await vault.getEvent(event!.id)).toMatchObject({ start: null, title: 'Lunch out' })
    const several = await cli(['agenda', '2026-10-21', '--to', '2026-10-28'])
    expect(several.out).toContain('(2026-10-28)')
    const gym = (await vault.listEvents()).find((e) => e.title === 'Gym')!
    expect((await cli(['event-delete', gym.id, '--date', '2026-10-28'])).out).toBe(
      `Deleted ${gym.id} on 2026-10-28\n`,
    )
    expect((await cli(['event-delete', event!.id])).code).toBe(0)
    expect((await cli(['event-set', gym.id])).code).toBe(1)
    expect((await cli(['event-set', gym.id, '--time', 'soon'])).code).toBe(1)
    expect((await cli(['event-add', 'Run', '--repeat', 'hourly'])).code).toBe(1)
    expect((await cli(['event-add'])).code).toBe(1)
  })

  it('lists, searches, adds, changes and deletes bookmarks', async () => {
    const { vault } = await setup()
    await cli(['new', 'Reading'])
    const added = await cli([
      'bookmark-add',
      'example.com/post',
      '--title',
      'A post',
      '--description',
      'Worth reading',
      '--folder',
      'Read/Later',
      '--note',
      'Reading',
    ])
    expect(added.code).toBe(0)
    expect(added.out).toContain('Bookmarked A post')
    expect(added.out).toContain('its card in Reading.md')
    const [folder, inner, bookmark] = await vault.listBookmarks()
    expect([folder?.title, inner?.title, bookmark?.url]).toEqual([
      'Read',
      'Later',
      'https://example.com/post',
    ])
    expect((await cli(['read', 'Reading', '--meta'])).out).toContain(
      `bookmark ${bookmark!.id}: A post <https://example.com/post>`,
    )
    // No title given, none read (no web in tests): the site's name.
    expect((await cli(['bookmark-add', 'https://other.org'])).out).toContain('Bookmarked other.org')
    const duplicate = await cli(['bookmark-add', 'http://www.example.com/post/'])
    expect(duplicate.code).toBe(1)
    expect(duplicate.err).toContain(`Already bookmarked: A post (${bookmark!.id})`)

    const tree = (await cli(['bookmarks'])).out
    expect(tree).toContain('├─ Read/')
    expect(tree).toContain('│  └─ Later/')
    expect(tree).toContain('A post  https://example.com/post')
    expect((await cli(['bookmarks', 'worth'])).out).toContain('Read / Later / A post')
    expect((await cli(['bookmarks', 'zzz'])).out).toContain('No bookmarks found.')

    expect((await cli(['bookmark-set', bookmark!.id])).err).toContain('Nothing to change')
    await cli([
      'bookmark-set',
      bookmark!.id,
      'https://example.com/v2',
      '--title',
      'V2',
      '--folder',
      '',
    ])
    expect(await vault.getBookmark(bookmark!.id)).toMatchObject({
      url: 'https://example.com/v2',
      title: 'V2',
      parentId: null,
    })

    // A bookmarks file, as it is (for `> bookmarks.html`): all, or a folder.
    const file = (await cli(['bookmarks-export'])).out
    expect(file).toMatch(/^<!DOCTYPE NETSCAPE-Bookmark-file-1>/)
    expect(file).toContain('<H3 ')
    expect(file).toContain('HREF="https://example.com/v2"')
    expect((await cli(['bookmarks-export', bookmark!.id])).out).not.toContain('<H3 ')
    expect((await cli(['bookmarks-export', 'nope'])).err).toContain('No such bookmark')

    const deleted = await cli(['bookmark-delete', bookmark!.id])
    expect(deleted.out).toContain('cards removed from Reading.md')
    expect((await cli(['read', 'Reading'])).out).toBe('\n')
    expect((await cli(['bookmark-delete', folder!.id])).out).toContain(
      'Deleted 2 bookmarks and folders',
    )
  })
})
