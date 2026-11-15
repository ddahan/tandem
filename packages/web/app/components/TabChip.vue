<script setup lang="ts">
// One tab of the tab bar (TabBar, which holds the order, the dragging and the tabs' menu): its
// icon, title, × and the tooltip with its page's path. Told only what concerns it (active,
// dragged, a drop mark), so showing another page redraws two chips, not the bar.
import type { Tab } from '~/composables/useTabs'

const props = defineProps<{
  tab: Tab
  active: boolean
  /** This tab is the one being dragged. */
  dragging: boolean
  /** A tab is being dragged: no tooltips meanwhile. */
  dragActive: boolean
  /** Where a dragged tab would go: before this one, or after it (the last one shown). */
  dropMark: 'before' | 'after' | null
}>()
const emit = defineEmits<{
  dragstart: [event: DragEvent]
  dragover: [event: DragEvent]
  dragend: []
}>()

const tabs = useTabs()
const tree = useTree()
const info = useTabInfo()

const node = computed(() => (info.dayOf(props.tab) ? undefined : info.nodeOf(props.tab)))
const bookmark = computed(() => info.bookmarkOf(props.tab))
const title = computed(() => info.titleOf(props.tab))
const path = computed(() => info.pathOf(props.tab))

// A press shows the tab, without waiting for the button to come back up (as a browser's tabs
// and VS Code's do): the page is there a click's length sooner. With a mouse only: a finger's
// press may be the start of a scroll through the tabs.
function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || event.button !== 0) return
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  void tabs.activate(props.tab.key)
}

// A middle click closes, as in browsers and VS Code (auxclick: click isn't sent for it).
function onAuxClick(event: MouseEvent) {
  if (event.button !== 1) return
  event.preventDefault()
  void tabs.closeTab(props.tab.key)
}
</script>

<template>
  <UTooltip
    :disabled="dragActive"
    :content="{ side: 'bottom', align: 'start' }"
    :ui="{ content: 'h-auto max-w-md py-1' }"
  >
    <div
      role="tab"
      :aria-label="title"
      :aria-selected="active"
      draggable="true"
      data-tab-chip
      :data-tab-key="tab.key"
      class="tab-chip group relative flex h-7 max-w-48 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm select-none"
      :class="[
        active ? 'text-highlighted' : 'text-muted hover:text-default',
        dragging && 'opacity-50',
      ]"
      :data-testid="`tab-${title}`"
      @pointerdown="onPointerDown"
      @click="tabs.activate(tab.key)"
      @dblclick="tabs.keepOpen(tab.key)"
      @auxclick="onAuxClick"
      @mousedown.middle.prevent
      @dragstart="emit('dragstart', $event)"
      @dragover="emit('dragover', $event)"
      @dragend="emit('dragend')"
    >
      <!-- Where a dragged tab goes. -->
      <span
        v-if="dropMark === 'before'"
        class="absolute inset-y-0.5 -start-[3px] w-0.5 rounded-full bg-primary"
        aria-hidden="true"
      />
      <span
        v-if="dropMark === 'after'"
        class="absolute inset-y-0.5 -end-[3px] w-0.5 rounded-full bg-primary"
        aria-hidden="true"
      />
      <NodeIcon v-if="node" :icon="node.icon" :kind="tree.kindOf(node)" />
      <BookmarkIcon v-else-if="bookmark" :bookmark="bookmark" />
      <UIcon v-else :name="info.iconOf(tab)" class="size-4 shrink-0" />
      <span class="min-w-0 truncate" :class="tab.preview && 'italic'">{{ title }}</span>
      <!-- Over the end of the title, on hover (or focus): it takes no room otherwise. -->
      <button
        type="button"
        class="tab-close absolute inset-y-0 end-0 flex w-9 items-center justify-end rounded-e-md pe-1 text-muted opacity-0 group-hover:opacity-100 hover:text-highlighted focus-visible:opacity-100 [&:hover>span]:bg-accented"
        aria-label="Close tab"
        @pointerdown.stop
        @click.stop="tabs.closeTab(tab.key)"
        @dblclick.stop
      >
        <span class="grid size-5 place-items-center rounded">
          <UIcon name="i-lucide-x" class="size-3.5" />
        </span>
      </button>
    </div>

    <!-- The page's path, from the top. -->
    <template #content>
      <span
        v-if="path.length"
        class="flex flex-wrap items-center gap-1 text-xs"
        data-testid="tab-path"
      >
        <template v-for="(page, depth) in path" :key="page.id">
          <UIcon v-if="depth" name="i-lucide-chevron-right" class="size-3 text-dimmed" />
          <span class="flex items-center gap-1">
            <NodeIcon :icon="page.icon" :kind="tree.kindOf(page)" />
            <span :class="depth === path.length - 1 && 'font-medium text-highlighted'">
              {{ page.title }}
            </span>
          </span>
        </template>
      </span>
      <span v-else class="text-xs">{{ info.tooltipOf(tab) }}</span>
    </template>
  </UTooltip>
</template>
