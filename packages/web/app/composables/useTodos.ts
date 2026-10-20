// The notes' TODOs (`TODO:` lines, see shared/todos.ts), for the TODOs page and the sidebar's
// count. The layout keeps them current (`follow`): a note saved, renamed or trashed reloads them.
import type { NoteTodos } from '@tandem/shared'

export function useTodos() {
  const notes = useState<NoteTodos[]>('todos:notes', () => [])
  const loaded = useState('todos:loaded', () => false)
  const api = useApi()

  const count = computed(() => notes.value.reduce((sum, note) => sum + note.todos.length, 0))

  async function load() {
    try {
      notes.value = await unwrap(api.todos.$get())
      loaded.value = true
    } catch {
      // Kept as they were: the next change reloads them.
    }
  }

  /** Loads them, then reloads on changes while the calling component lives (the layout). */
  function follow() {
    void load()
    let timer: ReturnType<typeof setTimeout> | undefined
    useServerEvents((event) => {
      if (!['note', 'tree', 'trash', 'resync'].includes(event.type)) return
      // Typing saves often: one reload once it settles.
      clearTimeout(timer)
      timer = setTimeout(() => void load(), 400)
    })
    onScopeDispose(() => clearTimeout(timer))
  }

  return { notes, loaded, count, load, follow }
}
