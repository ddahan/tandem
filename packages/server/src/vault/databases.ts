// Databases: their columns, saved view (sort, filters) and rows, in SQLite. The vault calls
// these under its lock and announces the changes. Values are checked against their column's
// type (`toCellValue`); changing a type converts the column's values (`convertCell`).
import { asc, eq, inArray } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import {
  COLUMN_TYPES,
  COLUMN_WIDTH,
  FILTER_OPERATORS,
  cellText,
  convertCell,
  defaultCells,
  requiresValue,
  toCellValue,
  type CellValue,
  type ColumnType,
  type Database,
  type DatabaseColumn,
  type DatabaseFilter,
  type DatabaseRow,
  type DatabaseSort,
  type DatabaseSummary,
} from '@tandem/shared'
import type { Db } from '../db/client.ts'
import { databaseRows, databases } from '../db/schema.ts'
import { NotFoundError, ValidationError } from './errors.ts'

/** A column as given to create or change a database: no id for a new one. */
export interface ColumnInput {
  id?: string
  name: string
  type: ColumnType
  options?: string[]
  allowEmpty?: boolean
  width?: number
}

export interface DatabasePatch {
  title?: string
  columns?: ColumnInput[]
  sort?: DatabaseSort | null
  filters?: DatabaseFilter[]
}

const DEFAULT_COLUMNS: ColumnInput[] = [{ name: 'Name', type: 'text' }]
// Letters and digits only: ids are typed in commands (`tandem row-set <db> <row>`), where one
// starting with "-" would read as an option.
const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const newId = customAlphabet(ALPHANUMERIC, 12)
const newColumnId = customAlphabet(ALPHANUMERIC, 8)
/** Choices made from a column's values when it becomes a `select` (at most). */
const MAX_OPTIONS = 50

type DatabaseRecord = typeof databases.$inferSelect
type RowRecord = typeof databaseRows.$inferSelect

export class DatabaseStore {
  private readonly db: Db
  private readonly now: () => number

  constructor(db: Db, now: () => number) {
    this.db = db
    this.now = now
  }

  /** A new database for page `nodeId`, with one empty row. */
  async create(
    nodeId: string,
    input: { title?: string; columns?: ColumnInput[] } = {},
  ): Promise<Database> {
    const id = newId()
    const now = this.now()
    const columns = checkColumns(input.columns?.length ? input.columns : DEFAULT_COLUMNS, [])
    await this.db.insert(databases).values({
      id,
      nodeId,
      title: input.title?.trim() ?? '',
      columns: JSON.stringify(columns),
      createdAt: now,
      updatedAt: now,
    })
    await this.db.insert(databaseRows).values({
      id: newId(),
      databaseId: id,
      position: 1,
      cells: JSON.stringify(defaultCells(columns)),
      createdAt: now,
      updatedAt: now,
    })
    return this.get(id)
  }

