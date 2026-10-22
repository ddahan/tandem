// Where the focus goes when a menu closes. A menu gives it back to its button, after its closing
// animation: by then, an action may have put it somewhere on purpose (a new page's title, a
// rename field), and taking it back would make the user click there again.

let moving = false

/**
 * Called by an action that will put the focus somewhere once it's done (a new page's title,
 * after the server's answer): the menu closing before then doesn't take it back for itself.
 */
export function focusWillMove() {
  moving = true
  // Not from a menu (a button), it would apply to a later one: it doesn't last.
  setTimeout(() => (moving = false), 1000)
}

/** Spread into a menu's `content` option: the focus stays where the chosen action put it. */
export const keepMovedFocus = {
  onCloseAutoFocus(event: Event) {
    if (moving) {
      moving = false
      event.preventDefault()
      return
    }
    const active = document.activeElement
    if (active && active !== document.body && !active.closest('[role="menu"]')) {
      event.preventDefault()
    }
  },
}
