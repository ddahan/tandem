// The order of the favorites (Settings.favoriteIds), as pure functions: what dropping pages at a
// place in the list, or taking one out, gives.

/**
 * The list with `ids` at `index`, counted among the others (those not moved): already there,
 * they move; new, they are added. Without an index, at the end.
 */
export function placeFavorites(list: string[], ids: string[], index?: number): string[] {
  const moved = [...new Set(ids)]
  const rest = list.filter((id) => !moved.includes(id))
  const at = index === undefined ? rest.length : Math.max(0, Math.min(index, rest.length))
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)]
}

/** The list without `id`. */
export function removeFavorite(list: string[], id: string): string[] {
  return list.filter((x) => x !== id)
}

/**
 * Where a favorite goes one step up or down among those `shown` (the list may hold others: in
 * the trash, not shown), as an index for placeFavorites; null when it can't go further.
 */
export function stepFavorite(
  list: string[],
  shown: string[],
  id: string,
  step: -1 | 1,
): number | null {
  const at = shown.indexOf(id)
  const neighbor = shown[at + step]
  if (at < 0 || !neighbor) return null
  const rest = list.filter((x) => x !== id)
  const index = rest.indexOf(neighbor)
  return step < 0 ? index : index + 1
}
