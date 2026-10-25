<script setup lang="ts">
// The sidebar tree of pages (a page without content but with child pages shows as a folder),
// with drag and drop (before, after or inside a node), several selected with ⌘- and ⇧-click
// (utils/tree-selection.ts), inline renaming and a menu on each row (its ⋯ button, or a
// right-click).
import type { DropdownMenuItem } from '@nuxt/ui'
import { useLocalStorage } from '@vueuse/core'
import { DELETE_FOREVER, DELETE_MANY_FOREVER, type TreeItem } from '~/composables/useTree'
import { actedOn, clickRow, emptySelection, isSelected, shownIds } from '~/utils/tree-selection'

const tree = useTree()
const route = useRoute()
const showError = useApiErrorToast()
const { settings } = useSettings()
const confirm = useConfirm()
// ⌘N in the installed app, ⌥⌘N in a browser tab (where ⌘N is the browser's).
const appWindow = useAppWindow()
const newPageKeys = computed(() => (appWindow.value ? ['meta', 'n'] : ['meta', 'alt', 'n']))

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

// Every row opens its page (a folder too: writing in it makes it a note) in the preview tab, as
// VS Code's explorer: a double click opens it in a tab of its own (useTabs). The arrow expands.
const tabs = useTabs()
function open(item: TreeItem) {
  void tabs.preview(`/notes/${item.id}`)
}
function openForGood(item: TreeItem) {
  void tabs.open(`/notes/${item.id}`)
}

// --- Selecting several ------------------------------------------------------------------------

const selection = ref(emptySelection())

/** A click on a row: ⌘ or ⇧ selects (and opens nothing), a plain click opens it. */
function onRowClick(event: MouseEvent, item: TreeItem) {
  const shown = shownIds(tree.items.value, expanded.value)
  const result = clickRow(selection.value, event, item.id, shown, currentId.value)
  selection.value = result.selection
  if (!result.selecting) open(item)
}

/** The tree's own choosing (a click, ↵ or space): opens the row, unless ⌘ or ⇧ selects it. */
function onSelect(event: Event, item: TreeItem) {
  event.preventDefault()
  const original = (event as CustomEvent<{ originalEvent?: MouseEvent }>).detail?.originalEvent
  if (!original?.metaKey && !original?.ctrlKey && !original?.shiftKey) open(item)
}

function clearSelection() {
  selection.value = emptySelection()
}

/** What an action on `item` acts on: the selection when it's in it, otherwise itself. */
function actedOnFrom(item: TreeItem) {
  return actedOn(selection.value, item.id, tree.isWithin)
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

// To the trash at once (Undo in the toast); with the trash off, deleted for good once confirmed,
// unless there's nothing to lose (a page just made, an empty folder: `isBlank`).
async function trash(item: TreeItem) {
  const ids = actedOnFrom(item)
  if (ids.length > 1) return trashMany(ids)
  // Its tab, and those of its pages, close by themselves (default.vue): the one used before shows.
  if (settings.value.trash) await tree.moveToTrash(item.id)
  else if (
    (await tree.isBlank(item.id)) ||
    (await confirm({
      title: `Delete “${item.node.title}” forever?`,
      description: DELETE_FOREVER,
      confirmLabel: 'Delete forever',
      confirmColor: 'error',
      icon: 'i-lucide-trash-2',
    }))
  )
    await tree.deleteForever(item.id)
}

/** A selection to the trash, or deleted for good with the trash off (asked once, if anything). */
async function trashMany(ids: string[]) {
  selection.value = emptySelection()
  if (settings.value.trash) {
    await tree.moveManyToTrash(ids)
    return
  }
  const blank = (await Promise.all(ids.map((id) => tree.isBlank(id)))).every(Boolean)
  const asked =
    blank ||
    (await confirm({
      title: `Delete ${ids.length} pages forever?`,
      description: DELETE_MANY_FOREVER,
      confirmLabel: 'Delete forever',
      confirmColor: 'error',
      icon: 'i-lucide-trash-2',
    }))
  if (asked) for (const id of ids) await tree.deleteForever(id)
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
 * Keys on a focused row (arrows, → ← are the tree's own): ↵ opens the page in a tab of its own
 * (a double click), ⌘⌫ (or Delete) to the trash, F2 to rename, ⌥↑/⌥↓ to reorder. Listed on the
 * Shortcuts page and in the row's menu.
 */
function onRowKeydown(event: KeyboardEvent, item: TreeItem) {
  if (renamingId.value) return
  const handle = (action: () => unknown) => {
    event.preventDefault()
    // Before the tree's own arrow handling (which would move the focus).
    event.stopImmediatePropagation()
    void action()
  }
  const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
  if (event.key === 'Enter' && plain) {
    handle(() => openForGood(item))
  } else if (
    (event.key === 'Backspace' && (event.metaKey || event.ctrlKey)) ||
    event.key === 'Delete'
  ) {
    handle(() => trash(item))
  } else if (event.key === 'F2') {
    handle(() => startRename(item))
  } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    handle(() => moveSibling(item, event.key === 'ArrowUp' ? -1 : 1))
  }
}

// Browsing with the arrows previews the page reached, as a click does (VS Code's explorer), once
// the keys pause: holding ↓ doesn't open every page on the way.
const BROWSE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])
let browsing = false
let browseTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(browseTimer))
function onTreeKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && selection.value.ids.length) selection.value = emptySelection()
  browsing = BROWSE_KEYS.has(event.key) && !event.altKey && !event.metaKey && !event.ctrlKey
}
function onTreeFocusin(event: FocusEvent) {
  if (!browsing || renamingId.value) return
  browsing = false
  const target = event.target as HTMLElement
  const row = target.closest('[data-node-id]') ?? target.querySelector('[data-node-id]')
  const id = row?.getAttribute('data-node-id')
  if (!id) return
  clearTimeout(browseTimer)
  browseTimer = setTimeout(() => void tabs.preview(`/notes/${id}`), 150)
}

