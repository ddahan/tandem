<script setup lang="ts">
// The sidebar tree: pages and folders, with drag and drop (before, after or inside a node),
// inline renaming and a menu on each row (its ⋯ button, or a right-click).
import type { DropdownMenuItem } from '@nuxt/ui'
import { useLocalStorage } from '@vueuse/core'
import type { TreeItem } from '~/composables/useTree'

const tree = useTree()
const route = useRoute()
const showError = useApiErrorToast()

const expanded = useLocalStorage<string[]>('tandem-tree-expanded', [])
const currentId = computed(() => (route.name === 'notes-id' ? String(route.params.id) : null))

// Keep the current note visible: expand its ancestors.
watch(
  [currentId, () => tree.nodes.value.length],
  () => {
    if (!currentId.value) return
    const ancestors = tree
      .ancestors(currentId.value)
      .slice(0, -1)
      .map((n) => n.id)
    const missing = ancestors.filter((id) => !expanded.value.includes(id))
    if (missing.length) expanded.value = [...expanded.value, ...missing]
  },
  { immediate: true },
)

function open(item: TreeItem) {
  if (item.node.kind === 'page') void navigateTo(`/notes/${item.id}`)
  else toggle(item.id)
}

function toggle(id: string) {
  expanded.value = expanded.value.includes(id)
    ? expanded.value.filter((x) => x !== id)
    : [...expanded.value, id]
}

// --- Renaming ------------------------------------------------------------------------------

const renamingId = ref<string | null>(null)
const renameValue = ref('')

function startRename(item: TreeItem) {
  renamingId.value = item.id
  renameValue.value = item.label
}

async function commitRename() {
  const id = renamingId.value
  renamingId.value = null
  const title = renameValue.value.trim()
  if (id && title && title !== tree.byId.value.get(id)?.title) await tree.rename(id, title)
}

// --- Deleting and keyboard ---------------------------------------------------------------------

/** The node whose icon is being changed (picker dialog). */
const iconFor = ref<TreeItem | null>(null)

async function trash(item: TreeItem) {
  const wasOpen = currentId.value && tree.isWithin(currentId.value, item.id)
  if ((await tree.moveToTrash(item.id)) && wasOpen) await navigateTo('/')
}

/** Moves a node up or down among its siblings, and keeps the focus on it. */
async function moveSibling(item: TreeItem, step: -1 | 1) {
  const siblings = tree.childrenOf.value.get(item.node.parentId) ?? []
  const index = siblings.findIndex((n) => n.id === item.id) + step
  if (index < 0 || index >= siblings.length) return
  await tree.move(item.id, item.node.parentId, index)
  await nextTick()
  document.querySelector<HTMLElement>(`[data-node-id="${item.id}"]`)?.focus()
}

/**
 * Keys on a focused row (arrows, ↵ and → ← are the tree's own): ⌘⌫ (or Delete) to the trash,
 * F2 to rename, ⌥↑/⌥↓ to reorder. Listed on the Shortcuts page and in the row's menu.
 */
function onRowKeydown(event: KeyboardEvent, item: TreeItem) {
  if (renamingId.value) return
  const handle = (action: () => unknown) => {
    event.preventDefault()
    // Before the tree's own arrow handling (which would move the focus).
    event.stopImmediatePropagation()
    void action()
  }
  if ((event.key === 'Backspace' && (event.metaKey || event.ctrlKey)) || event.key === 'Delete') {
    handle(() => trash(item))
  } else if (event.key === 'F2') {
    handle(() => startRename(item))
  } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    handle(() => moveSibling(item, event.key === 'ArrowUp' ? -1 : 1))
  }
}

// --- Menu ------------------------------------------------------------------------------------

async function createInside(item: TreeItem | null, kind: 'page' | 'folder') {
  if (item && !expanded.value.includes(item.id)) expanded.value = [...expanded.value, item.id]
  if (kind === 'page') await tree.createPage(item?.id ?? null)
  else {
    const folder = await tree.createFolder(item?.id ?? null)
    if (folder) startRename({ id: folder.id, label: folder.title, node: folder, icon: '' })
  }
}

