// The tree of pages and folders, shared by the sidebar, breadcrumbs, links and search. Making,
// renaming, moving a page and moving it to the trash are steps of the undo history (useUndo).
import { CALENDAR_DIR, calendarDateOf, type NodeKind, type TreeNode } from '@tandem/shared'
import type { UndoStep } from '~/utils/undo-history'

export interface TreeItem {
  id: string
  label: string
  node: TreeNode
  icon: string
  children?: TreeItem[]
}

function sortNodes(a: TreeNode, b: TreeNode): number {
  return a.position - b.position || a.title.localeCompare(b.title)
}

/** What deleting a page forever means, for the dialogs that ask (the trash off). */
export const DELETE_FOREVER =
  'It, its child pages, their attachments and history are deleted. This cannot be undone.'

/** The same, for several pages selected. */
export const DELETE_MANY_FOREVER =
  'They, their child pages, attachments and history are deleted. This cannot be undone.'

export function useTree() {
  const nodes = useState<TreeNode[]>('tree:nodes', () => [])
  const loaded = useState('tree:loaded', () => false)
  const api = useApi()
  const showError = useApiErrorToast()
  const toast = useToast()
  const undoHistory = useUndo()

  const byId = computed(() => new Map(nodes.value.map((node) => [node.id, node])))

  const childrenOf = computed(() => {
    const map = new Map<string | null, TreeNode[]>()
    for (const node of nodes.value)
      map.set(node.parentId, [...(map.get(node.parentId) ?? []), node])
    for (const list of map.values()) list.sort(sortNodes)
    return map
  })

  /**
   * How a node shows: every node is a page, and one without content but with child pages is a
   * folder (on disk too: see TreeNode.empty).
   */
  function kindOf(node: TreeNode): NodeKind {
    return node.empty && childrenOf.value.get(node.id)?.length ? 'folder' : 'page'
  }

  // Daily notes on, their notes aren't in the tree (the calendar leads to them), nor their
  // Calendar folder once it holds nothing else.
  const { settings } = useSettings()
  function hidden(node: TreeNode, children: TreeItem[]): boolean {
    if (!settings.value.daily) return false
    if (calendarDateOf(node.path)) return true
    return node.path.toLowerCase() === CALENDAR_DIR.toLowerCase() && !children.length
  }

  function build(parentId: string | null): TreeItem[] {
    return (childrenOf.value.get(parentId) ?? []).flatMap((node) => {
      const children = build(node.id)
      if (hidden(node, children)) return []
      return {
        id: node.id,
        label: node.title,
        node,
        icon: kindOf(node) === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text',
        children: children.length ? children : undefined,
      }
    })
  }

  const items = computed<TreeItem[]>(() => build(null))

  /** Root first, the node itself last. */
  function ancestors(id: string): TreeNode[] {
    const chain: TreeNode[] = []
    let current = byId.value.get(id)
    while (current) {
      chain.unshift(current)
      current = current.parentId ? byId.value.get(current.parentId) : undefined
    }
    return chain
  }

  async function refresh() {
    nodes.value = await unwrap(api.tree.$get())
    loaded.value = true
  }

  async function createPage(parentId: string | null = null, title = 'Untitled') {
    try {
      const node = await unwrap(api.notes.$post({ json: { parentId, title } }))
      nodes.value = [...nodes.value, node]
      // Undone: to the trash (a page can't be made again with its id); redone: back from it.
      let trashId = ''
      undoHistory.record({
        label: 'New page',
        undo: async () => {
          trashId = await trash(node.id)
        },
        redo: () => restore(trashId),
      })
      await navigateTo(`/notes/${node.id}?new=1`)
      return node
    } catch (error) {
      showError(error, 'Could not create the page')
    }
  }

  /**
   * A new page next to another one (⌘T on a note): the same parent, right after it. Without
   * one, or one not in the tree, at the top level.
   */
  async function createPageNextTo(id: string | null) {
    const current = id ? byId.value.get(id) : undefined
    // Next to a daily note would be in Calendar, out of sight.
    if (!current || calendarDateOf(current.path)) return createPage()
    const siblings = childrenOf.value.get(current.parentId) ?? []
    const index = siblings.findIndex((n) => n.id === current.id) + 1
    const node = await createPage(current.parentId)
    // Part of making it: not a step of its own.
    if (node) await place(node.id, current.parentId, index)
    return node
  }

  async function rename(id: string, title: string) {
    const before = byId.value.get(id)?.title
    try {
      const node = await setTitle(id, title)
      if (before !== undefined && before !== node.title) {
        undoHistory.record({
          label: 'Rename',
          undo: () => setTitle(id, before).then(() => true),
          redo: () => setTitle(id, title).then(() => true),
        })
      }
      return node
    } catch (error) {
      showError(error, 'Could not rename')
      await refresh()
    }
  }

  async function setTitle(id: string, title: string) {
    const node = await unwrap(api.nodes[':id'].$patch({ param: { id }, json: { title } }))
    await refresh()
    return node
  }

  /** Moves a node into `parentId` (null: the top), at `index` among its pages (default: last). */
  async function move(id: string, parentId: string | null, index?: number) {
    const node = byId.value.get(id)
    const from = node?.parentId ?? null
    const at = (childrenOf.value.get(from) ?? []).findIndex((n) => n.id === id)
    await place(id, parentId, index)
    const moved = byId.value.get(id)
    if (!node || !moved) return
    const to = moved.parentId
    const now = (childrenOf.value.get(to) ?? []).findIndex((n) => n.id === id)
    if (to === from && now === at) return
    undoHistory.record({
      label: 'Move',
      undo: () => place(id, from, at),
      redo: () => place(id, to, now),
    })
  }

  /**
   * Moves several nodes (a selection) into `parentId`, one after the other from `index` (default:
   * at the end), as one step of the undo history.
   */
  async function moveMany(ids: string[], parentId: string | null, index?: number) {
    const before = ids.map((id) => {
      const from = byId.value.get(id)?.parentId ?? null
      return { id, from, at: (childrenOf.value.get(from) ?? []).findIndex((n) => n.id === id) }
    })
    for (const [i, id] of ids.entries()) {
      if (!(await place(id, parentId, index === undefined ? undefined : index + i))) return
    }
    const after = ids.map((id) => {
      const to = byId.value.get(id)?.parentId ?? null
      return { id, to, now: (childrenOf.value.get(to) ?? []).findIndex((n) => n.id === id) }
    })
    undoHistory.record({
      label: `Move ${ids.length} pages`,
      // Back in the reverse order: each one's place is as it was when it left.
      undo: async () => {
        for (const { id, from, at } of before.toReversed()) await place(id, from, at)
      },
      redo: async () => {
        for (const { id, to, now } of after) await place(id, to, now)
      },
    })
  }

  /** Moves a node (optimistic: shown at once), without an undo step. */
  async function place(id: string, parentId: string | null, index?: number) {
    // Optimistic: reorder locally, then let the server decide paths.
    const node = byId.value.get(id)
    if (node) {
      const siblings = (childrenOf.value.get(parentId) ?? []).filter((n) => n.id !== id)
      const position = index === undefined ? siblings.length : index
      siblings.splice(position, 0, { ...node, parentId })
      const positions = new Map(siblings.map((n, i) => [n.id, i]))
      nodes.value = nodes.value.map((n) =>
        n.id === id
          ? { ...n, parentId, position: positions.get(n.id)! }
          : positions.has(n.id)
            ? { ...n, position: positions.get(n.id)! }
            : n,
      )
    }
    try {
      await unwrap(api.nodes[':id'].move.$post({ param: { id }, json: { parentId, index } }))
    } catch (error) {
      showError(error, 'Could not move')
      await refresh()
      return false
    }
    await refresh()
    return true
  }

  /** Moves a node to the trash; its id there (to restore it). */
  async function trash(id: string) {
    const { trashId } = await unwrap(api.nodes[':id'].$delete({ param: { id } }))
    await refresh()
    return trashId
  }

  async function restore(trashId: string) {
    await unwrap(api.trash[':id'].restore.$post({ param: { id: trashId } }))
    await refresh()
  }

  /** Moves a node to the trash, as a step of the undo history (⌘Z restores it). */
  async function remove(id: string) {
    return (await trashWithUndo(id)) !== null
  }

  async function trashWithUndo(id: string) {
    const title = byId.value.get(id)?.title ?? 'Item'
    try {
      let trashId = await trash(id)
      const step: UndoStep = {
        label: `Move “${title}” to the trash`,
        undo: () => restore(trashId),
        redo: async () => {
          trashId = await trash(id)
        },
      }
      undoHistory.record(step)
      return { title, step }
    } catch (error) {
      showError(error, 'Could not delete')
      return null
    }
  }

  /**
   * Deletes a node and its pages forever (the trash turned off, Settings › Features), once the
   * caller has asked: through the trash, then out of it, as the server deletes only from there.
   */
  /**
   * Nothing would be lost by deleting it: no text, no pages inside, no attachments and no
   * history (a page just made, an empty folder). Deleting one then asks nothing. Read from the
   * server, as the tree's `empty` may be older than what was just typed.
   */
  async function isBlank(id: string): Promise<boolean> {
    if (childrenOf.value.get(id)?.length) return false
    try {
      const [detail, history] = await Promise.all([
        unwrap(api.notes[':id'].$get({ param: { id } })),
        unwrap(api.notes[':id'].history.$get({ param: { id } })),
      ])
      return !detail.content.trim() && !detail.attachments.length && !history.length
    } catch {
      return false
    }
  }

  async function deleteForever(id: string) {
    try {
      const { trashId } = await unwrap(api.nodes[':id'].$delete({ param: { id } }))
      await unwrap(api.trash[':id'].$delete({ param: { id: trashId } }))
      await refresh()
      return true
    } catch (error) {
      await refresh()
      showError(error, 'Could not delete')
      return false
    }
  }

  /** Moves a node to the trash right away, with an "Undo" in the toast (and ⌘Z). */
  async function moveToTrash(id: string): Promise<boolean> {
    const trashed = await trashWithUndo(id)
    if (!trashed) return false
    toast.add({
      title: `“${trashed.title}” moved to the trash`,
      icon: 'i-lucide-trash-2',
      actions: [
        {
          label: 'Undo',
          icon: 'i-lucide-undo-2',
          color: 'neutral',
          variant: 'outline',
          onClick: () => void undoHistory.revert(trashed.step),
        },
      ],
    })
    return true
  }

  /** Moves several nodes (a selection) to the trash, as one step: one message, one Undo. */
  async function moveManyToTrash(ids: string[]): Promise<boolean> {
    const trashed: { id: string; trashId: string }[] = []
    try {
      for (const id of ids) trashed.push({ id, trashId: await trash(id) })
    } catch (error) {
      showError(error, 'Could not delete')
    }
    if (!trashed.length) return false
    const step: UndoStep = {
      label: `Move ${trashed.length} pages to the trash`,
      undo: async () => {
        for (const one of trashed.toReversed()) await restore(one.trashId)
      },
      redo: async () => {
        for (const one of trashed) one.trashId = await trash(one.id)
      },
    }
    undoHistory.record(step)
    toast.add({
      title: `${trashed.length} pages moved to the trash`,
      icon: 'i-lucide-trash-2',
      actions: [
        {
          label: 'Undo',
          icon: 'i-lucide-undo-2',
          color: 'neutral',
          variant: 'outline',
          onClick: () => void undoHistory.revert(step),
        },
      ],
    })
    return true
  }

  /** Is `id` the node `ancestorId` or below it? */
  function isWithin(id: string, ancestorId: string): boolean {
    return ancestors(id).some((node) => node.id === ancestorId)
  }

  return {
    nodes,
    loaded,
    byId,
    childrenOf,
    items,
    ancestors,
    isWithin,
    refresh,
    createPage,
    createPageNextTo,
    kindOf,
    rename,
    move,
    moveMany,
    remove,
    deleteForever,
    isBlank,
    moveToTrash,
    moveManyToTrash,
  }
}
