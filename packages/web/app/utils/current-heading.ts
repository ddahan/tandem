// Which heading the reader is in, for the outline's highlight: the editor measures, this decides.

export interface ScrollView {
  /** Top of the scrolling area, on screen. */
  top: number
  /** Its visible height. */
  height: number
  scrollTop: number
  scrollHeight: number
}

/**
 * The index of the heading the reader is in (-1 before the first one), from the headings' tops
 * on screen, in document order. A heading is current once it rises past a reading line, a
 * quarter of the way down. Near the end of the note the line slides down to the bottom, so
 * that the last sections, which can't scroll that high, still each become current in turn.
 * A note that doesn't scroll keeps the line where it is.
 */
export function currentHeading(tops: readonly number[], view: ScrollView): number {
  const maxScroll = Math.max(0, view.scrollHeight - view.height)
  const remaining = Math.max(0, maxScroll - view.scrollTop)
  const sweep = Math.min(view.height * 0.75, maxScroll)
  const slide = sweep > 0 ? Math.max(0, 1 - remaining / sweep) : 0
  const line = view.top + view.height * (0.25 + 0.75 * slide)
  let current = -1
  for (const [index, top] of tops.entries()) {
    // 1px of slack: a heading scrolled exactly to the line counts.
    if (top <= line + 1) current = index
    else break
  }
  return current
}

/** The nearest ancestor that scrolls vertically (the editor's: the note panel's body). */
export function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent
  }
  return null
}