function menu(item: TreeItem): DropdownMenuItem[][] {
  return [
    [
      {
        label: 'New page inside',
        icon: 'i-lucide-file-plus',
        onSelect: () => void createInside(item, 'page'),
      },
      {
        label: 'New folder inside',
        icon: 'i-lucide-folder-plus',
        onSelect: () => void createInside(item, 'folder'),
      },
    ],
    [
      { label: 'Rename', icon: 'i-lucide-pencil', kbds: ['F2'], onSelect: () => startRename(item) },
      {
        label: 'Move up',
        icon: 'i-lucide-arrow-up',
        kbds: ['alt', 'arrowup'],
        onSelect: () => void moveSibling(item, -1),
      },
      {
        label: 'Move down',
        icon: 'i-lucide-arrow-down',
        kbds: ['alt', 'arrowdown'],
        onSelect: () => void moveSibling(item, 1),
      },
      {
        label: 'Change icon…',
        icon: 'i-lucide-smile-plus',
        onSelect: () => (iconFor.value = item),
      },
      ...(item.node.kind === 'page'
        ? [
            {
              label: 'Copy link',
              icon: 'i-lucide-link',
              onSelect: () =>
                void navigator.clipboard.writeText(`[[${item.node.path.replace(/\.md$/, '')}]]`),
            },
          ]
        : []),
    ],
    [
      {
        label: 'Move to trash',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        kbds: ['meta', 'backspace'],
        onSelect: () => void trash(item),
      },
    ],
  ]
}

const rootMenu: DropdownMenuItem[] = [
  {
    label: 'New page',
    icon: 'i-lucide-file-plus',
    kbds: ['meta', 'alt', 'n'],
    onSelect: () => void createInside(null, 'page'),
  },
  {
    label: 'New folder',
    icon: 'i-lucide-folder-plus',
    onSelect: () => void createInside(null, 'folder'),
  },
]

// A right-click opens the menu of the row under the pointer (the root menu elsewhere), or the
// browser's own in the rename field. One menu for the whole tree: UTree gives each row's root
// element its focus and keys, which a menu wrapping the row would take.
const contextItem = ref<TreeItem | null>(null)
const contextItems = computed(() => (contextItem.value ? menu(contextItem.value) : rootMenu))

function onContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('input')) {
    // Before the menu's own handler (inside): the browser's menu shows.
    event.stopPropagation()
    return
  }
  const id = target.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId
  contextItem.value = (id && findItem(tree.items.value, id)) || null
}

function findItem(items: TreeItem[], id: string): TreeItem | undefined {
  for (const item of items) {
    const found = item.id === id ? item : item.children && findItem(item.children, id)
    if (found) return found
  }
}

// --- Drag and drop ---------------------------------------------------------------------------

type DropZone = 'before' | 'inside' | 'after'
const dragged = ref<string | null>(null)
const dropTarget = ref<{ id: string | null; zone: DropZone } | null>(null)