  async get(id: string): Promise<Database> {
    const record = await this.record(id)
    const rows = await this.db
      .select()
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, id))
      .orderBy(asc(databaseRows.position))
    return toDatabase(record, rows)
  }

  /** The databases of a page, oldest first. */
  async listForNode(nodeId: string): Promise<DatabaseSummary[]> {
    const records = await this.db
      .select()
      .from(databases)
      .where(eq(databases.nodeId, nodeId))
      .orderBy(asc(databases.createdAt))
    const result: DatabaseSummary[] = []
    for (const record of records) {
      const rows = await this.db
        .select({ id: databaseRows.id })
        .from(databaseRows)
        .where(eq(databaseRows.databaseId, record.id))
      result.push({ id: record.id, title: record.title, rowCount: rows.length })
    }
    return result
  }

  async update(id: string, patch: DatabasePatch): Promise<Database> {
    const record = await this.record(id)
    const before = JSON.parse(record.columns) as DatabaseColumn[]
    const changes: Partial<DatabaseRecord> = { updatedAt: this.now() }
    if (patch.title !== undefined) changes.title = patch.title.trim()
    let columns = before
    if (patch.columns) {
      columns = checkColumns(await this.withChoices(id, patch.columns, before), before)
      await this.convertRows(id, before, columns)
      await this.fillRequired(id, columns)
      changes.columns = JSON.stringify(columns)
    }
    const known = new Set(columns.map((column) => column.id))
    const sort =
      patch.sort !== undefined
        ? patch.sort
        : (JSON.parse(record.sort ?? 'null') as DatabaseSort | null)
    if (sort && !known.has(sort.column)) {
      if (patch.sort) throw new ValidationError('sort: no such column')
    }
    changes.sort = JSON.stringify(sort && known.has(sort.column) ? sort : null)
    const filters = patch.filters ?? (JSON.parse(record.filters) as DatabaseFilter[])
    changes.filters = JSON.stringify(checkFilters(filters, columns, patch.filters !== undefined))
    await this.db.update(databases).set(changes).where(eq(databases.id, id))
    return this.get(id)
  }

  /** A row (after row `after`, or last), with `cells` by column id. */
  async addRow(
    id: string,
    input: { cells?: Record<string, unknown>; after?: string | null } = {},
  ): Promise<Database> {
    const record = await this.record(id)
    const columns = JSON.parse(record.columns) as DatabaseColumn[]
    const rows = await this.db
      .select({ id: databaseRows.id, position: databaseRows.position })
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, id))
      .orderBy(asc(databaseRows.position))
    let position = (rows.at(-1)?.position ?? 0) + 1
    if (input.after) {
      const index = rows.findIndex((row) => row.id === input.after)
      if (index < 0) throw new NotFoundError('No such row')
      const next = rows[index + 1]
      position = next ? (rows[index]!.position + next.position) / 2 : rows[index]!.position + 1
    }
    const now = this.now()
    await this.db.insert(databaseRows).values({
      id: newId(),
      databaseId: id,
      position,
      cells: JSON.stringify(checkCells(input.cells ?? {}, columns, defaultCells(columns))),
      createdAt: now,
      updatedAt: now,
    })
    await this.touch(id, now)
    return this.get(id)
  }

  /** Changes some cells of a row (by column id; null empties one). */
  async updateRow(id: string, rowId: string, cells: Record<string, unknown>): Promise<Database> {
    const record = await this.record(id)
    const row = await this.row(id, rowId)
    const columns = JSON.parse(record.columns) as DatabaseColumn[]
    const next = checkCells(cells, columns, JSON.parse(row.cells) as Record<string, CellValue>)
    const now = this.now()
    await this.db
      .update(databaseRows)
      .set({ cells: JSON.stringify(next), updatedAt: now })
      .where(eq(databaseRows.id, rowId))
    await this.touch(id, now)
    return this.get(id)
  }

  async deleteRow(id: string, rowId: string): Promise<Database> {
    await this.row(id, rowId)
    await this.db.delete(databaseRows).where(eq(databaseRows.id, rowId))
    await this.touch(id, this.now())
    return this.get(id)
  }

  /** Deletes the databases of these pages (deleted for good). */
  async deleteForNodes(nodeIds: string[]): Promise<void> {
    if (nodeIds.length) await this.db.delete(databases).where(inArray(databases.nodeId, nodeIds))
  }

  private async record(id: string): Promise<DatabaseRecord> {
    const record = await this.db.select().from(databases).where(eq(databases.id, id)).get()
    if (!record) throw new NotFoundError('No such database')
    return record
  }

  private async row(id: string, rowId: string): Promise<RowRecord> {
    const row = await this.db.select().from(databaseRows).where(eq(databaseRows.id, rowId)).get()
    if (!row || row.databaseId !== id) throw new NotFoundError('No such row')
    return row
  }

  private async touch(id: string, now: number) {
    await this.db.update(databases).set({ updatedAt: now }).where(eq(databases.id, id))
  }

  /** Empty cells of columns that require a value take its default (the first choice). */
  private async fillRequired(id: string, columns: DatabaseColumn[]) {
    const defaults = defaultCells(columns)
    if (!Object.keys(defaults).length) return
    const rows = await this.db.select().from(databaseRows).where(eq(databaseRows.databaseId, id))
    for (const row of rows) {
      const cells = JSON.parse(row.cells) as Record<string, CellValue>
      const missing = Object.keys(defaults).filter(
        (columnId) => cells[columnId] === null || cells[columnId] === undefined,
      )
      if (!missing.length) continue
      for (const columnId of missing) cells[columnId] = defaults[columnId]!
      await this.db
        .update(databaseRows)
        .set({ cells: JSON.stringify(cells) })
        .where(eq(databaseRows.id, row.id))
    }
  }

  /** Columns becoming a `select` without choices: their values become the choices. */
  private async withChoices(id: string, input: ColumnInput[], before: DatabaseColumn[]) {
    const previous = new Map(before.map((column) => [column.id, column]))
    const turning = input.filter((column) => {
      const old = column.id ? previous.get(column.id) : undefined
      return column.type === 'select' && !column.options?.length && old && old.type !== 'select'
    })
    if (!turning.length) return input
    const database = await this.get(id)
    return input.map((column) =>
      turning.includes(column)
        ? { ...column, options: distinctTexts(database, previous.get(column.id!)!) }
        : column,
    )
  }

  /** Values of a column whose type changed are converted; those of removed columns go. */
  private async convertRows(id: string, before: DatabaseColumn[], after: DatabaseColumn[]) {
    const previous = new Map(before.map((column) => [column.id, column]))
    const kept = new Set(after.map((column) => column.id))
    const changed = after.filter((column) => {
      const old = previous.get(column.id)
      return old && old.type !== column.type
    })
    const removed = before.some((column) => !kept.has(column.id))
    if (!changed.length && !removed) return
    const rows = await this.db.select().from(databaseRows).where(eq(databaseRows.databaseId, id))
    for (const row of rows) {
      const cells = JSON.parse(row.cells) as Record<string, CellValue>
      const next: Record<string, CellValue> = {}
      for (const [columnId, value] of Object.entries(cells)) {
        if (kept.has(columnId)) next[columnId] = value
      }
      for (const column of changed) {
        next[column.id] = convertCell(cells[column.id], previous.get(column.id)!, column)
      }
      await this.db
        .update(databaseRows)
        .set({ cells: JSON.stringify(next) })
        .where(eq(databaseRows.id, row.id))
    }
  }
}

