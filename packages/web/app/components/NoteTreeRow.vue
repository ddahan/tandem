<script setup lang="ts">
// One row of the pages' tree (NoteTree, which holds the state and the actions: utils/tree-row).
// Opening a page must cost nothing here: a row is redrawn only when what it shows changes (it is
// the open page, selected, dragged, a drop target, renamed), and its ⋯ menu and + button are
// made when the pointer or the focus reaches it (they show on hover): hundreds of rows would
// otherwise each build a menu nobody sees.
import type { TreeItem } from '~/composables/useTree'
import { isSelected } from '~/utils/tree-selection'
import { TREE_ROW } from '~/utils/tree-row'

const props = defineProps<{ item: TreeItem; expanded: boolean }>()
// The tree (UTree) gives this row its role, focus and keys as attributes, some under names the
// row sets itself (`data-selected`: its own is the app's selection, not the tree's): they go
// on the row first, so that the row's own win.
defineOptions({ inheritAttrs: false })

const tree = useTree()
const row = inject(TREE_ROW)!

const current = computed(() => row.currentId.value === props.item.id)
const selected = computed(() => isSelected(row.selection.value, props.item.id))
const dragging = computed(() => row.dragged.value.includes(props.item.id))
const dropZone = computed(() =>
  row.dropTarget.value?.id === props.item.id ? row.dropTarget.value.zone : null,
)
const renaming = computed(() => row.renamingId.value === props.item.id)

// The pointer is over the row, the focus in it, or its menu open (the pointer is then in the
// menu, outside the row).
const hovered = ref(false)
const focused = ref(false)
const menuOpen = ref(false)
const actionsShown = computed(
  () => !renaming.value && (hovered.value || focused.value || menuOpen.value),
)

// The press comes before the click that opens the page: its note is asked for already
// (useNoteDocument). Not for a press that selects (⌘, ⇧) or opens a menu.
function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
  if (!current.value) prefetchNote(props.item.id)
}

function onFocusout(event: FocusEvent) {
  const next = event.relatedTarget
  focused.value = next instanceof Node && (event.currentTarget as HTMLElement).contains(next)
}
</script>

<template>
  <div
    v-bind="$attrs"
    class="tree-row group relative flex h-7 cursor-pointer items-center gap-1 rounded-md ps-1 pe-1 text-sm transition-colors select-none"
    :class="[
      selected
        ? 'bg-primary/20 text-highlighted'
        : current
          ? 'bg-elevated font-medium text-highlighted'
          : 'text-default hover:bg-elevated/60',
      dragging && 'opacity-50',
      dropZone === 'inside' && 'ring-2 ring-primary ring-inset',
      dropZone === 'before' && 'shadow-[inset_0_2px_0_0_var(--ui-primary)]',
      dropZone === 'after' && 'shadow-[inset_0_-2px_0_0_var(--ui-primary)]',
    ]"
    :data-current="current || undefined"
    draggable="true"
    :data-node-id="item.id"
    :data-testid="`tree-${item.label}`"
    :data-selected="selected || undefined"
    @keydown.capture="row.keydown($event, item)"
    @click="row.click($event, item)"
    @dblclick="row.openForGood(item)"
    @pointerdown="onPointerDown"
    @pointerenter="hovered = true"
    @pointerleave="hovered = false"
    @focusin="focused = true"
    @focusout="onFocusout"
    @dragstart="row.dragStart($event, item)"
    @dragover.stop="row.dragOver($event, item)"
    @dragleave="row.dropTarget.value = null"
    @drop.stop="row.drop($event, item)"
    @dragend="row.dragEnd()"
  >
    <button
      v-if="item.children?.length"
      type="button"
      class="grid size-5 shrink-0 place-items-center rounded text-dimmed hover:text-default"
      :aria-label="expanded ? 'Collapse' : 'Expand'"
      @click.stop="row.toggle(item.id)"
    >
      <UIcon
        name="i-lucide-chevron-right"
        class="size-3.5 transition-transform"
        :class="expanded && 'rotate-90'"
      />
    </button>
    <span v-else class="size-5 shrink-0" />
    <NodeIcon :icon="item.node.icon" :kind="tree.kindOf(item.node)" />

    <UInput
      v-if="renaming"
      v-model="row.renameValue.value"
      size="xs"
      autofocus
      aria-label="New title"
      class="min-w-0 flex-1"
      @click.stop
      @keydown.enter.prevent="row.commitRename()"
      @keydown.esc.prevent="row.renamingId.value = null"
      @blur="row.commitRename()"
    />
    <span v-else class="min-w-0 flex-1 truncate">{{ item.label }}</span>

    <!-- Over the end of the title, on hover (or focus), as a tab's ×: the title takes the whole
         width otherwise. -->
    <div
      v-if="actionsShown"
      class="tree-row-actions absolute inset-y-0 end-0 flex items-center rounded-e-md ps-6 pe-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
      @click.stop
    >
      <UDropdownMenu
        v-model:open="menuOpen"
        :items="row.menu(item)"
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
        @click="row.createInside(item)"
      />
    </div>
  </div>
</template>
