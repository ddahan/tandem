// One database, as its block shows it: loaded from the server, reloaded when it changes (an
// agent, another window), and changed through the API (each change returns the database).
import type { Database, DatabaseColumn, DatabaseFilter, DatabaseSort } from '@tandem/shared'

export interface ColumnChange {
  id?: string
  name: string
  type: DatabaseColumn['type']
  options?: string[]
}

export function useDatabase(id: Ref<string>) {
  const api = useApi()
  const showError = useApiErrorToast()
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

  /** Runs a change; the database it returns replaces ours (reloaded when it fails). */
  async function change(request: () => Promise<Database>, title = 'Could not save') {
    try {
      const changed = await request()
      loads++
      database.value = changed
      return true
    } catch (error) {
      showError(error, title)
      await load()
      return false
    }
  }

  const param = () => ({ id: id.value })

  const setTitle = (title: string) =>
    change(() => unwrap(api.databases[':id'].$patch({ param: param(), json: { title } })))
  const setColumns = (columns: ColumnChange[]) =>
    change(() => unwrap(api.databases[':id'].$patch({ param: param(), json: { columns } })))
  const setSort = (sort: DatabaseSort | null) =>
    change(() => unwrap(api.databases[':id'].$patch({ param: param(), json: { sort } })))
  const setFilters = (filters: DatabaseFilter[]) =>
    change(() => unwrap(api.databases[':id'].$patch({ param: param(), json: { filters } })))
  const addRow = (after?: string) =>
    change(() =>
      unwrap(api.databases[':id'].rows.$post({ param: param(), json: { after: after ?? null } })),
    )
  const setCell = (rowId: string, columnId: string, value: string | number | boolean | null) =>
    change(() =>
      unwrap(
        api.databases[':id'].rows[':rowId'].$patch({
          param: { ...param(), rowId },
          json: { cells: { [columnId]: value } },
        }),
      ),
    )
  const deleteRow = (rowId: string) =>
    change(() =>
      unwrap(api.databases[':id'].rows[':rowId'].$delete({ param: { ...param(), rowId } })),
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
    deleteRow,
  }
}
