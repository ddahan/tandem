// Bookmarks (see @tandem/shared's bookmarks.ts), shared by the sidebar's Unsorted, the cards in
// notes, the side panel and the search palette. All of them are loaded at once (a few thousand
// at most), with the inbox note's (`unsorted`), and kept current by the layout (`follow`): an
// agent, the extension, another window or a note's cards change them. Making and editing them
// are steps of the undo history (useUndo); deleting isn't (it removes their cards from notes
// too): it asks first.
import type { Bookmark, UnsortedBookmarks } from '@tandem/shared'
import { announce } from '~/composables/useServerEvents'

/**
 * A bookmark made again by a redo has a new id: the undo history's steps keep the first one,
 * which leads here to the current one.
 */
const remade = new Map<string, string>()
function currentId(id: string): string {
  let current = id
  while (remade.has(current)) current = remade.get(current)!
  return current
}

export type BookmarkFields = Partial<Pick<Bookmark, 'title' | 'url' | 'description'>>

/** Opens a website in a new browser tab (from the installed app, in the default browser). */
export function openWebsite(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** "Used 3 times": a bookmark shown by several notes (nothing for one). */
export function usesLabel(bookmark: Pick<Bookmark, 'uses'>): string | null {
  return bookmark.uses >= 2 ? `Used ${bookmark.uses} times` : null
}

export function useBookmarks() {
  const list = useState<Bookmark[]>('bookmarks:list', () => [])
  const unsorted = useState<UnsortedBookmarks>('bookmarks:unsorted', () => ({
    noteId: null,
    bookmarks: [],
  }))
  const loaded = useState('bookmarks:loaded', () => false)
  const api = useApi()
  const undoHistory = useUndo()

  const byId = computed(() => new Map(list.value.map((bookmark) => [bookmark.id, bookmark])))

  async function load() {
    try {
      const [all, inbox] = await Promise.all([
        unwrap(api.bookmarks.$get()),
        unwrap(api.bookmarks.unsorted.$get()),
      ])
      list.value = all
      unsorted.value = inbox
      loaded.value = true
    } catch {
      // Kept as they were: the next change reloads them.
    }
  }

  /** Loads them, then reloads on changes while the calling component lives (the layout). */
  function follow() {
    void load()
    useServerEvents((event) => {
      // Pages trashed or restored take their cards with them.
      if (event.type === 'bookmarks' || event.type === 'tree' || event.type === 'resync') {
        void load()
      }
    })
  }

  /** A change the server answers with the bookmark: shown at once, the list reloaded after. */
  function keep(bookmark: Bookmark) {
    list.value = [bookmark, ...list.value.filter((other) => other.id !== bookmark.id)]
    void load()
    return bookmark
  }

  /**
   * A new bookmark (with `inbox`, its card at the start of the inbox note). A page already
   * bookmarked gives its bookmark (`created` false): nothing to undo then.
   */
  async function create(fields: BookmarkFields & { inbox?: boolean }) {
    const response = await api.bookmarks.$post({ json: fields })
    const made = keep(await unwrap(Promise.resolve(response)))
    const created = response.status === 201
    if (created) {
      undoHistory.record({
        label: 'New bookmark',
        undo: async () => {
          await remove(currentId(made.id))
        },
        redo: async () => {
          const again = keep(await unwrap(api.bookmarks.$post({ json: fields })))
          remade.set(currentId(made.id), again.id)
        },
      })
    }
    return { bookmark: made, created }
  }

  /** Changes a bookmark's fields, as a step of the undo history. */
  async function update(id: string, fields: BookmarkFields) {
    const old = byId.value.get(id)
    const changed = await patch(id, fields)
    if (old) {
      const before = Object.fromEntries(
        Object.keys(fields).map((key) => [key, old[key as keyof typeof old]]),
      ) as BookmarkFields
      undoHistory.record({
        label: 'Edit the bookmark',
        undo: () => patch(id, before).then(() => true),
        redo: () => patch(id, fields).then(() => true),
      })
    }
    return changed
  }

  function patch(id: string, fields: BookmarkFields) {
    return unwrap(api.bookmarks[':id'].$patch({ param: { id: currentId(id) }, json: fields })).then(
      keep,
    )
  }

  /** Deletes it for good; its cards leave the pages showing them. */
  async function remove(id: string) {
    const result = await unwrap(api.bookmarks[':id'].$delete({ param: { id } }))
    void load()
    // Open notes reload: the server's changes are credited to the owner, which they skip.
    for (const page of result.pages) announce({ type: 'cards-changed', id: page.id })
    return result
  }

  /** Takes its cards out of a note (moved into another one), shown at once in Unsorted. */
  async function removeCards(id: string, noteId: string) {
    if (unsorted.value.noteId === noteId) {
      const rest = unsorted.value.bookmarks.filter((bookmark) => bookmark.id !== id)
      unsorted.value = { noteId, bookmarks: rest }
    }
    await unwrap(api.bookmarks[':id'].cards[':noteId'].$delete({ param: { id, noteId } }))
    announce({ type: 'cards-changed', id: noteId })
    void load()
  }

  /**
   * Puts its card at the end of a note (`to`: dropped on it in the pages' tree), and takes it out
   * of `from` (Unsorted's inbox), unless that is the same note.
   */
  async function moveCard(id: string, from: string | null, to: string) {
    const bookmark = byId.value.get(id)
    if (!bookmark) return
    await unwrap(api.bookmarks.$post({ json: { url: bookmark.url, noteId: to } }))
    announce({ type: 'cards-changed', id: to })
    if (from && from !== to) await removeCards(id, from)
    else void load()
  }

  /** The pages showing a bookmark. */
  async function refs(id: string) {
    return unwrap(api.bookmarks[':id'].refs.$get({ param: { id } }))
  }

  return {
    list,
    unsorted,
    loaded,
    byId,
    load,
    follow,
    create,
    update,
    remove,
    removeCards,
    moveCard,
    refs,
  }
}
