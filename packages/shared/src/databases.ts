// Databases: tables whose rows live in SQLite, shown in a note by a `database` block. The types,
// how a value is read for a column type, and how a view (filter, then sort) picks and orders the
// rows: the web app shows what the agents' tools return.
import { formatMoney, formatNumber } from './format.ts'

export const COLUMN_TYPES = ['text', 'number', 'money', 'date', 'checkbox', 'select'] as const
export type ColumnType = (typeof COLUMN_TYPES)[number]

/** Colors a choice can have (none: no color). */
export const CHOICE_COLORS = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const
export type ChoiceColor = (typeof CHOICE_COLORS)[number]

export interface DatabaseColumn {
  /** Stable: renaming a column keeps its values. */
  id: string
  name: string
  type: ColumnType
  /** `select` columns: the choices, in order. */
  options?: string[]
  /** `select` columns: the colors of the choices that have one, by choice. */
  colors?: Record<string, ChoiceColor>
  /**
   * `select` columns: false when a value is required. New rows then start with the first
   * choice, and a cell can't be emptied. Absent: true.
   */
  allowEmpty?: boolean
  /** Its width in the table, in pixels, once resized (absent: a default for its type). */
  width?: number
}

/** Widths a column can be resized to, in pixels. */
export const COLUMN_WIDTH = { min: 60, max: 1200 } as const

/**
 * Text, a number, an amount in euros (a number, to the cent), a date (`2026-10-17`), a checkbox,
 * a choice; null when empty.
 */
export type CellValue = string | number | boolean | null

export interface DatabaseSort {
  column: string
  direction: 'asc' | 'desc'
}

export const FILTER_OPERATORS = [
  'contains',
  'is',
  'is-not',
  'gt',
  'lt',
  'empty',
  'not-empty',
] as const
export type FilterOperator = (typeof FILTER_OPERATORS)[number]

/** Rows shown: those matching every filter. */
export interface DatabaseFilter {
  column: string
  operator: FilterOperator
  value?: CellValue
}

export interface DatabaseRow {
  id: string
  cells: Record<string, CellValue>
  createdAt: number
  updatedAt: number
}

export interface Database {
  id: string
  /** The page it belongs to (it goes to the trash with it). */
  nodeId: string
  title: string
  columns: DatabaseColumn[]
  sort: DatabaseSort | null
  filters: DatabaseFilter[]
  /** In their order (the order of the table when nothing sorts it). */
  rows: DatabaseRow[]
  createdAt: number
  updatedAt: number
}

