// The bookmark being edited in the popover next to its row (Unsorted, the side panel), shown by
// BookmarkEditPopover in the layout: bookmarks have no page, they are edited where they show
// (in a note, their card edits itself: BookmarkView).

interface Editing {
  id: string
  /** The row it is shown next to. */
  anchor: HTMLElement
}

const editing = shallowRef<Editing | null>(null)

export function useBookmarkEditor() {
  /** Edits a bookmark next to `anchor`. */
  function edit(id: string, anchor: HTMLElement) {
    editing.value = { id, anchor }
  }
  function close() {
    editing.value = null
  }
  return { editing: readonly(editing), edit, close }
}
