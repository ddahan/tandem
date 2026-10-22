// What can be done with a bookmark from anywhere (the sidebar, a card, its info): edit it in a
// dialog, make one, pick one for a note, delete one once confirmed (naming the pages that show
// it).
import type { Bookmark } from '@tandem/shared'
import BookmarkDeleteDialog from '~/components/BookmarkDeleteDialog.vue'
import BookmarkDialog from '~/components/BookmarkDialog.vue'
import BookmarkPicker from '~/components/BookmarkPicker.vue'

export function useBookmarkActions() {
  const overlay = useOverlay()
  // Made when first opened: every card in a note has these actions.
  let editor: ReturnType<typeof overlay.create<typeof BookmarkDialog>> | null = null
  let deleter: ReturnType<typeof overlay.create<typeof BookmarkDeleteDialog>> | null = null
  let picker: ReturnType<typeof overlay.create<typeof BookmarkPicker>> | null = null
  const bookmarks = useBookmarks()
  const toast = useToast()
  const showError = useApiErrorToast()

  /** Edits a bookmark or folder; resolves to it once saved (null: cancelled). */
  async function edit(bookmark: Bookmark): Promise<Bookmark | null> {
    editor ??= overlay.create(BookmarkDialog)
    return ((await editor.open({ bookmark }).result) as Bookmark | null) ?? null
  }

  /** A new bookmark (in a folder, for an address). */
  async function create(options: { parentId?: string | null; url?: string } = {}) {
    editor ??= overlay.create(BookmarkDialog)
    return ((await editor.open(options).result) as Bookmark | null) ?? null
  }

  /** A bookmark to show in a note (or a new one); resolves to its id (null: cancelled). */
  async function pick(): Promise<string | null> {
    picker ??= overlay.create(BookmarkPicker)
    return ((await picker.open().result) as string | null) ?? null
  }

  /** Deletes a bookmark or folder once confirmed; resolves to whether it was. */
  async function remove(bookmark: Bookmark): Promise<boolean> {
    let pages
    try {
      pages = await bookmarks.refs(bookmark.id)
    } catch (error) {
      showError(error, 'Could not delete the bookmark')
      return false
    }
    const count = bookmark.kind === 'folder' ? countIn(bookmark.id) : 1
    deleter ??= overlay.create(BookmarkDeleteDialog)
    const confirmed = Boolean(await deleter.open({ bookmark, pages, count }).result)
    if (!confirmed) return false
    try {
      const result = await bookmarks.remove(bookmark.id)
      toast.add({
        title: `Deleted “${bookmark.title}”`,
        description: result.pages.length
          ? `Removed from ${result.pages.length === 1 ? '1 page' : `${result.pages.length} pages`}.`
          : undefined,
        icon: 'i-lucide-trash-2',
      })
      return true
    } catch (error) {
      showError(error, 'Could not delete the bookmark')
      return false
    }
  }

  /** The bookmark or folder and everything in it. */
  function countIn(id: string) {
    let count = 0
    const walk = (parentId: string) => {
      count++
      for (const child of bookmarks.childrenOf.value.get(parentId) ?? []) walk(child.id)
    }
    walk(id)
    return count
  }

  return { edit, create, pick, remove }
}