export interface DatabaseSummary {
  id: string
  title: string
  rowCount: number
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const FRENCH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const TRUE = new Set(['true', 'yes', 'oui', 'x', '1', 'done', '✓'])
const FALSE = new Set(['false', 'no', 'non', '0', ''])

/**
 * `value` as a value of a `type` column, or undefined when it can't be one. Lenient with what
 * people (and agents) write: `12,5`, `17/10/2026`, `yes`.
 */
export function toCellValue(value: unknown, column: DatabaseColumn): CellValue | undefined {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && !value.trim() && column.type !== 'text') return null
  switch (column.type) {
    case 'text':
      return typeof value === 'string' ? value : String(value)
    case 'number':
      return toNumber(value)
    case 'money': {
      // `12,50 €`, `€12.5`, `12.5 EUR`: rounded to the cent.
      const number = toNumber(typeof value === 'string' ? value.replace(/€|eur/gi, '') : value)
      return number === undefined ? undefined : Math.round(number * 100) / 100
    }
    case 'date': {
      if (typeof value !== 'string') return undefined
      const text = value.trim()
      const iso = DATE.exec(text)
      const french = FRENCH_DATE.exec(text)
      const [year, month, day] = iso
        ? [iso[1], iso[2], iso[3]]
        : french
          ? [french[3], french[2], french[1]]
          : []
      if (!year) return undefined
      const date = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
      const check = new Date(`${date}T00:00:00Z`)
      return Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== date
        ? undefined
        : date
    }
    case 'checkbox': {
      if (typeof value === 'boolean') return value
      const text = String(value).trim().toLowerCase()
      if (TRUE.has(text)) return true
      if (FALSE.has(text)) return false
      return undefined
    }
    case 'select': {
      const text = (typeof value === 'string' ? value : String(value)).trim()
      if (!text) return null
      return column.options?.find((option) => option.toLowerCase() === text.toLowerCase())
    }
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const number = Number(
    value
      .trim()
      .replace(/[\s ]/g, '')
      .replace(',', '.'),
  )
  return Number.isFinite(number) ? number : undefined
}

const isNumeric = (column: DatabaseColumn) => column.type === 'number' || column.type === 'money'

/** A `from` value for the `to` column (its type changed): what can be kept is, the rest empty. */
export function convertCell(
  value: CellValue | undefined,
  from: DatabaseColumn,
  to: DatabaseColumn,
): CellValue {
  if (value === null || value === undefined) return null
  if (to.type === 'text') return cellText(value, from) || null
  if (isNumeric(from) && isNumeric(to)) return toCellValue(value, to) ?? null
  return toCellValue(from.type === 'date' ? value : cellText(value, from), to) ?? null
}

/** `17/10/2026` for a stored `2026-10-17`. */
export function formatCellDate(value: string): string {
  const match = DATE.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

/**
 * The value as text: what a cell shows, what filters and agents read. Amounts have cents when
 * `cents` says so (`withCents`: the same for a whole column), else when they have some.
 */
export function cellText(
  value: CellValue | undefined,
  column: DatabaseColumn,
  cents?: boolean,
): string {
  if (value === null || value === undefined) return ''
  if (column.type === 'checkbox') return value ? '✓' : ''
  if (column.type === 'date' && typeof value === 'string') return formatCellDate(value)
  if (column.type === 'number' && typeof value === 'number') return formatNumber(value)
  if (column.type === 'money' && typeof value === 'number') return formatMoney(value, cents)
  return String(value)
}

/**
 * Whether a money column shows cents: on every row as soon as one amount has some, so that a
 * column's amounts always look alike.
 */
export function withCents(column: DatabaseColumn, rows: DatabaseRow[]): boolean {
  return (
    column.type === 'money' &&
    rows.some((row) => {
      const value = row.cells[column.id]
      return typeof value === 'number' && !Number.isInteger(value)
    })
  )
}

const isEmpty = (value: CellValue | undefined) =>
  value === null || value === undefined || value === '' || value === false

/** Orders two values of a column: empty ones last, whatever the direction. */
function compare(a: CellValue | undefined, b: CellValue | undefined, column: DatabaseColumn) {
  if (isNumeric(column)) return Number(a) - Number(b)
  if (column.type === 'checkbox') return Number(Boolean(a)) - Number(Boolean(b))
  if (column.type === 'select' && column.options) {
    return column.options.indexOf(String(a)) - column.options.indexOf(String(b))
  }
  return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' })
}

function matches(value: CellValue | undefined, filter: DatabaseFilter, column: DatabaseColumn) {
  switch (filter.operator) {
    case 'empty':
      return isEmpty(value)
    case 'not-empty':
      return !isEmpty(value)
    case 'contains':
      return cellText(value, column)
        .toLowerCase()
        .includes(String(filter.value ?? '').toLowerCase())
    case 'is':
    case 'is-not': {
      const wanted = toCellValue(filter.value, column) ?? null
      const same =
        column.type === 'checkbox'
          ? Boolean(value) === Boolean(wanted)
          : column.type === 'text' || column.type === 'select'
            ? String(value ?? '').toLowerCase() === String(wanted ?? '').toLowerCase()
            : (value ?? null) === wanted
      return filter.operator === 'is' ? same : !same
    }
    case 'gt':
    case 'lt': {
      const wanted = toCellValue(filter.value, column)
      if (isEmpty(value) || wanted === null || wanted === undefined) return false
      const order = compare(value, wanted, column)
      return filter.operator === 'gt' ? order > 0 : order < 0
    }
  }
}

/** The rows the view shows, in its order: filtered, then sorted (empty values last). */
export function viewRows(
  database: Pick<Database, 'columns' | 'rows' | 'sort' | 'filters'>,
): DatabaseRow[] {
  const columns = new Map(database.columns.map((column) => [column.id, column]))
  // A condition that needs a value (all but empty / not empty) applies once it has one: a new
  // filter doesn't hide every row while it is being written.
  const filters = database.filters.filter(
    (filter) =>
      columns.has(filter.column) &&
      (filter.operator === 'empty' ||
        filter.operator === 'not-empty' ||
        (filter.value !== null && filter.value !== undefined && filter.value !== '')),
  )
  let rows = database.rows.filter((row) =>
    filters.every((filter) =>
      matches(row.cells[filter.column], filter, columns.get(filter.column)!),
    ),
  )
  const sort = database.sort
  const column = sort && columns.get(sort.column)
  if (sort && column) {
    const sign = sort.direction === 'asc' ? 1 : -1
    rows = rows
      .map((row, index) => ({ row, index }))
      .toSorted((a, b) => {
        const x = a.row.cells[column.id]
        const y = b.row.cells[column.id]
        if (column.type !== 'checkbox' && (isEmpty(x) || isEmpty(y))) {
          return isEmpty(x) === isEmpty(y) ? a.index - b.index : isEmpty(x) ? 1 : -1
        }
        return sign * compare(x, y, column) || a.index - b.index
      })
      .map(({ row }) => row)
  }
  return rows
}

/** Whether a column must have a value (a choice list that doesn't allow empty). */
export function requiresValue(column: DatabaseColumn): boolean {
  return column.type === 'select' && column.allowEmpty === false && Boolean(column.options?.length)
}

/** The values a new row starts with: the first choice of columns that require a value. */
export function defaultCells(columns: DatabaseColumn[]): Record<string, CellValue> {
  const cells: Record<string, CellValue> = {}
  for (const column of columns) {
    if (requiresValue(column)) cells[column.id] = column.options![0]!
  }
  return cells
}

/** The ids of the databases a note's Markdown shows, in order (its `database` blocks). */
export function databaseIdsIn(markdown: string): string[] {
  const ids: string[] = []
  for (const match of markdown.matchAll(/^```database[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)) {
    const id = /^id:[ \t]*(\S+)/m.exec(match[1] ?? '')?.[1]
    if (id) ids.push(id)
  }
  return ids
}

/** The Markdown of a `database` block. */
export function databaseBlock(id: string): string {
  return `\`\`\`database\nid: ${id}\n\`\`\``
}

/**
 * Rows for agents: their id and values by column name (dates `2026-10-17`), in the saved view's
 * order and filtered by it unless `all`.
 */
export function rowsByName(
  database: Database,
  all = false,
): ({ id: string } & Record<string, CellValue>)[] {
  return (all ? database.rows : viewRows(database)).map((row) => {
    const named: { id: string } & Record<string, CellValue> = { id: row.id }
    for (const column of database.columns) named[column.name] = row.cells[column.id] ?? null
    return named
  })
}

/** Values by column name (any case) as cells by column id; an unknown name is an error. */
export function cellsByName(
  database: Pick<Database, 'columns'>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const cells: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(values)) {
    const column = database.columns.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
    if (!column) {
      throw new Error(
        `No column “${name}” (columns: ${database.columns.map((c) => c.name).join(', ')})`,
      )
    }
    cells[column.id] = value
  }
  return cells
}

/**
 * What to change in a database to bring it back to an earlier state (undo) or forward again
 * (redo): only what differs, so changes made since by others (an agent) are kept.
 */
export interface DatabaseRestore {
  title?: string
  /** Exactly these columns (ids kept; values of columns left out are dropped). */
  columns?: DatabaseColumn[]
  sort?: DatabaseSort | null
  filters?: DatabaseFilter[]
  deleteRows?: string[]
  /**
   * Rows changed or put back, in order. A missing one is created with its id. `cells` sets
   * those values (null empties one); `after` places it (null: first).
   */
  rows?: RowRestore[]
}

export interface RowRestore {
  id: string
  cells?: Record<string, CellValue>
  after?: string | null
  createdAt?: number
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** The ids of these rows that are among `ids`, in order. */
const idsIn = (rows: DatabaseRow[], ids: Set<string>) =>
  rows.filter((row) => ids.has(row.id)).map((row) => row.id)

/** The restore that turns database `from` into `to` (nothing when they're the same). */
export function databaseChanges(from: Database, to: Database): DatabaseRestore {
  const changes: DatabaseRestore = {}
  if (from.title !== to.title) changes.title = to.title
  if (!same(from.columns, to.columns)) changes.columns = to.columns
  if (!same(from.sort, to.sort)) changes.sort = to.sort
  if (!same(from.filters, to.filters)) changes.filters = to.filters

  const fromRows = new Map(from.rows.map((row) => [row.id, row]))
  const toIds = new Set(to.rows.map((row) => row.id))
  const deleteRows = from.rows.filter((row) => !toIds.has(row.id)).map((row) => row.id)
  if (deleteRows.length) changes.deleteRows = deleteRows

  // Rows in both kept their order: only new rows are placed. Otherwise every row is.
  const reordered = !same(idsIn(from.rows, toIds), idsIn(to.rows, new Set(fromRows.keys())))
  const columnIds = to.columns.map((column) => column.id)
  const rows: RowRestore[] = []
  to.rows.forEach((row, index) => {
    const after = index ? to.rows[index - 1]!.id : null
    const old = fromRows.get(row.id)
    if (!old) {
      rows.push({ id: row.id, cells: row.cells, after, createdAt: row.createdAt })
      return
    }
    const cells: Record<string, CellValue> = {}
    for (const id of columnIds) {
      const value = row.cells[id] ?? null
      if ((old.cells[id] ?? null) !== value) cells[id] = value
    }
    const changed = Object.keys(cells).length > 0
    if (changed || reordered) {
      rows.push({ id: row.id, ...(changed ? { cells } : {}), ...(reordered ? { after } : {}) })
    }
  })
  if (rows.length) changes.rows = rows
  return changes
}

/** Whether a restore changes nothing. */
export function isEmptyRestore(changes: DatabaseRestore): boolean {
  return Object.keys(changes).length === 0
}
