// One database, as its block shows it: loaded from the server, reloaded when it changes (an
// agent, another window), and changed through the API (each change returns the database).
// Each change is a step of the app's undo history (useUndo): undone by putting back what it
// changed (`databaseChanges`, `POST /databases/:id/restore`), redone the same way.
import {
  databaseChanges,
  isEmptyRestore,
  type CellValue,
  type Database,
  type DatabaseColumn,
  type DatabaseFilter,
  type DatabaseRestore,
  type DatabaseSort,
} from '@tandem/shared'

export interface ColumnChange {
  id?: string
  name: string
  type: DatabaseColumn['type']
  options?: string[]
  colors?: DatabaseColumn['colors']
  allowEmpty?: boolean
  width?: number
}

export function useDatabase(id: Ref<string>) {
  const api = useApi()
  const showError = useApiErrorToast()
  const undoHistory = useUndo()
  const database = ref<Database | null>(null)
  const missing = ref(false)

  // Changes can come in bursts (an agent adding rows): only the latest load counts, an older
  // answer arriving last would show an old state.
  let loads = 0
  async function load() {
    const current = ++loads
    try {
      const loaded = await unwrap(api.databases[':id'].$get({ param: { id: id.value } }))
      if (current !== loads) return
      database.value = loaded
      missing.value = false
    } catch (error) {
      if (current !== loads) return
      if (error instanceof ApiError && error.status === 404) missing.value = true
      else showError(error, 'Could not load the database')
    }
  }

  // Changes run one after another, in the order they are made: a value saved as its cell is
  // left, then a row added below it (⌘Enter), are applied in that order.
  let queue: Promise<unknown> = Promise.resolve()

  /**
   * Runs a change; the database it returns replaces ours (reloaded when it fails). With a
   * `label`, it is a step of the undo history (unless it changed nothing).
   */
  function change(request: () => Promise<Database>, label?: string) {
    const run = queue.then(async () => {
      const before = database.value ? structuredClone(toRaw(database.value)) : null
      try {
        const changed = await request()
        loads++
        database.value = changed
        if (label && before) remember(label, before, changed)
        return true
      } catch (error) {
        showError(error, 'Could not save')
        await load()
        return false
      }
    })
    queue = run
    return run
  }

  function remember(label: string, before: Database, after: Database) {
    const back = databaseChanges(after, before)
    if (isEmptyRestore(back)) return
    const forward = databaseChanges(before, after)
    undoHistory.record({
      label,
      noteId: after.nodeId,
      undo: () => restore(after.id, back),
      redo: () => restore(after.id, forward),
    })
  }

  const restore = (databaseId: string, changes: DatabaseRestore) =>
    change(() =>
      unwrap(api.databases[':id'].restore.$post({ param: { id: databaseId }, json: changes })),
    )

  const param = () => ({ id: id.value })

  const setTitle = (title: string) =>
    change(
      () => unwrap(api.databases[':id'].$patch({ param: param(), json: { title } })),
      'Rename the database',
    )
  /** The columns as given (`label`: what changed, for the undo history's messages). */
  const setColumns = (columns: ColumnChange[], label = 'Change the columns') =>
    change(() => unwrap(api.databases[':id'].$patch({ param: param(), json: { columns } })), label)
  const setSort = (sort: DatabaseSort | null) =>
    change(
      () => unwrap(api.databases[':id'].$patch({ param: param(), json: { sort } })),
      sort ? 'Sort' : 'Stop sorting',
    )
  const setFilters = (filters: DatabaseFilter[]) =>
    change(
      () => unwrap(api.databases[':id'].$patch({ param: param(), json: { filters } })),
      'Change the filters',
    )
  const addRow = (after?: string) =>
    change(
      () =>
        unwrap(api.databases[':id'].rows.$post({ param: param(), json: { after: after ?? null } })),
      'Add a row',
    )
  const setCell = (rowId: string, columnId: string, value: CellValue) =>
    change(
      () =>
        unwrap(
          api.databases[':id'].rows[':rowId'].$patch({
            param: { ...param(), rowId },
            json: { cells: { [columnId]: value } },
          }),
        ),
      'Edit a cell',
    )
  /** Moves a row after row `after` (null: first). */
  const moveRow = (rowId: string, after: string | null) =>
    change(
      () =>
        unwrap(
          api.databases[':id'].rows[':rowId'].move.$post({
            param: { ...param(), rowId },
            json: { after },
          }),
        ),
      'Move a row',
    )
  const deleteRow = (rowId: string) =>
    change(
      () => unwrap(api.databases[':id'].rows[':rowId'].$delete({ param: { ...param(), rowId } })),
      'Delete a row',
    )

  watch(id, load, { immediate: true })
  useServerEvents((event) => {
    if ((event.type === 'database' && event.id === id.value) || event.type === 'resync') {
      void load()
    }
  })

  return {
    database,
    missing,
    load,
    setTitle,
    setColumns,
    setSort,
    setFilters,
    addRow,
    setCell,
    moveRow,
    deleteRow,
  }
}