function toDatabase(record: DatabaseRecord, rows: RowRecord[]): Database {
  return {
    id: record.id,
    nodeId: record.nodeId,
    title: record.title,
    columns: JSON.parse(record.columns) as DatabaseColumn[],
    sort: JSON.parse(record.sort ?? 'null') as DatabaseSort | null,
    filters: JSON.parse(record.filters) as DatabaseFilter[],
    rows: rows.map((row): DatabaseRow => ({
      id: row.id,
      cells: JSON.parse(row.cells) as Record<string, CellValue>,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/** Valid columns with ids; a new `select` column without choices takes its values' ones. */
function checkColumns(input: ColumnInput[], before: DatabaseColumn[]): DatabaseColumn[] {
  if (!input.length) throw new ValidationError('A database needs at least one column')
  const names = new Set<string>()
  const previous = new Map(before.map((column) => [column.id, column]))
  return input.map((column) => {
    const name = column.name.trim()
    if (!name) throw new ValidationError('A column needs a name')
    if (names.has(name.toLowerCase())) throw new ValidationError(`Two columns named “${name}”`)
    names.add(name.toLowerCase())
    if (!COLUMN_TYPES.includes(column.type)) {
      throw new ValidationError(`${name}: unknown type “${column.type}”`)
    }
    if (column.id && !previous.has(column.id)) throw new ValidationError(`${name}: no such column`)
    const result: DatabaseColumn = { id: column.id ?? newColumnId(), name, type: column.type }
    if (column.width !== undefined) {
      result.width = Math.round(
        Math.min(COLUMN_WIDTH.max, Math.max(COLUMN_WIDTH.min, column.width)),
      )
    }
    if (column.type === 'select') {
      const options = [
        ...new Set((column.options ?? []).map((option) => option.trim()).filter(Boolean)),
      ]
      result.options = options
      if (column.allowEmpty === false) {
        if (!options.length) {
          throw new ValidationError(`${name}: a value is required, so it needs a choice`)
        }
        result.allowEmpty = false
      }
    }
    return result
  })
}

/** Filters on existing columns with known operators (`strict`: an error, not dropped). */
function checkFilters(
  filters: DatabaseFilter[],
  columns: DatabaseColumn[],
  strict: boolean,
): DatabaseFilter[] {
  const known = new Set(columns.map((column) => column.id))
  return filters.filter((filter) => {
    const ok = known.has(filter.column) && FILTER_OPERATORS.includes(filter.operator)
    if (!ok && strict) throw new ValidationError('filters: no such column or operator')
    return ok
  })
}

/** `current` with `cells` (by column id) applied, each value checked against its column. */
function checkCells(
  cells: Record<string, unknown>,
  columns: DatabaseColumn[],
  current: Record<string, CellValue>,
): Record<string, CellValue> {
  const byId = new Map(columns.map((column) => [column.id, column]))
  const next = { ...current }
  for (const [columnId, value] of Object.entries(cells)) {
    const column = byId.get(columnId)
    if (!column) throw new ValidationError(`No column “${columnId}”`)
    const cell = toCellValue(value, column)
    if (cell === undefined) {
      throw new ValidationError(
        column.type === 'select'
          ? `${column.name}: “${String(value)}” is not one of ${column.options?.join(', ') || 'its choices (none yet)'}`
          : `${column.name}: “${String(value)}” is not a ${column.type === 'checkbox' ? 'yes or no' : column.type}`,
      )
    }
    if (cell === null && requiresValue(column)) {
      throw new ValidationError(`${column.name} can't be empty`)
    }
    if (cell === null) delete next[columnId]
    else next[columnId] = cell
  }
  return next
}

/** The text of every value of a column (choices for a column becoming a `select`). */
function distinctTexts(database: Database, column: DatabaseColumn): string[] {
  const values = new Set<string>()
  for (const row of database.rows) {
    const text = cellText(row.cells[column.id], column).trim()
    if (text) values.add(text)
    if (values.size >= MAX_OPTIONS) break
  }
  return [...values]
}
