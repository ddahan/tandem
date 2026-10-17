// The tree of pages and folders, shared by the sidebar, breadcrumbs, links and search.
import type { TreeNode } from '@tandem/shared'

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

export function useTree() {
  const nodes = useState<TreeNode[]>('tree:nodes', () => [])
  const loaded = useState('tree:loaded', () => false)
  const api = useApi()
  const showError = useApiErrorToast()
  const toast = useToast()

  const byId = computed(() => new Map(nodes.value.map((node) => [node.id, node])))

  const childrenOf = computed(() => {
    const map = new Map<string | null, TreeNode[]>()
    for (const node of nodes.value)
      map.set(node.parentId, [...(map.get(node.parentId) ?? []), node])
    for (const list of map.values()) list.sort(sortNodes)
    return map
  })

  function build(parentId: string | null): TreeItem[] {
    return (childrenOf.value.get(parentId) ?? []).map((node) => {
      const children = build(node.id)
      return {
        id: node.id,
        label: node.title,
        node,
        icon: node.kind === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text',
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
      await navigateTo(`/notes/${node.id}?new=1`)
      return node
    } catch (error) {
      showError(error, 'Could not create the page')
    }
  }

  async function createFolder(parentId: string | null = null, title = 'New folder') {
    try {
      const node = await unwrap(api.folders.$post({ json: { parentId, title } }))
      nodes.value = [...nodes.value, node]
      return node
    } catch (error) {
      showError(error, 'Could not create the folder')
    }
  }

  async function rename(id: string, title: string) {
    try {
      const node = await unwrap(api.nodes[':id'].$patch({ param: { id }, json: { title } }))
      await refresh()
      return node
    } catch (error) {
      showError(error, 'Could not rename')
      await refresh()
    }
  }

  async function move(id: string, parentId: string | null, index?: number) {
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
    }
    await refresh()
  }

  async function remove(id: string) {
    try {
      await unwrap(api.nodes[':id'].$delete({ param: { id } }))
      await refresh()
      return true
    } catch (error) {
      showError(error, 'Could not delete')
      return false
    }
  }

  /** Moves a node to the trash right away, with an "Undo" in the toast (no confirmation). */
  async function moveToTrash(id: string): Promise<boolean> {
    const title = byId.value.get(id)?.title ?? 'Item'
    try {
      const { trashId } = await unwrap(api.nodes[':id'].$delete({ param: { id } }))
      await refresh()
      toast.add({
        title: `“${title}” moved to the trash`,
        icon: 'i-lucide-trash-2',
        actions: [
          {
            label: 'Undo',
            icon: 'i-lucide-undo-2',
            color: 'neutral',
            variant: 'outline',
            onClick: async () => {
              try {
                await unwrap(api.trash[':id'].restore.$post({ param: { id: trashId } }))
                await refresh()
              } catch (error) {
                showError(error, 'Could not restore')
              }
            },
          },
        ],
      })
      return true
    } catch (error) {
      showError(error, 'Could not delete')
      return false
    }
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
    createFolder,
    rename,
    move,
    remove,
    moveToTrash,
  }
}
