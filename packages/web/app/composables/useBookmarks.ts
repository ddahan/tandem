// Bookmarks (see @tandem/shared's bookmarks.ts), shared by the sidebar, the cards in notes and
// the search palette. All of them are loaded at once (a few thousand at most) and kept current
// by the layout (`follow`): an agent, the extension or another window changes them. Making,
// editing and moving them are steps of the undo history (useUndo); deleting isn't (it removes
// their cards from notes too): it asks first.
import type { Bookmark } from '@tandem/shared'
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

/** A bookmark or folder as the sidebar's tree shows it. */
export interface BookmarkItem {
  id: string
  label: string
  bookmark: Bookmark
  children?: BookmarkItem[]
}

/** A folder, as pickers list them: its path of names, indented by depth. */
export interface FolderOption {
  id: string | null
  label: string
  depth: number
}

export type BookmarkFields = Partial<
  Pick<Bookmark, 'title' | 'url' | 'description' | 'parentId'>
> & { index?: number }

/** Opens a website in a new browser tab (from the installed app, in the default browser). */
export function openWebsite(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function useBookmarks() {
  const list = useState<Bookmark[]>('bookmarks:list', () => [])
  const loaded = useState('bookmarks:loaded', () => false)
  const api = useApi()
  const undoHistory = useUndo()

  const byId = computed(() => new Map(list.value.map((bookmark) => [bookmark.id, bookmark])))

  const childrenOf = computed(() => {
    const map = new Map<string | null, Bookmark[]>()
    for (const bookmark of list.value)
      map.set(bookmark.parentId, [...(map.get(bookmark.parentId) ?? []), bookmark])
    for (const children of map.values()) children.sort((a, b) => a.position - b.position)
    return map
  })

  function build(parentId: string | null): BookmarkItem[] {
    return (childrenOf.value.get(parentId) ?? []).map((bookmark) => {
      const children = build(bookmark.id)
      return {
        id: bookmark.id,
        label: bookmark.title,
        bookmark,
        children: children.length ? children : undefined,
      }
    })
  }

  const items = computed(() => build(null))

  /** The folders above a bookmark, top first. */
  function foldersOf(id: string): Bookmark[] {
    const chain: Bookmark[] = []
    let parent = byId.value.get(id)?.parentId
    while (parent) {
      const folder = byId.value.get(parent)
      if (!folder) break
      chain.unshift(folder)
      parent = folder.parentId
    }
    return chain
  }

  /** Every folder (the top first), for pickers; never `except` or what's inside it. */
  function folderOptions(except?: string): FolderOption[] {
    const options: FolderOption[] = [{ id: null, label: 'Bookmarks', depth: 0 }]
    const walk = (parentId: string | null, depth: number) => {
      for (const bookmark of childrenOf.value.get(parentId) ?? []) {
        if (bookmark.kind !== 'folder' || bookmark.id === except) continue
        options.push({ id: bookmark.id, label: bookmark.title, depth })
        walk(bookmark.id, depth + 1)
      }
    }
    walk(null, 1)
    return options
  }

  /** Whether `id` is `folderId` or inside it. */
  function isWithin(id: string, folderId: string): boolean {
    return id === folderId || foldersOf(id).some((folder) => folder.id === folderId)
  }

  async function load() {
    try {
      list.value = await unwrap(api.bookmarks.$get())
      loaded.value = true
    } catch {
      // Kept as they were: the next change reloads them.
    }
  }

  /** Loads them, then reloads on changes while the calling component lives (the layout). */
  function follow() {
    void load()
    useServerEvents((event) => {
      if (event.type === 'bookmarks' || event.type === 'resync') void load()
    })
  }

  /** A change the server answers with the bookmark: shown at once, the list reloaded after. */
  function keep(bookmark: Bookmark) {
    list.value = [...list.value.filter((other) => other.id !== bookmark.id), bookmark]
    void load()
    return bookmark
  }

  /** A new bookmark or folder. A page already bookmarked fails with a 409 naming its bookmark. */
  async function create(fields: BookmarkFields & { kind?: Bookmark['kind'] }) {
    const made = keep(await unwrap(api.bookmarks.$post({ json: fields })))
    undoHistory.record({
      label: made.kind === 'folder' ? 'New folder' : 'New bookmark',
      undo: async () => {
        await unwrap(api.bookmarks[':id'].$delete({ param: { id: currentId(made.id) } }))
        void load()
      },
      redo: async () => {
        const again = keep(await unwrap(api.bookmarks.$post({ json: fields })))
        remade.set(currentId(made.id), again.id)
      },
    })
    return made
  }

  /** Changes a bookmark's fields, as a step of the undo history. */
  async function update(id: string, fields: BookmarkFields) {
    const old = byId.value.get(id)
    const changed = await patch(id, fields)
    if (old) {
      const before = Object.fromEntries(
        Object.keys(fields).map((key) => [key, old[key as keyof typeof old]]),
      ) as BookmarkFields
      remember('Edit the bookmark', id, before, fields)
    }
    return changed
  }

  function patch(id: string, fields: BookmarkFields) {
    return unwrap(api.bookmarks[':id'].$patch({ param: { id: currentId(id) }, json: fields })).then(
      keep,
    )
  }

  function remember(label: string, id: string, before: BookmarkFields, after: BookmarkFields) {
    undoHistory.record({
      label,
      undo: () => patch(id, before).then(() => true),
      redo: () => patch(id, after).then(() => true),
    })
  }

  /** Moves a bookmark or folder into a folder (null: the top), at `index` (default: last). */
  async function move(id: string, parentId: string | null, index?: number) {
    const old = byId.value.get(id)
    const from = old?.parentId ?? null
    const was = (childrenOf.value.get(from) ?? []).findIndex((b) => b.id === id)
    // Shown at once where it goes, before the server's answer.
    const siblings = (childrenOf.value.get(parentId) ?? []).filter((b) => b.id !== id)
    const at = index ?? siblings.length
    const before = siblings[at - 1]?.position ?? 0
    const after = siblings[at]?.position ?? before + 2
    list.value = list.value.map((bookmark) =>
      bookmark.id === id ? { ...bookmark, parentId, position: (before + after) / 2 } : bookmark,
    )
    const moved = await patch(id, { parentId, index: at })
    if (old) remember('Move', id, { parentId: from, index: was }, { parentId, index: at })
    return moved
  }

  /** Deletes it (a folder with its contents) for good; its cards leave the pages showing them. */
  async function remove(id: string) {
    const result = await unwrap(api.bookmarks[':id'].$delete({ param: { id } }))
    void load()
    // Open notes reload: the server's changes are credited to the owner, which they skip.
    for (const page of result.pages) announce({ type: 'cards-removed', id: page.id })
    return result
  }

  /** The pages showing a bookmark (or anything in a folder). */
  async function refs(id: string) {
    return unwrap(api.bookmarks[':id'].refs.$get({ param: { id } }))
  }

  return {
    list,
    loaded,
    byId,
    childrenOf,
    items,
    foldersOf,
    folderOptions,
    isWithin,
    load,
    follow,
    create,
    update,
    move,
    remove,
    refs,
  }
}
