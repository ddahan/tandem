<script setup lang="ts">
// The sidebar's Favorites section, above the pages (Settings › Features, off by default):
// shortcuts to pages and folders (useFavorites), in the owner's order. Rows dragged from the tree
// are added where they're dropped (they stay in the tree); favorites are dragged to reorder them.
// A click opens the page in the preview tab, a double click (or ↵) in a tab of its own, as in the
// tree. Each row's menu (its ⋯, or a right-click) opens it in a window, or removes it.
import type { DropdownMenuItem } from '@nuxt/ui'
import type { TreeNode } from '@tandem/shared'
import { useLocalStorage } from '@vueuse/core'
import { FAVORITE_DRAG_TYPE, NODES_DRAG_TYPE } from '~/composables/useFavorites'
import { keepMovedFocus } from '~/utils/menu-focus'

const favorites = useFavorites()
const tree = useTree()
const tabs = useTabs()
const route = useRoute()

const open = useLocalStorage('tandem-favorites-open', true)
const currentId = computed(() => (route.name === 'notes-id' ? String(route.params.id) : null))

function preview(node: TreeNode) {
  void tabs.preview(`/notes/${node.id}`)
}
function openForGood(node: TreeNode) {
  void tabs.open(`/notes/${node.id}`)
}

/** Moves a favorite up or down, and keeps the focus on it. */
async function step(node: TreeNode, by: -1 | 1) {
  await favorites.step(node.id, by)
  await nextTick()
  document.querySelector<HTMLElement>(`[data-favorite-id="${node.id}"]`)?.focus()
}

function menu(node: TreeNode): DropdownMenuItem[][] {
  return [
    [
      {
        label: 'Open in a tab',
        icon: 'i-lucide-panel-top',
        kbds: ['enter'],
        onSelect: () => openForGood(node),
      },
      {
        label: 'Open in new window',
        icon: 'i-lucide-app-window',
        onSelect: () => openNoteWindow(node.id),
      },
    ],
    [
      {
        label: 'Move up',
        icon: 'i-lucide-arrow-up',
        kbds: ['alt', 'arrowup'],
        onSelect: () => void step(node, -1),
      },
      {
        label: 'Move down',
        icon: 'i-lucide-arrow-down',
        kbds: ['alt', 'arrowdown'],
        onSelect: () => void step(node, 1),
      },
    ],
    [
      {
        label: 'Remove from favorites',
        icon: 'i-lucide-star-off',
        kbds: ['meta', 'backspace'],
        onSelect: () => void favorites.remove(node.id),
      },
    ],
  ]
}

// One menu for the whole section, on a right-click on a row (none elsewhere).
const contextNode = ref<TreeNode | null>(null)
const contextItems = computed(() => (contextNode.value ? menu(contextNode.value) : []))
function onContextMenu(event: MouseEvent) {
  const id = (event.target as HTMLElement).closest<HTMLElement>('[data-favorite-id]')?.dataset
    .favoriteId
  contextNode.value = favorites.nodes.value.find((node) => node.id === id) ?? null
}

/** ↵ opens in a tab of its own, ⌥↑ ⌥↓ reorder, ⌘⌫ (or Delete) removes it from the favorites. */
function onRowKeydown(event: KeyboardEvent, node: TreeNode) {
  const handle = (action: () => unknown) => {
    event.preventDefault()
    void action()
  }
  if (event.key === 'Enter' && !event.metaKey && !event.altKey) handle(() => openForGood(node))
  else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown'))
    handle(() => step(node, event.key === 'ArrowUp' ? -1 : 1))
  else if (
    (event.key === 'Backspace' && (event.metaKey || event.ctrlKey)) ||
    event.key === 'Delete'
  )
    handle(() => favorites.remove(node.id))
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    // Through the favorites, as in the tree.
    const rows = [...document.querySelectorAll<HTMLElement>('[data-favorite-id]')]
    const at = rows.indexOf(event.currentTarget as HTMLElement)
    handle(() => rows[at + (event.key === 'ArrowDown' ? 1 : -1)]?.focus())
  }
}

// A row's ⋯ menu is made once the pointer or the focus reaches it (it shows on hover), not with
// the list: opening a page redraws the rows.
const actionsFor = ref<string | null>(null)
const menuOpen = ref(false)
function onFocusout(event: FocusEvent) {
  const next = event.relatedTarget
  if (
    !(next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) &&
    !menuOpen.value
  )
    actionsFor.value = null
}

// --- Drag and drop ---------------------------------------------------------------------------

const dragged = ref<string | null>(null)
/** Where a drop would go: before or after a row, or at the end (`null` id). */
const dropTarget = ref<{ id: string | null; zone: 'before' | 'after' } | null>(null)

function onDragStart(event: DragEvent, node: TreeNode) {
  if (!event.dataTransfer) return
  dragged.value = node.id
  event.dataTransfer.setData(FAVORITE_DRAG_TYPE, node.id)
  event.dataTransfer.effectAllowed = 'move'
}

