// One open note: loading, background autosave (debounced, never two saves at once), and
// conflicts with changes made elsewhere (agents, files edited by hand).
//
// Every save sends the hash of the content the editor started from (`baseHash`); the server
// refuses it if the note changed since, and returns the current content (a conflict).
import { useDebounceFn } from '@vueuse/core'
import type { NoteDetail } from '@tandem/shared'

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict'

export interface Conflict {
  content: string
  hash: string
}

const SAVE_DELAY = 500

export function useNoteDocument(id: Ref<string>) {
  const api = useApi()
  const note = ref<NoteDetail | null>(null)
  const loadError = ref<ApiError | null>(null)
  const status = ref<SaveStatus>('idle')
  const conflict = ref<Conflict | null>(null)
  const savedAt = ref<number | null>(null)

  let baseHash = ''
  /** Content (file form) waiting to be saved. */
  let pending: string | null = null
  let saving: Promise<void> | null = null
  let retry: ReturnType<typeof setTimeout> | null = null

  async function load() {
    loadError.value = null
    try {
      const detail = await unwrap(api.notes[':id'].$get({ param: { id: id.value } }))
      note.value = detail
      baseHash = detail.hash
      pending = null
      conflict.value = null
      status.value = 'idle'
    } catch (error) {
      note.value = null
      loadError.value = error instanceof ApiError ? error : new ApiError(0, null)
    }
  }

  const scheduleSave = useDebounceFn(() => save(), SAVE_DELAY)

  function change(content: string) {
    if (!note.value || content === note.value.content) return
    pending = content
    if (status.value !== 'conflict') status.value = 'pending'
    void scheduleSave()
  }

  async function save(): Promise<void> {
    if (saving) await saving
    if (pending === null || conflict.value || !note.value) {
      // Nothing left to save (another call saved it): don't leave "Saving…" behind.
      if (pending === null && !saving && status.value === 'pending') status.value = 'saved'
      return
    }
    const content = pending
    const noteId = id.value
    pending = null
    status.value = 'saving'
    saving = (async () => {
      try {
        const result = await unwrap(
          api.notes[':id'].content.$put({ param: { id: noteId }, json: { content, baseHash } }),
        )
        baseHash = result.hash
        savedAt.value = result.updatedAt
        if (note.value?.node.id === noteId)
          note.value = { ...note.value, content, hash: result.hash }
        status.value = pending === null ? 'saved' : 'pending'
      } catch (error) {
        pending ??= content
        if (error instanceof ApiError && error.status === 409) {
          conflict.value = (error.body as { current: Conflict }).current
          status.value = 'conflict'
        } else {
          status.value = 'error'
          if (retry) clearTimeout(retry)
          retry = setTimeout(() => void save(), 3000)
        }
      } finally {
        saving = null
      }
    })()
    await saving
    // (status changed meanwhile: TypeScript can't see it)
    if (pending !== null && (status.value as SaveStatus) === 'pending') await save()
  }

  /** Saves now (before leaving, renaming…). */
  async function flush() {
    if (pending !== null && !conflict.value) await save()
    else if (saving) await saving
  }

  const hasUnsavedChanges = () => pending !== null || saving !== null

  /** Conflict: overwrite the other version with ours. */
  async function keepMine() {
    if (!conflict.value) return
    baseHash = conflict.value.hash
    conflict.value = null
    await save()
  }

  /** Conflict: drop our pending changes and take the other version. Returns its content. */
  function takeTheirs(): string | null {
    if (!conflict.value || !note.value) return null
    const { content, hash } = conflict.value
    note.value = { ...note.value, content, hash }
    baseHash = hash
    pending = null
    conflict.value = null
    status.value = 'saved'
    return content
  }

  /**
   * Someone else saved this note. Without local changes, returns the new content to show;
   * with local changes, opens a conflict instead and returns null.
   */
  async function externalChange(hash: string): Promise<string | null> {
    if (!note.value || hash === baseHash) return null
    if (saving) await saving
    const detail = await unwrap(api.notes[':id'].$get({ param: { id: id.value } }))
    if (detail.hash === baseHash) return null
    if (pending !== null) {
      conflict.value = { content: detail.content, hash: detail.hash }
      status.value = 'conflict'
      return null
    }
    note.value = detail
    baseHash = detail.hash
    return detail.content
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!hasUnsavedChanges()) return
    // Last chance: a keepalive request survives the page closing.
    if (pending !== null && note.value) {
      void fetch(`/api/notes/${id.value}/content`, {
        method: 'PUT',
        keepalive: true,
        headers: { 'content-type': 'application/json', 'x-tandem-author': 'owner' },
        body: JSON.stringify({ content: pending, baseHash }),
      })
    }
    event.preventDefault()
  }

  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    if (retry) clearTimeout(retry)
  })

  return {
    note,
    loadError,
    status,
    conflict,
    savedAt,
    load,
    change,
    flush,
    keepMine,
    takeTheirs,
    externalChange,
    hasUnsavedChanges,
  }
}
