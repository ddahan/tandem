// Favorites (Settings › Features): shortcuts to pages and folders, in a section above the pages.
// Only a list of ids in the settings (Settings.favoriteIds): the pages stay where they are. One
// in the trash isn't shown (its id stays: restored, it's back); the server forgets those deleted
// for good. Like other settings, changes aren't steps of the undo history.
import type { TreeNode } from '@tandem/shared'
import { placeFavorites, removeFavorite, stepFavorite } from '~/utils/favorites'

/** The drag type of a favorite being reordered in its section. */
export const FAVORITE_DRAG_TYPE = 'application/x-tandem-favorite'
/** The drag type of rows dragged from the pages' tree: their ids, one per line. */
export const NODES_DRAG_TYPE = 'application/x-tandem-nodes'

export function useFavorites() {
  const { settings } = useSettings()
  const save = useSettingsSave()
  const tree = useTree()

  const enabled = computed(() => settings.value.favorites)
  const ids = computed(() => settings.value.favoriteIds)

  /** The favorites shown: those still in the tree, in order. */
  const nodes = computed<TreeNode[]>(() => ids.value.flatMap((id) => tree.byId.value.get(id) ?? []))

  function isFavorite(id: string) {
    return ids.value.includes(id)
  }

  /** Adds pages (or moves favorites) at `index` among the favorites shown; at the end without. */
  function place(added: string[], index?: number) {
    const shown = nodes.value.filter((node) => !added.includes(node.id))
    // The index among those shown, as one in the whole list (hidden ones keep their place).
    const before = index === undefined ? undefined : shown[index]
    const rest = ids.value.filter((id) => !added.includes(id))
    const at = before ? rest.indexOf(before.id) : index === undefined ? undefined : rest.length
    return save({ favoriteIds: placeFavorites(ids.value, added, at) })
  }

  function remove(id: string) {
    return save({ favoriteIds: removeFavorite(ids.value, id) })
  }

  function toggle(id: string) {
    return isFavorite(id) ? remove(id) : place([id])
  }

  /** One step up or down among those shown. */
  function step(id: string, by: -1 | 1) {
    const shown = nodes.value.map((node) => node.id)
    const at = stepFavorite(ids.value, shown, id, by)
    if (at === null) return
    return save({ favoriteIds: placeFavorites(ids.value, [id], at) })
  }

  return { enabled, ids, nodes, isFavorite, place, remove, toggle, step }
}
