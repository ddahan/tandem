// What can be done with a bookmark from anywhere (Unsorted, a card, its page): make one in a
// dialog, pick one for a note, delete one once confirmed (naming the pages that show it).
// Editing one is done where it shows (BookmarkFields: its card, or a popover next to its row).
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

  /** A new bookmark (for an address; with `inbox`, its card in the inbox note). */
  async function create(options: { url?: string; inbox?: boolean } = {}) {
    editor ??= overlay.create(BookmarkDialog)
    return ((await editor.open(options).result) as Bookmark | null) ?? null
  }

  /** A bookmark to show in a note (or a new one); resolves to its id (null: cancelled). */
  async function pick(): Promise<string | null> {
    picker ??= overlay.create(BookmarkPicker)
    return ((await picker.open().result) as string | null) ?? null
  }

  /** Deletes a bookmark once confirmed; resolves to whether it was. */
  async function remove(bookmark: Bookmark): Promise<boolean> {
    let pages
    try {
      pages = await bookmarks.refs(bookmark.id)
    } catch (error) {
      showError(error, 'Could not delete the bookmark')
      return false
    }
    deleter ??= overlay.create(BookmarkDeleteDialog)
    if (!(await deleter.open({ bookmark, pages }).result)) return false
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

  return { create, pick, remove }
}
