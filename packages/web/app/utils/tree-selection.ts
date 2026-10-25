// Several rows selected in a sidebar tree (pages or bookmarks), as in Finder: ⌘-click adds a row
// or takes it out (the open one first, when nothing was selected), ⇧-click selects the rows shown
// from the last one clicked; a plain click starts again from that row. An action on a selected
// row (⌘⌫, its menu, dragging it) acts on all of them; on another row, on that row alone.

export interface TreeSelection {
  /** The rows selected, in the order they were picked; only two or more count as a selection. */
  ids: string[]
  /** Where a ⇧-click range starts: the last row clicked. */
  anchor: string | null
}

export function emptySelection(): TreeSelection {
  return { ids: [], anchor: null }
}

export interface RowClick {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

/**
 * A click on row `id`: the selection after it, and whether it was a selecting click (⌘ or ⇧,
 * which opens nothing). `shown` is the rows as they show, in order (folded ones left out);
 * `current` the row open, the selection's start when there is none yet.
 */
export function clickRow(
  selection: TreeSelection,
  event: RowClick,
  id: string,
  shown: string[],
  current: string | null,
): { selection: TreeSelection; selecting: boolean } {
  const start = selection.ids.length ? selection.ids : current && current !== id ? [current] : []
  if (event.metaKey || event.ctrlKey) {
    const ids = start.includes(id) ? start.filter((x) => x !== id) : [...start, id]
    return { selection: { ids, anchor: id }, selecting: true }
  }
  if (event.shiftKey) {
    const anchor = selection.anchor ?? current
    const from = anchor ? shown.indexOf(anchor) : -1
    const to = shown.indexOf(id)
    if (from < 0 || to < 0) return { selection: { ids: [id], anchor: id }, selecting: true }
    const ids = shown.slice(Math.min(from, to), Math.max(from, to) + 1)
    return { selection: { ids, anchor: selection.anchor ?? anchor }, selecting: true }
  }
  return { selection: { ids: [], anchor: id }, selecting: false }
}

/** Whether `id` shows as selected: one of two or more. */
export function isSelected(selection: TreeSelection, id: string): boolean {
  return selection.ids.length > 1 && selection.ids.includes(id)
}

/**
 * What an action on row `id` acts on: the selection when the row is in it (without the rows
 * inside a selected folder: they go with it), otherwise the row alone. `isWithin(a, b)`: whether
 * `a` is `b` or inside it.
 */
export function actedOn(
  selection: TreeSelection,
  id: string,
  isWithin: (a: string, b: string) => boolean,
): string[] {
  if (!isSelected(selection, id)) return [id]
  return selection.ids.filter(
    (one) => !selection.ids.some((other) => other !== one && isWithin(one, other)),
  )
}

/** The rows as they show, in order: those inside folded ones left out. */
export function shownIds<T extends { id: string; children?: T[] }>(
  items: T[],
  expanded: string[],
): string[] {
  return items.flatMap((item) => [
    item.id,
    ...(item.children && expanded.includes(item.id) ? shownIds(item.children, expanded) : []),
  ])
}
