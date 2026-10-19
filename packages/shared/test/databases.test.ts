import { describe, expect, it } from 'vitest'
import {
  cellsByName,
  cellText,
  convertCell,
  databaseBlock,
  databaseIdsIn,
  rowsByName,
  toCellValue,
  viewRows,
  type Database,
  type DatabaseColumn,
  type DatabaseRow,
} from '../src/databases.ts'

const text: DatabaseColumn = { id: 't', name: 'Name', type: 'text' }
const number: DatabaseColumn = { id: 'n', name: 'Pages', type: 'number' }
const date: DatabaseColumn = { id: 'd', name: 'Read', type: 'date' }
const checkbox: DatabaseColumn = { id: 'c', name: 'Owned', type: 'checkbox' }
const select: DatabaseColumn = {
  id: 's',
  name: 'Status',
  type: 'select',
  options: ['To read', 'Reading', 'Done'],
}
const columns = [text, number, date, checkbox, select]
const byType = { text, number, date, checkbox, select }

describe('values', () => {
  it.each([
    ['number', '12,5', 12.5],
    ['number', '1 234', 1234],
    ['number', 'twelve', undefined],
    ['number', '', null],
    ['date', '17/10/2026', '2026-10-17'],
    ['date', '2026-10-17', '2026-10-17'],
    ['date', '31/02/2026', undefined],
    ['checkbox', 'yes', true],
    ['checkbox', 'no', false],
    ['checkbox', 'maybe', undefined],
    ['select', 'reading', 'Reading'],
    ['select', 'Lost', undefined],
    ['text', 42, '42'],
  ] as const)('reads a %s value: %j', (type, value, expected) => {
    expect(toCellValue(value, byType[type])).toBe(expected)
  })

  it('shows dates in French, checkboxes as a check', () => {
    expect(cellText('2026-10-17', date)).toBe('17/10/2026')
    expect(cellText(true, checkbox)).toBe('✓')
    expect(cellText(false, checkbox)).toBe('')
    expect(cellText(null, text)).toBe('')
  })

  it('keeps what it can when a column changes type', () => {
    expect(convertCell(12, number, text)).toBe('12')
    expect(convertCell('2026-10-17', date, text)).toBe('17/10/2026')
    expect(convertCell('12', text, number)).toBe(12)
    expect(convertCell('a lot', text, number)).toBeNull()
    expect(convertCell('17/10/2026', text, date)).toBe('2026-10-17')
    expect(convertCell(true, checkbox, text)).toBe('✓')
  })
})

const rowOf = (id: string, cells: DatabaseRow['cells']): DatabaseRow => ({
  id,
  cells,
  createdAt: 0,
  updatedAt: 0,
})
const ids = (database: Parameters<typeof viewRows>[0]) => viewRows(database).map((r) => r.id)

describe('views', () => {
  const rows = [
    rowOf('dune', { t: 'Dune', n: 412, d: '2026-10-12', c: true, s: 'Reading' }),
    rowOf('hail', { t: 'Project Hail Mary', n: 476, d: null, c: false, s: 'To read' }),
    rowOf('left', { t: 'The Left Hand of Darkness', n: 286, d: '2025-03-01', c: true, s: 'Done' }),
    rowOf('empty', { t: '' }),
  ]
  const view = { columns, rows, sort: null, filters: [] }

  it('keeps the rows in order without a sort or filter', () => {
    expect(ids(view)).toEqual(['dune', 'hail', 'left', 'empty'])
  })

  it.each([
    ['number', 'asc', ['left', 'dune', 'hail', 'empty']],
    ['number', 'desc', ['hail', 'dune', 'left', 'empty']],
    ['date', 'asc', ['left', 'dune', 'hail', 'empty']],
    ['date', 'desc', ['dune', 'left', 'hail', 'empty']],
    ['text', 'asc', ['dune', 'hail', 'left', 'empty']],
    ['select', 'asc', ['hail', 'dune', 'left', 'empty']],
  ] as const)('sorts by %s %s, empty values last', (type, direction, expected) => {
    expect(ids({ ...view, sort: { column: byType[type].id, direction } })).toEqual(expected)
  })

  it.each([
    [{ column: 't', operator: 'contains', value: 'hand' }, ['left']],
    [{ column: 's', operator: 'is', value: 'reading' }, ['dune']],
    [{ column: 's', operator: 'is-not', value: 'Done' }, ['dune', 'hail', 'empty']],
    [{ column: 'n', operator: 'gt', value: '400' }, ['dune', 'hail']],
    [{ column: 'd', operator: 'lt', value: '01/01/2026' }, ['left']],
    [{ column: 'c', operator: 'is', value: true }, ['dune', 'left']],
    [{ column: 'd', operator: 'empty' }, ['hail', 'empty']],
    [{ column: 'd', operator: 'not-empty' }, ['dune', 'left']],
    [{ column: 'gone', operator: 'empty' }, ['dune', 'hail', 'left', 'empty']],
  ] as const)('filters with %j', (filter, expected) => {
    expect(ids({ ...view, filters: [filter] })).toEqual(expected)
  })

  it('applies every filter, then sorts', () => {
    expect(
      ids({
        ...view,
        filters: [{ column: 'c', operator: 'is', value: true }],
        sort: { column: 'n', direction: 'desc' },
      }),
    ).toEqual(['dune', 'left'])
  })
})

describe('blocks', () => {
  it('finds the databases a note shows, in order', () => {
    const markdown = `Intro\n\n${databaseBlock('a1')}\n\nText\n\n\`\`\`js\nid: no\n\`\`\`\n\n${databaseBlock('b2')}\n`
    expect(databaseIdsIn(markdown)).toEqual(['a1', 'b2'])
  })
})

describe('for agents', () => {
  const database: Database = {
    id: 'db',
    nodeId: 'n',
    title: 'Books',
    columns: [text, number],
    sort: { column: 'n', direction: 'desc' },
    filters: [{ column: 'n', operator: 'gt', value: 100 }],
    rows: [
      { id: 'a', cells: { t: 'Short', n: 90 }, createdAt: 0, updatedAt: 0 },
      { id: 'b', cells: { t: 'Long', n: 900 }, createdAt: 0, updatedAt: 0 },
      { id: 'c', cells: { t: 'Medium' }, createdAt: 0, updatedAt: 0 },
    ],
    createdAt: 0,
    updatedAt: 0,
  }

  it('reads rows by column name, as the view shows them or all', () => {
    expect(rowsByName(database)).toEqual([{ id: 'b', Name: 'Long', Pages: 900 }])
    expect(rowsByName(database, true).map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(rowsByName(database, true)[2]).toEqual({ id: 'c', Name: 'Medium', Pages: null })
  })

  it('takes values by column name, in any case', () => {
    expect(cellsByName(database, { name: 'Dune', PAGES: '412' })).toEqual({ t: 'Dune', n: '412' })
    expect(() => cellsByName(database, { Author: 'x' })).toThrow(
      'No column “Author” (columns: Name, Pages)',
    )
  })
})
