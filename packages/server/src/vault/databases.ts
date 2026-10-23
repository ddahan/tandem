// Databases: their columns, saved view (sort, filters) and rows, in SQLite. The vault calls
// these under its lock and announces the changes. Values are checked against their column's
// type (`toCellValue`); changing a type converts the column's values (`convertCell`).
import { and, asc, eq, inArray } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import {
  CHOICE_COLORS,
  COLUMN_TYPES,
  COLUMN_WIDTH,
  FILTER_OPERATORS,
  cellText,
  convertCell,
  defaultCells,
  hasChoices,
  requiresValue,
  toCellValue,
  type CellValue,
  type ChoiceColor,
  type ColumnType,
  type Database,
  type DatabaseColumn,
  type DatabaseFilter,
  type DatabaseRestore,
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
  colors?: Record<string, string>
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

/** What a value of each type is, for errors. */
const TYPE_NAMES: Record<ColumnType, string> = {
  text: 'a text',
  number: 'a number',
  money: 'an amount in euros',
  date: 'a date',
  checkbox: 'yes or no',
  select: 'a choice',
  multiselect: 'choices',
}

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

  /**
   * Brings a database back to an earlier state, or forward again (undo, redo: see
   * `databaseChanges`). Columns are set as given, ids kept (a deleted column comes back; its
   * values come with the rows); rows are deleted, then changed or put back in order. Rows
   * since deleted by others are skipped; a row placed after one that is gone stays where it is.
   */
  async restore(id: string, changes: DatabaseRestore): Promise<Database> {
    const record = await this.record(id)
    const before = JSON.parse(record.columns) as DatabaseColumn[]
    const updates: Partial<DatabaseRecord> = { updatedAt: this.now() }
    if (changes.title !== undefined) updates.title = changes.title.trim()
    let columns = before
    if (changes.columns) {
      // Their ids are known: those of columns since deleted too.
      columns = checkColumns(changes.columns, [...before, ...changes.columns])
      await this.convertRows(id, before, columns)
      updates.columns = JSON.stringify(columns)
    }
    const known = new Set(columns.map((column) => column.id))
    if (changes.sort !== undefined) {
      updates.sort = JSON.stringify(
        changes.sort && known.has(changes.sort.column) ? changes.sort : null,
      )
    } else if (changes.columns) {
      const sort = JSON.parse(record.sort ?? 'null') as DatabaseSort | null
      if (sort && !known.has(sort.column)) updates.sort = 'null'
    }
    if (changes.filters !== undefined || changes.columns) {
      const filters = changes.filters ?? (JSON.parse(record.filters) as DatabaseFilter[])
      updates.filters = JSON.stringify(checkFilters(filters, columns, false))
    }
    await this.db.update(databases).set(updates).where(eq(databases.id, id))

    if (changes.deleteRows?.length) {
      await this.db
        .delete(databaseRows)
        .where(and(eq(databaseRows.databaseId, id), inArray(databaseRows.id, changes.deleteRows)))
    }
    if (changes.rows?.length) {
      const rows = await this.db
        .select()
        .from(databaseRows)
        .where(eq(databaseRows.databaseId, id))
        .orderBy(asc(databaseRows.position))
      const order = rows.map((row) => row.id)
      const existing = new Map(rows.map((row) => [row.id, row]))
      const now = this.now()
      for (const change of changes.rows) {
        const row = existing.get(change.id)
        // A row to change that others have since deleted (one put back has its creation time).
        if (!row && change.createdAt === undefined) continue
        const cells = checkCells(
          change.cells ?? {},
          columns,
          row ? (JSON.parse(row.cells) as Record<string, CellValue>) : {},
        )
        if (!row) {
          await this.db.insert(databaseRows).values({
            id: change.id,
            databaseId: id,
            position: 0,
            cells: JSON.stringify(cells),
            createdAt: change.createdAt ?? now,
            updatedAt: now,
          })
        } else if (change.cells) {
          await this.db
            .update(databaseRows)
            .set({ cells: JSON.stringify(cells), updatedAt: now })
            .where(eq(databaseRows.id, row.id))
        }
        if (change.after === undefined && row) continue
        const after = change.after ?? null
        if (after !== null && !order.includes(after)) {
          if (!row) order.push(change.id)
          continue
        }
        if (row) order.splice(order.indexOf(change.id), 1)
        order.splice(after === null ? 0 : order.indexOf(after) + 1, 0, change.id)
      }
      await this.renumber(id, order)
    }
    return this.get(id)
  }

  /**
   * Moves a row after row `after` (null: first). Positions are renumbered 1, 2, 3…: moving
   * back and forth never runs out of room between two positions.
   */
  async moveRow(id: string, rowId: string, after: string | null): Promise<Database> {
    await this.row(id, rowId)
    const rows = await this.db
      .select({ id: databaseRows.id, position: databaseRows.position })
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, id))
      .orderBy(asc(databaseRows.position))
    const order = rows.filter((row) => row.id !== rowId)
    const index = after === null ? -1 : order.findIndex((row) => row.id === after)
    if (after !== null && index < 0) throw new NotFoundError('No such row')
    order.splice(
      index + 1,
      0,
      rows.find((row) => row.id === rowId)!,
    )
    await this.renumber(
      id,
      order.map((row) => row.id),
    )
    await this.touch(id, this.now())
    return this.get(id)
  }

  /** Positions 1, 2, 3… for the rows in this order (only those that change are written). */
  private async renumber(id: string, order: string[]) {
    const rows = await this.db
      .select({ id: databaseRows.id, position: databaseRows.position })
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, id))
    const positions = new Map(rows.map((row) => [row.id, row.position]))
    for (const [i, rowId] of order.entries()) {
      if (positions.has(rowId) && positions.get(rowId) !== i + 1) {
        await this.db
          .update(databaseRows)
          .set({ position: i + 1 })
          .where(eq(databaseRows.id, rowId))
      }
    }
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
      return hasChoices(column) && !column.options?.length && old && !hasChoices(old)
    })
    if (!turning.length) return input
    const database = await this.get(id)
    return input.map((column) =>
      turning.includes(column)
        ? {
            ...column,
            options: distinctTexts(
              database,
              previous.get(column.id!)!,
              column.type === 'multiselect',
            ),
          }
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
        const value = convertCell(cells[column.id], previous.get(column.id)!, column)
        // Empty values aren't stored (as `checkCells` does).
        if (value === null) delete next[column.id]
        else next[column.id] = value
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
    if (hasChoices(column)) {
      const options = [
        ...new Set((column.options ?? []).map((option) => option.trim()).filter(Boolean)),
      ]
      result.options = options
      // Colors of choices that are still there (by name, as the cells hold them).
      const colors: Record<string, ChoiceColor> = {}
      for (const [option, color] of Object.entries(column.colors ?? {})) {
        if (!CHOICE_COLORS.includes(color as ChoiceColor)) {
          throw new ValidationError(`${name}: unknown color “${color}”`)
        }
        if (options.includes(option.trim())) colors[option.trim()] = color as ChoiceColor
      }
      if (Object.keys(colors).length) result.colors = colors
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
        hasChoices(column)
          ? `${column.name}: “${String(value)}” is not one of ${column.options?.join(', ') || 'its choices (none yet)'}`
          : `${column.name}: “${String(value)}” is not ${TYPE_NAMES[column.type]}`,
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

/**
 * The text of every value of a column (choices for a column becoming a choice column); `split`:
 * texts separated by commas are several (a column becoming a `multiselect`).
 */
function distinctTexts(database: Database, column: DatabaseColumn, split: boolean): string[] {
  const values = new Set<string>()
  for (const row of database.rows) {
    const text = cellText(row.cells[column.id], column)
    for (const part of split ? text.split(',') : [text]) {
      if (part.trim()) values.add(part.trim())
    }
    if (values.size >= MAX_OPTIONS) break
  }
  return [...values].slice(0, MAX_OPTIONS)
}
