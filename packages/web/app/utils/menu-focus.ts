// Where the focus goes when a menu closes. A menu gives it back to its button, after its closing
// animation: by then, an action may have put it somewhere on purpose (a new page's title, a
// rename field), and taking it back would make the user click there again.

/** Spread into a menu's `content` option: the focus stays where the chosen action put it. */
export const keepMovedFocus = {
  onCloseAutoFocus(event: Event) {
    const active = document.activeElement
    if (active && active !== document.body && !active.closest('[role="menu"]')) {
      event.preventDefault()
    }
  },
}