function onDragStart(event: DragEvent, item: TreeItem) {
  dragged.value = item.id
  event.dataTransfer?.setData('application/x-tandem-node', item.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function zoneOf(event: DragEvent): DropZone {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = (event.clientY - rect.top) / rect.height
  return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
}

function canDrop(targetId: string): boolean {
  return !!dragged.value && dragged.value !== targetId && !tree.isWithin(targetId, dragged.value)
}

function onDragOver(event: DragEvent, item: TreeItem) {
  if (!canDrop(item.id)) return
  event.preventDefault()
  dropTarget.value = { id: item.id, zone: zoneOf(event) }
}

async function onDrop(event: DragEvent, item: TreeItem) {
  event.preventDefault()
  const id = dragged.value
  const zone = zoneOf(event)
  const allowed = canDrop(item.id)
  reset()
  if (!id || !allowed) return
  if (zone === 'inside') {
    if (!expanded.value.includes(item.id)) expanded.value = [...expanded.value, item.id]
    await tree.move(id, item.id)
    return
  }
  const parentId = item.node.parentId
  const siblings = (tree.childrenOf.value.get(parentId) ?? []).filter((n) => n.id !== id)
  const index = siblings.findIndex((n) => n.id === item.id) + (zone === 'after' ? 1 : 0)
  await tree.move(id, parentId, index)
}

function onDropOnRoot(event: DragEvent) {
  event.preventDefault()
  const id = dragged.value
  reset()
  if (id) void tree.move(id, null).catch(showError)
}

function reset() {
  dragged.value = null
  dropTarget.value = null
}

function rowClass(item: TreeItem) {
  const target = dropTarget.value?.id === item.id ? dropTarget.value.zone : null
  return [
    currentId.value === item.id
      ? 'bg-elevated text-highlighted font-medium'
      : 'text-default hover:bg-elevated/60',
    dragged.value === item.id && 'opacity-50',
    target === 'inside' && 'ring-2 ring-primary ring-inset',
    target === 'before' && 'shadow-[inset_0_2px_0_0_var(--ui-primary)]',
    target === 'after' && 'shadow-[inset_0_-2px_0_0_var(--ui-primary)]',
  ]
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="flex items-center justify-between px-2.5 pb-1">
      <span class="text-xs font-medium text-muted">Pages</span>
      <UDropdownMenu :items="rootMenu" :content="{ align: 'start', ...keepMovedFocus }">
        <UButton
          icon="i-lucide-plus"
          size="xs"
          color="neutral"
          variant="ghost"
          aria-label="New page or folder"
        />
      </UDropdownMenu>
    </div>

    <div
      class="min-h-0 flex-1 overflow-y-auto px-1"
      @dragover.prevent
      @drop="onDropOnRoot"
      @dragend="reset"
      @contextmenu.capture="onContextMenu"
    >
      <UContextMenu :items="contextItems" :content="keepMovedFocus">
        <div class="min-h-full pb-6" data-testid="tree-menu-area">
          <UTree
            v-model:expanded="expanded"
            :items="tree.items.value"
            :get-key="(item: TreeItem) => item.id"
            :on-select="
              (event: Event, item: TreeItem) => {
                event.preventDefault()
                open(item)
              }
            "
            :ui="{ listWithChildren: 'ms-3 border-s border-default ps-1' }"
            size="sm"
          >
            <template #item-wrapper="{ item, expanded: isExpanded }">
              <div
                class="group relative flex h-7 cursor-pointer items-center gap-1 rounded-md ps-1 pe-1 text-sm transition-colors select-none"
                :class="rowClass(item)"
                draggable="true"
                :data-node-id="item.id"
                @keydown.capture="onRowKeydown($event, item)"
                :data-testid="`tree-${item.label}`"
                @click="open(item)"
                @dragstart="onDragStart($event, item)"
                @dragover.stop="onDragOver($event, item)"
                @dragleave="dropTarget = null"
                @drop.stop="onDrop($event, item)"
                @dragend="reset"
              >
                <button
                  v-if="item.children?.length"
                  type="button"
                  class="grid size-5 shrink-0 place-items-center rounded text-dimmed hover:text-default"
                  :aria-label="isExpanded ? 'Collapse' : 'Expand'"
                  @click.stop="toggle(item.id)"
                >
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-3.5 transition-transform"
                    :class="isExpanded && 'rotate-90'"
                  />
                </button>
                <span v-else class="size-5 shrink-0" />
                <NodeIcon :icon="item.node.icon" :kind="item.node.kind" />

                <UInput
                  v-if="renamingId === item.id"
                  v-model="renameValue"
                  size="xs"
                  autofocus
                  aria-label="New title"
                  class="min-w-0 flex-1"
                  @click.stop
                  @keydown.enter.prevent="commitRename"
                  @keydown.esc.prevent="renamingId = null"
                  @blur="commitRename"
                />
                <span v-else class="min-w-0 flex-1 truncate" @dblclick.stop="startRename(item)">{{
                  item.label
                }}</span>

                <div
                  v-if="renamingId !== item.id"
                  class="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                  @click.stop
                >
                  <UDropdownMenu
                    :items="menu(item)"
                    :content="{ align: 'start', ...keepMovedFocus }"
                  >
                    <UButton
                      icon="i-lucide-ellipsis"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      aria-label="Actions"
                    />
                  </UDropdownMenu>
                  <UButton
                    icon="i-lucide-plus"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    aria-label="New page inside"
                    @click="createInside(item, 'page')"
                  />
                </div>
              </div>
            </template>
          </UTree>

          <UEmpty
            v-if="tree.loaded.value && !tree.items.value.length"
            icon="i-lucide-notebook-pen"
            title="No pages yet"
            description="Create your first page."
            :actions="[
              { label: 'New page', icon: 'i-lucide-plus', onClick: () => void tree.createPage() },
            ]"
            size="sm"
            variant="naked"
          />
        </div>
      </UContextMenu>
    </div>

    <UModal
      :open="!!iconFor"
      :title="iconFor ? `Icon of “${iconFor.label}”` : ''"
      :ui="{ content: 'max-w-fit', body: 'p-0 sm:p-0' }"
      @update:open="(open) => !open && (iconFor = null)"
    >
      <template #body>
        <LazyIconPicker
          v-if="iconFor"
          :node-id="iconFor.id"
          :has-icon="!!iconFor.node.icon"
          @done="iconFor = null"
        />
      </template>
    </UModal>
  </div>
</template>
