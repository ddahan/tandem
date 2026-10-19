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
    TANDEM_URL: 'http://test',
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
    expect((await cli(['folder', 'Inbox'])).out).toContain('Created Inbox/')
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
    await cli(['folder', 'F'])
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
})