// --- Menu ------------------------------------------------------------------------------------

async function createInside(item: TreeItem | null) {
  // Its title takes the focus once the page shows: the menu must not take it back meanwhile.
  focusWillMove()
  if (item && !expanded.value.includes(item.id)) expanded.value = [...expanded.value, item.id]
  await tree.createPage(item?.id ?? null)
}

function menu(item: TreeItem): DropdownMenuItem[][] {
  const ids = actedOnFrom(item)
  if (ids.length > 1) return selectionMenu(ids)
  return [
    [
      {
        label: 'New page inside',
        icon: 'i-lucide-file-plus',
        onSelect: () => void createInside(item),
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
      {
        label: 'Copy link',
        icon: 'i-lucide-link',
        onSelect: () =>
          void navigator.clipboard.writeText(`[[${item.node.path.replace(/\.md$/, '')}]]`),
      },
    ],
    [
      {
        label: settings.value.trash ? 'Move to trash' : 'Delete',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        kbds: ['meta', 'backspace'],
        onSelect: () => void trash(item),
      },
    ],
  ]
}

/** The menu of a selected row: for all of them. */
function selectionMenu(ids: string[]): DropdownMenuItem[][] {
  return [
    [
      {
        label: `Open ${ids.length} in tabs`,
        icon: 'i-lucide-panel-top',
        onSelect: async () => {
          clearSelection()
          for (const id of ids) await tabs.open(`/notes/${id}`)
        },
      },
      { label: 'Move to', icon: 'i-lucide-folder-input', children: moveTargets(ids) },
    ],
    [
      {
        label: settings.value.trash ? `Move ${ids.length} to the trash` : `Delete ${ids.length}…`,
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        kbds: ['meta', 'backspace'],
        onSelect: () => void trashMany(ids),
      },
    ],
  ]
}

/**
 * Where a selection can go: the top, or a folder or page holding pages, as the tree shows them
 * (not one of the selection, nor inside one).
 */
function moveTargets(ids: string[]): DropdownMenuItem[] {
  const go = (parentId: string | null) => {
    clearSelection()
    void tree.moveMany(ids, parentId)
  }
  const targets: DropdownMenuItem[] = []
  const walk = (items: TreeItem[], path: string[]) => {
    for (const item of items) {
      if (ids.some((id) => tree.isWithin(item.id, id))) continue
      const label = [...path, item.label]
      if (item.children || tree.kindOf(item.node) === 'folder') {
        targets.push({
          label: label.join(' / '),
          icon: tree.kindOf(item.node) === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text',
          onSelect: () => go(item.id),
        })
      }
      if (item.children) walk(item.children, label)
    }
  }
  walk(tree.items.value, [])
  return [{ label: 'Top level', icon: 'i-lucide-list-tree', onSelect: () => go(null) }, ...targets]
}

const rootMenu = computed<DropdownMenuItem[]>(() => [
  {
    label: 'New page',
    icon: 'i-lucide-file-plus',
    kbds: newPageKeys.value,
    onSelect: () => void createInside(null),
  },
])

// A right-click opens the menu of the row under the pointer (the root menu elsewhere), or the
// browser's own in the rename field. One menu for the whole tree: UTree gives each row's root
// element its focus and keys, which a menu wrapping the row would take.
const contextItem = ref<TreeItem | null>(null)
const contextItems = computed(() => (contextItem.value ? menu(contextItem.value) : rootMenu.value))

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
/** What is dragged: a row, or the selection it's in. */
const dragged = ref<string[]>([])
const dropTarget = ref<{ id: string | null; zone: DropZone } | null>(null)

function onDragStart(event: DragEvent, item: TreeItem) {
  dragged.value = actedOnFrom(item)
  event.dataTransfer?.setData('application/x-tandem-node', item.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function zoneOf(event: DragEvent): DropZone {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = (event.clientY - rect.top) / rect.height
  return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
}

function canDrop(targetId: string): boolean {
  return dragged.value.length > 0 && !dragged.value.some((id) => tree.isWithin(targetId, id))
}

function onDragOver(event: DragEvent, item: TreeItem) {
  if (!canDrop(item.id)) return
  event.preventDefault()
  dropTarget.value = { id: item.id, zone: zoneOf(event) }
}

async function onDrop(event: DragEvent, item: TreeItem) {
  event.preventDefault()
  const ids = dragged.value
  const zone = zoneOf(event)
  const allowed = canDrop(item.id)
  reset()
  if (!ids.length || !allowed) return
  if (ids.length > 1) selection.value = emptySelection()
  const moveTo = (parentId: string | null, index?: number) =>
    ids.length > 1 ? tree.moveMany(ids, parentId, index) : tree.move(ids[0]!, parentId, index)
  if (zone === 'inside') {
    if (!expanded.value.includes(item.id)) expanded.value = [...expanded.value, item.id]
    await moveTo(item.id)
    return
  }
  const parentId = item.node.parentId
  const siblings = (tree.childrenOf.value.get(parentId) ?? []).filter((n) => !ids.includes(n.id))
  const index = siblings.findIndex((n) => n.id === item.id) + (zone === 'after' ? 1 : 0)
  await moveTo(parentId, index)
}

function onDropOnRoot(event: DragEvent) {
  event.preventDefault()
  const ids = dragged.value
  reset()
  if (ids.length > 1) {
    selection.value = emptySelection()
    void tree.moveMany(ids, null)
  } else if (ids[0]) void tree.move(ids[0], null).catch(showError)
}

function reset() {
  dragged.value = []
  dropTarget.value = null
}

function rowClass(item: TreeItem) {
  const target = dropTarget.value?.id === item.id ? dropTarget.value.zone : null
  return [
    isSelected(selection.value, item.id)
      ? 'bg-primary/20 text-highlighted'
      : currentId.value === item.id
        ? 'bg-elevated text-highlighted font-medium'
        : 'text-default hover:bg-elevated/60',
    dragged.value.includes(item.id) && 'opacity-50',
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
      <UTooltip text="New page" :kbds="newPageKeys">
        <UButton
          icon="i-lucide-plus"
          size="xs"
          color="neutral"
          variant="ghost"
          aria-label="New page"
          @click="createInside(null)"
        />
      </UTooltip>
    </div>

    <div
      class="min-h-0 flex-1 overflow-y-auto px-1"
      @dragover.prevent
      @drop="onDropOnRoot"
      @dragend="reset"
      @contextmenu.capture="onContextMenu"
    >
      <UContextMenu :items="contextItems" :content="keepMovedFocus">
        <div
          class="min-h-full pb-6"
          data-testid="tree-menu-area"
          @keydown.capture="onTreeKeydown"
          @focusin="onTreeFocusin"
        >
          <UTree
            v-model:expanded="expanded"
            :items="tree.items.value"
            :get-key="(item: TreeItem) => item.id"
            :on-select="onSelect"
            :ui="{ listWithChildren: 'ms-3 border-s border-default ps-1' }"
            size="sm"
          >
            <template #item-wrapper="{ item, expanded: isExpanded }">
              <div
                class="tree-row group relative flex h-7 cursor-pointer items-center gap-1 rounded-md ps-1 pe-1 text-sm transition-colors select-none"
                :class="rowClass(item)"
                :data-current="currentId === item.id || undefined"
                draggable="true"
                :data-node-id="item.id"
                @keydown.capture="onRowKeydown($event, item)"
                :data-testid="`tree-${item.label}`"
                :data-selected="isSelected(selection, item.id) || undefined"
                @click="onRowClick($event, item)"
                @dblclick="openForGood(item)"
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
                <NodeIcon :icon="item.node.icon" :kind="tree.kindOf(item.node)" />

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
                <span v-else class="min-w-0 flex-1 truncate">{{ item.label }}</span>

                <!-- Over the end of the title, on hover (or focus), as a tab's ×: the title takes
                     the whole width otherwise. -->
                <div
                  v-if="renamingId !== item.id"
                  class="tree-row-actions absolute inset-y-0 end-0 flex items-center rounded-e-md ps-6 pe-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
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
                    @click="createInside(item)"
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
