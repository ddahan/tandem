// A note in a window of its own ("Open in new window"), to put two notes side by side: the note
// alone, without the sidebar, the tab bar or the side panel. The window's address says so
// (`?window`), and keeps saying so on every page it goes to (middleware/note-window.global.ts),
// so that a reload keeps it. It leaves the main window's tabs alone (useTabs): they are kept in
// localStorage, which every window shares.

export const NOTE_WINDOW_QUERY = 'window'

/** Set by the window's first address, for its whole life. */
const noteWindow =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has(NOTE_WINDOW_QUERY)

/** Whether this window shows a note alone. */
export function isNoteWindow() {
  return noteWindow
}

/**
 * Opens a note in a window of its own, as tall as the screen and narrower than it (room for
 * another beside it). One window per note: opening it again brings its window to the front.
 */
export function openNoteWindow(id: string) {
  const width = Math.min(900, screen.availWidth)
  const opened = window.open(
    `/notes/${encodeURIComponent(id)}?${NOTE_WINDOW_QUERY}`,
    `tandem-note-${id}`,
    `popup,width=${width},height=${screen.availHeight}`,
  )
  opened?.focus()
}
