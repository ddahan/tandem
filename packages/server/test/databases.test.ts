import { describe, expect, it } from 'vitest'
import { OWNER, databaseChanges, viewRows, type Database, type ServerEvent } from '@tandem/shared'
import { createApp } from '../src/app.ts'
import { createClient } from '../src/client.ts'
import { createTestVault } from './helpers.ts'

/** What undoing must put back as it was (not the times of changes). */
const view = (d: Database) => ({
  title: d.title,
  columns: d.columns,
  sort: d.sort,
  filters: d.filters,
  rows: d.rows.map((row) => ({ id: row.id, cells: row.cells, createdAt: row.createdAt })),
})

async function setup() {
  const test = await createTestVault()
  const page = await test.vault.createPage({ title: 'Books', content: 'Reading.', author: 'owner' })
  return { ...test, page }
}

describe('databases', () => {
  it('starts with a Name column and one empty row, listed with its page', async () => {
    const { vault, page } = await setup()
    const database = await vault.createDatabase(page.id, { title: 'Reading list' })
    expect(database.columns).toEqual([{ id: expect.any(String), name: 'Name', type: 'text' }])
    expect(database.rows).toHaveLength(1)
    // Ids are typed in commands: never one that reads as an option ("-…").
    for (const id of [database.id, database.columns[0]!.id, database.rows[0]!.id]) {
      expect(id).toMatch(/^[A-Za-z0-9]+$/)
    }
    expect(await vault.listDatabases(page.id)).toEqual([
      { id: database.id, title: 'Reading list', rowCount: 1 },
    ])
  })

  it('checks values against their column, and announces each change', async () => {
    const { vault, page } = await setup()
    const events: ServerEvent[] = []
    vault.events.on('event', (event) => events.push(event))
    let database = await vault.createDatabase(page.id, {
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Pages', type: 'number' },
        { name: 'Status', type: 'select', options: ['To read', 'Done'] },
      ],
    })
    const [name, pages, status] = database.columns
    const rowId = database.rows[0]!.id
    database = await vault.updateDatabaseRow(database.id, rowId, {
      [name!.id]: 'Dune',
      [pages!.id]: '412',
      [status!.id]: 'done',
    })
    expect(database.rows[0]!.cells).toEqual({
      [name!.id]: 'Dune',
      [pages!.id]: 412,
      [status!.id]: 'Done',
    })
    await expect(
      vault.updateDatabaseRow(database.id, rowId, { [pages!.id]: 'many' }),
    ).rejects.toThrow('Pages: “many” is not a number')
    await expect(
      vault.updateDatabaseRow(database.id, rowId, { [status!.id]: 'Lost' }),
    ).rejects.toThrow('Status: “Lost” is not one of To read, Done')
    // null empties a cell.
    database = await vault.updateDatabaseRow(database.id, rowId, { [pages!.id]: null })
    expect(database.rows[0]!.cells[pages!.id]).toBeUndefined()
    expect(events.filter((event) => event.type === 'database')).toHaveLength(3)
  })

  it('adds rows after another or last, and deletes them', async () => {
    const { vault, page } = await setup()
    let database = await vault.createDatabase(page.id)
    const name = database.columns[0]!.id
    const first = database.rows[0]!.id
    database = await vault.addDatabaseRow(database.id, { cells: { [name]: 'Last' } })
    database = await vault.addDatabaseRow(database.id, {
      cells: { [name]: 'Middle' },
      after: first,
    })
    expect(database.rows.map((row) => row.cells[name] ?? '')).toEqual(['', 'Middle', 'Last'])
    database = await vault.deleteDatabaseRow(database.id, first)
    expect(database.rows.map((row) => row.cells[name])).toEqual(['Middle', 'Last'])
  })

  it('moves rows: after another, or first', async () => {
    const { vault, page } = await setup()
    let database = await vault.createDatabase(page.id)
    const name = database.columns[0]!.id
    database = await vault.updateDatabaseRow(database.id, database.rows[0]!.id, { [name]: 'A' })
    for (const value of ['B', 'C']) {
      database = await vault.addDatabaseRow(database.id, { cells: { [name]: value } })
    }
    const [a, b, c] = database.rows.map((row) => row.id)
    const names = () => database.rows.map((row) => row.cells[name])
    database = await vault.moveDatabaseRow(database.id, c!, null)
    expect(names()).toEqual(['C', 'A', 'B'])
    database = await vault.moveDatabaseRow(database.id, c!, b!)
    expect(names()).toEqual(['A', 'B', 'C'])
    // Back and forth, many times: the order holds.
    for (let i = 0; i < 100; i++) {
      database = await vault.moveDatabaseRow(database.id, a!, i % 2 ? null : b!)
    }
    expect(names()).toEqual(['A', 'B', 'C'])
    await expect(vault.moveDatabaseRow(database.id, a!, 'nope')).rejects.toThrow('No such row')
    await expect(vault.moveDatabaseRow(database.id, 'nope', null)).rejects.toThrow('No such row')
  })

  it('converts values when a column changes type, and drops removed columns', async () => {
    const { vault, page } = await setup()
    let database = await vault.createDatabase(page.id, {
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Pages', type: 'text' },
        { name: 'Status', type: 'text' },
      ],
    })
    const [name, pages, status] = database.columns
    const rowId = database.rows[0]!.id
    await vault.updateDatabaseRow(database.id, rowId, {
      [name!.id]: 'Dune',
      [pages!.id]: '412',
      [status!.id]: 'Reading',
    })
    database = await vault.addDatabaseRow(database.id, {
      cells: { [name!.id]: 'Solaris', [pages!.id]: 'short', [status!.id]: 'Done' },
    })
    database = await vault.updateDatabase(database.id, {
      columns: [
        { id: name!.id, name: 'Title', type: 'text' },
        { id: pages!.id, name: 'Pages', type: 'number' },
        { id: status!.id, name: 'Status', type: 'select' },
        { name: 'Owned', type: 'checkbox' },
      ],
    })
    expect(database.columns.map((column) => column.name)).toEqual([
      'Title',
      'Pages',
      'Status',
      'Owned',
    ])
    // A new choice list takes its values as choices.
    expect(database.columns[2]!.options).toEqual(['Reading', 'Done'])
    expect(database.rows.map((row) => row.cells)).toEqual([
      { [name!.id]: 'Dune', [pages!.id]: 412, [status!.id]: 'Reading' },
      { [name!.id]: 'Solaris', [status!.id]: 'Done' },
    ])
    database = await vault.updateDatabase(database.id, {
      columns: [{ id: name!.id, name: 'Title', type: 'text' }],
    })
    expect(database.rows.map((row) => Object.keys(row.cells))).toEqual([[name!.id], [name!.id]])
  })

  it('keeps a valid view: sort and filters on existing columns', async () => {
    const { vault, page } = await setup()
    let database = await vault.createDatabase(page.id, {
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Pages', type: 'number' },
      ],
    })
    const [name, pages] = database.columns
    await vault.updateDatabaseRow(database.id, database.rows[0]!.id, {
      [name!.id]: 'Short',
      [pages!.id]: 90,
    })
    await vault.addDatabaseRow(database.id, { cells: { [name!.id]: 'Long', [pages!.id]: 900 } })
    database = await vault.updateDatabase(database.id, {
      sort: { column: pages!.id, direction: 'desc' },
      filters: [{ column: pages!.id, operator: 'gt', value: 50 }],
    })
    expect(viewRows(database).map((row) => row.cells[name!.id])).toEqual(['Long', 'Short'])
    await expect(
      vault.updateDatabase(database.id, { sort: { column: 'nope', direction: 'asc' } }),
    ).rejects.toThrow('no such column')
    // Removing the column removes the sort and filter on it.
    database = await vault.updateDatabase(database.id, {
      columns: [{ id: name!.id, name: 'Name', type: 'text' }],
    })
    expect(database.sort).toBeNull()
    expect(database.filters).toEqual([])
  })

  it('fills choice columns that require a value with the first choice', async () => {
    const { vault, page } = await setup()
    let database = await vault.createDatabase(page.id, {
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Status', type: 'select', options: ['To read', 'Done'] },
      ],
    })
    const [name, status] = database.columns
    database = await vault.addDatabaseRow(database.id, { cells: { [status!.id]: 'Done' } })
    expect(database.rows.map((row) => row.cells[status!.id] ?? null)).toEqual([null, 'Done'])

    // Required: the empty cell takes the first choice, new rows start with it.
    database = await vault.updateDatabase(database.id, {
      columns: [name!, { ...status!, allowEmpty: false }],
    })
    expect(database.columns[1]!.allowEmpty).toBe(false)
    expect(database.rows.map((row) => row.cells[status!.id])).toEqual(['To read', 'Done'])
    database = await vault.addDatabaseRow(database.id, { cells: { [name!.id]: 'Dune' } })
    expect(database.rows.at(-1)!.cells[status!.id]).toBe('To read')
    await expect(
      vault.updateDatabaseRow(database.id, database.rows[1]!.id, { [status!.id]: null }),
    ).rejects.toThrow("Status can't be empty")
    await expect(
      vault.updateDatabase(database.id, {
        columns: [name!, { ...status!, options: [], allowEmpty: false }],
      }),
    ).rejects.toThrow('a value is required, so it needs a choice')

    // Allowed again: cells can be emptied.
    database = await vault.updateDatabase(database.id, {
      columns: [name!, { ...status!, allowEmpty: true }],
    })
    expect(database.columns[1]!.allowEmpty).toBeUndefined()
    database = await vault.updateDatabaseRow(database.id, database.rows[1]!.id, {
      [status!.id]: null,
    })
    expect(database.rows[1]!.cells[status!.id]).toBeUndefined()
  })

  it('restores an earlier state, and the later one again (undo, redo)', async () => {
    const { vault, page } = await setup()
    let database = await vault.createDatabase(page.id, {
      title: 'Books',
      columns: [
        { name: 'Name', type: 'text' },
        { name: 'Pages', type: 'text' },
      ],
    })
    const [name, pages] = database.columns
    database = await vault.updateDatabaseRow(database.id, database.rows[0]!.id, {
      [name!.id]: 'Dune',
      [pages!.id]: '412 pages',
    })
    for (const title of ['Solaris', 'Ubik']) {
      database = await vault.addDatabaseRow(database.id, { cells: { [name!.id]: title } })
    }
    // Each change undone, then redone: the database is as it was each time.
    const changes: ((d: Database) => Promise<Database>)[] = [
      (d) => vault.updateDatabaseRow(d.id, d.rows[1]!.id, { [name!.id]: 'Solaris (1961)' }),
      (d) => vault.deleteDatabaseRow(d.id, d.rows[1]!.id),
      (d) => vault.addDatabaseRow(d.id, { after: d.rows[0]!.id }),
      (d) => vault.moveDatabaseRow(d.id, d.rows[2]!.id, null),
      (d) =>
        vault.updateDatabase(d.id, {
          title: 'Read',
          sort: { column: name!.id, direction: 'desc' },
          filters: [{ column: pages!.id, operator: 'not-empty' }],
        }),
      // Values lost by a type change or with their column come back.
      (d) => vault.updateDatabase(d.id, { columns: [name!, { ...pages!, type: 'number' }] }),
      (d) => vault.updateDatabase(d.id, { columns: [name!] }),
    ]
    for (const change of changes) {
      const before = await vault.getDatabase(database.id)
      const after = await change(before)
      expect(view(after)).not.toEqual(view(before))
      const undone = await vault.restoreDatabase(database.id, databaseChanges(after, before))
      expect(view(undone)).toEqual(view(before))
      const redone = await vault.restoreDatabase(database.id, databaseChanges(before, after))
      expect(view(redone)).toEqual(view(after))
      await vault.restoreDatabase(database.id, databaseChanges(after, before))
    }
  })

  it('keeps what others changed since when it restores', async () => {
    const { vault, page } = await setup()
    let database = await vault.createDatabase(page.id)
    const name = database.columns[0]!.id
    const first = database.rows[0]!.id
    const before = await vault.addDatabaseRow(database.id, { cells: { [name]: 'Mine' } })
    const after = await vault.deleteDatabaseRow(database.id, before.rows[1]!.id)
    // An agent adds a row and changes another, then the deleted row is put back.
    database = await vault.addDatabaseRow(database.id, { cells: { [name]: 'Agent' } })
    database = await vault.updateDatabaseRow(database.id, first, { [name]: 'Edited' })
    database = await vault.restoreDatabase(database.id, databaseChanges(after, before))
    expect(database.rows.map((row) => row.cells[name])).toEqual(['Edited', 'Mine', 'Agent'])
    // Undoing a change to a row since deleted by others doesn't bring it back.
    const unedited = database
    const edited = await vault.updateDatabaseRow(database.id, database.rows[2]!.id, {
      [name]: 'Agent 2',
    })
    await vault.deleteDatabaseRow(database.id, edited.rows[2]!.id)
    database = await vault.restoreDatabase(database.id, databaseChanges(edited, unedited))
    expect(database.rows.map((row) => row.cells[name])).toEqual(['Edited', 'Mine'])
  })

  it('keeps the width a column was resized to, within bounds', async () => {
    const { vault, page } = await setup()
    let database = await vault.createDatabase(page.id, {
      columns: [
        { name: 'Name', type: 'text', width: 320.4 },
        { name: 'Pages', type: 'number', width: 5 },
        { name: 'Notes', type: 'text', width: 99_999 },
        { name: 'Done', type: 'checkbox' },
      ],
    })
    expect(database.columns.map((column) => column.width)).toEqual([320, 60, 1200, undefined])
    // Back to the default: no width.
    database = await vault.updateDatabase(database.id, {
      columns: database.columns.map((column) => ({ ...column, width: undefined })),
    })
    expect(database.columns.some((column) => 'width' in column)).toBe(false)
  })

  it('refuses bad columns', async () => {
    const { vault, page } = await setup()
    const database = await vault.createDatabase(page.id)
    await expect(vault.updateDatabase(database.id, { columns: [] })).rejects.toThrow(
      'at least one column',
    )
    await expect(
      vault.updateDatabase(database.id, {
        columns: [
          { name: 'A', type: 'text' },
          { name: 'a', type: 'number' },
        ],
      }),
    ).rejects.toThrow('Two columns named')
    await expect(
      vault.updateDatabase(database.id, { columns: [{ id: 'ghost', name: 'A', type: 'text' }] }),
    ).rejects.toThrow('no such column')
  })

  it('goes to the trash with its page, comes back with it, and is deleted with it', async () => {
    const { vault, page } = await setup()
    const database = await vault.createDatabase(page.id)
    const { trashId } = await vault.remove(page.id)
    expect((await vault.getDatabase(database.id)).id).toBe(database.id)
    await vault.restoreFromTrash(trashId)
    expect(await vault.listDatabases(page.id)).toHaveLength(1)
    const again = await vault.remove(page.id)
    await vault.deleteFromTrash(again.trashId)
    await expect(vault.getDatabase(database.id)).rejects.toThrow('No such database')
  })

  it('is reachable through the API', async () => {
    const { vault, page } = await setup()
    const app = createApp(vault)
    const fetcher = ((...args: Parameters<typeof fetch>) => app.request(...args)) as typeof fetch
    const client = createClient('http://localhost', { author: OWNER, fetch: fetcher })
    const created = await client.notes[':id'].databases.$post({
      param: { id: page.id },
      json: { title: 'Books' },
    })
    expect(created.status).toBe(201)
    const database = await created.json()
    const name = database.columns[0]!.id
    const added = await client.databases[':id'].rows.$post({
      param: { id: database.id },
      json: { cells: { [name]: 'Dune' } },
    })
    const withDune = await added.json()
    expect(withDune.rows).toHaveLength(2)
    const bad = await client.databases[':id'].rows[':rowId'].$patch({
      param: { id: database.id, rowId: database.rows[0]!.id },
      json: { cells: { nope: 'x' } },
    })
    expect(bad.status).toBe(400)
    const moved = await client.databases[':id'].rows[':rowId'].move.$post({
      param: { id: database.id, rowId: withDune.rows[1]!.id },
      json: { after: null },
    })
    expect((await moved.json()).rows.map((row) => row.cells[name] ?? null)).toEqual(['Dune', null])
    const missing = await client.databases[':id'].$get({ param: { id: 'nope' } })
    expect(missing.status).toBe(404)
    const list = await client.notes[':id'].databases.$get({ param: { id: page.id } })
    expect(await list.json()).toEqual([{ id: database.id, title: 'Books', rowCount: 2 }])
  })
})