/** A favorite, or rows of the tree: what this section takes. */
function accepts(event: DragEvent) {
  const types = event.dataTransfer?.types ?? []
  return types.includes(FAVORITE_DRAG_TYPE) || types.includes(NODES_DRAG_TYPE)
}

function onRowDragOver(event: DragEvent, node: TreeNode) {
  if (!accepts(event)) return
  event.preventDefault()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const zone = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
  dropTarget.value = { id: node.id, zone }
}

function onSectionDragOver(event: DragEvent) {
  if (!accepts(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = dragged.value ? 'move' : 'link'
  if (!(event.target as HTMLElement).closest('[data-favorite-id]'))
    dropTarget.value = { id: null, zone: 'after' }
}

function onSectionDragLeave(event: DragEvent) {
  const next = event.relatedTarget
  if (!(next instanceof Node && (event.currentTarget as HTMLElement).contains(next)))
    dropTarget.value = null
}

function onDrop(event: DragEvent) {
  if (!accepts(event)) return
  event.preventDefault()
  const transfer = event.dataTransfer!
  const ids = transfer.types.includes(FAVORITE_DRAG_TYPE)
    ? [transfer.getData(FAVORITE_DRAG_TYPE)]
    : transfer.getData(NODES_DRAG_TYPE).split('\n')
  const target = dropTarget.value
  reset()
  const added = ids.filter((id) => tree.byId.value.has(id))
  if (!added.length) return
  // Its index among the favorites shown without those moved.
  const others = favorites.nodes.value.filter((node) => !added.includes(node.id))
  let index: number | undefined
  if (target?.id) {
    if (added.includes(target.id)) return
    index = others.findIndex((node) => node.id === target.id) + (target.zone === 'after' ? 1 : 0)
  }
  open.value = true
  void favorites.place(added, index)
}

function reset() {
  dragged.value = null
  dropTarget.value = null
}
</script>

<template>
  <UContextMenu :items="contextItems" :content="keepMovedFocus" :disabled="!contextNode">
    <section
      class="flex shrink-0 flex-col"
      :class="dropTarget?.id === null && 'rounded-md ring-2 ring-primary ring-inset'"
      aria-label="Favorites"
      data-testid="favorites"
      @contextmenu.capture="onContextMenu"
      @dragover="onSectionDragOver"
      @dragleave="onSectionDragLeave"
      @drop="onDrop"
    >
      <div class="flex h-7 items-center ps-1 pe-2.5">
        <button
          type="button"
          class="flex items-center gap-1 rounded text-xs font-medium text-muted hover:text-default"
          :aria-expanded="open"
          data-testid="favorites-toggle"
          @click="open = !open"
        >
          <span class="grid size-5 place-items-center">
            <UIcon
              name="i-lucide-chevron-right"
              class="size-3.5 transition-transform"
              :class="open && 'rotate-90'"
            />
          </span>
          Favorites
        </button>
      </div>

      <div v-if="open" class="px-1 pb-2">
        <ul v-if="favorites.nodes.value.length" class="flex flex-col">
          <li v-for="node in favorites.nodes.value" :key="node.id">
            <div
              role="button"
              tabindex="0"
              class="tree-row group relative flex h-7 items-center gap-1.5 rounded-md ps-2 pe-1 text-sm transition-colors select-none"
              :class="[
                currentId === node.id
                  ? 'bg-elevated font-medium text-highlighted'
                  : 'text-default hover:bg-elevated/60',
                dragged === node.id && 'opacity-50',
                dropTarget?.id === node.id &&
                  (dropTarget.zone === 'before'
                    ? 'shadow-[inset_0_2px_0_0_var(--ui-primary)]'
                    : 'shadow-[inset_0_-2px_0_0_var(--ui-primary)]'),
              ]"
              :data-current="currentId === node.id || undefined"
              :data-favorite-id="node.id"
              :data-testid="`favorite-${node.title}`"
              :title="node.path.replace(/\.md$/, '')"
              draggable="true"
              @click="preview(node)"
              @dblclick="openForGood(node)"
              @pointerdown="currentId !== node.id && prefetchNote(node.id)"
              @keydown="onRowKeydown($event, node)"
              @pointerenter="actionsFor = node.id"
              @pointerleave="!menuOpen && (actionsFor = null)"
              @focusin="actionsFor = node.id"
              @focusout="onFocusout"
              @dragstart="onDragStart($event, node)"
              @dragover="onRowDragOver($event, node)"
              @dragend="reset"
            >
              <NodeIcon :icon="node.icon" :kind="tree.kindOf(node)" />
              <span class="min-w-0 flex-1 truncate">{{ node.title }}</span>
              <div
                v-if="actionsFor === node.id"
                class="tree-row-actions absolute inset-y-0 end-0 flex items-center rounded-e-md ps-6 pe-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                @click.stop
                @dblclick.stop
              >
                <UDropdownMenu
                  v-model:open="menuOpen"
                  :items="menu(node)"
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
              </div>
            </div>
          </li>
        </ul>
        <p v-else class="px-2 py-1 text-xs text-muted" data-testid="favorites-empty">
          Drag pages here, or pick Add to favorites in a page’s menu.
        </p>
      </div>
    </section>
  </UContextMenu>
</template>
