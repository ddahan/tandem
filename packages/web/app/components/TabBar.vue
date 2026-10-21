<script setup lang="ts">
// The open tabs, above the page (useTabs), drawn and used as VS Code's: the active tab merges
// with the page under it (a line of the accent color on top), the preview tab is in italics,
// × closes (shown on the active tab and on hover; a middle click too), a double click keeps a
// preview open, tabs are dragged to reorder, and a right-click opens their menu. Scrolls
// sideways when they don't fit, keeping the active one in view; a double click on the empty
// space makes a new page.
import type { ContextMenuItem } from '@nuxt/ui'
import type { Tab } from '~/composables/useTabs'
import { noteIdOf } from '~/utils/tabs'

const tabs = useTabs()
const tree = useTree()
const toast = useToast()

/** The app's own pages, with their sidebar titles and icons. */
const PAGES: Record<string, { title: string; icon: string }> = {
  docs: { title: 'Docs', icon: 'i-lucide-book-open' },
  settings: { title: 'Settings', icon: 'i-lucide-settings' },
  todos: { title: 'TODOs', icon: 'i-lucide-list-todo' },
  trash: { title: 'Trash', icon: 'i-lucide-trash-2' },
}

function nodeOf(tab: Tab) {
  const id = noteIdOf(tab.key)
  return id ? tree.byId.value.get(id) : undefined
}
function titleOf(tab: Tab) {
  if (noteIdOf(tab.key)) return nodeOf(tab)?.title ?? '…'
  return PAGES[tab.key]?.title ?? tab.key
}

function menu(tab: Tab): ContextMenuItem[][] {
  const index = tabs.tabs.value.indexOf(tab)
  const node = nodeOf(tab)
  return [
    [
      {
        label: 'Close',
        icon: 'i-lucide-x',
        kbds: ['meta', 'alt', 'w'],
        onSelect: () => void tabs.closeTab(tab.key),
      },
      {
        label: 'Close others',
        icon: 'i-lucide-copy-x',
        disabled: tabs.tabs.value.length < 2,
        onSelect: () => void tabs.closeOthers(tab.key),
      },
      {
        label: 'Close to the right',
        icon: 'i-lucide-arrow-right-to-line',
        disabled: index === tabs.tabs.value.length - 1,
        onSelect: () => void tabs.closeToTheRight(tab.key),
      },
      { label: 'Close all', icon: 'i-lucide-square-x', onSelect: () => void tabs.closeAll() },
    ],
    [
      ...(tab.preview
        ? [{ label: 'Keep open', icon: 'i-lucide-pin', onSelect: () => tabs.keepOpen(tab.key) }]
        : []),
      ...(node
        ? [
            {
              label: 'Copy path',
              icon: 'i-lucide-copy',
              onSelect: () => void copyPath(node.path),
            },
          ]
        : []),
    ],
  ].filter((group) => group.length)
}

async function copyPath(path: string) {
  await navigator.clipboard.writeText(path)
  toast.add({ title: 'Path copied', description: path, icon: 'i-lucide-check' })
}

// A middle click closes, as in browsers and VS Code (auxclick: click isn't sent for it).
function onAuxClick(event: MouseEvent, tab: Tab) {
  if (event.button !== 1) return
  event.preventDefault()
  void tabs.closeTab(tab.key)
}

// --- Reordering --------------------------------------------------------------------------------

const dragged = ref<string | null>(null)
const dropBefore = ref<number | null>(null)

function onDragStart(event: DragEvent, tab: Tab) {
  dragged.value = tab.key
  event.dataTransfer?.setData('text/plain', titleOf(tab))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function onDragOver(event: DragEvent, index: number) {
  if (!dragged.value) return
  event.preventDefault()
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dropBefore.value = event.clientX < bounds.left + bounds.width / 2 ? index : index + 1
}
function onDrop() {
  const key = dragged.value
  const before = dropBefore.value
  if (key && before !== null) {
    const from = tabs.tabs.value.findIndex((t) => t.key === key)
    tabs.move(key, from < before ? before - 1 : before)
  }
  onDragEnd()
}
function onDragEnd() {
  dragged.value = null
  dropBefore.value = null
}

// --- The active tab stays in view --------------------------------------------------------------

const bar = useTemplateRef<HTMLElement>('bar')
watch(
  [tabs.activeKey, () => tabs.tabs.value.length],
  async () => {
    await nextTick()
    bar.value
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="tabs.tabs.value.length"
    ref="bar"
    class="tab-bar flex h-9 shrink-0 overflow-x-auto overflow-y-hidden border-b border-default bg-muted"
    role="tablist"
    aria-label="Open pages"
    data-testid="tab-bar"
    @dblclick.self="tree.createPage()"
    @dragover.prevent
    @drop="onDrop"
  >
    <UContextMenu v-for="(tab, index) in tabs.tabs.value" :key="tab.key" :items="menu(tab)">
      <div
        role="tab"
        :aria-label="titleOf(tab)"
        :aria-selected="tab.key === tabs.activeKey.value"
        :title="nodeOf(tab)?.path ?? titleOf(tab)"
        draggable="true"
        class="group relative -mb-px flex max-w-56 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 border-e border-default ps-3 pe-1.5 text-sm select-none"
        :class="[
          tab.key === tabs.activeKey.value
            ? 'border-b border-b-(--ui-bg) bg-default text-highlighted before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary'
            : 'text-muted hover:bg-elevated',
          dragged === tab.key && 'opacity-50',
        ]"
        :data-testid="`tab-${titleOf(tab)}`"
        @click="tabs.activate(tab.key)"
        @dblclick="tabs.keepOpen(tab.key)"
        @auxclick="onAuxClick($event, tab)"
        @mousedown.middle.prevent
        @dragstart="onDragStart($event, tab)"
        @dragover="onDragOver($event, index)"
        @dragend="onDragEnd"
      >
        <!-- Where a dragged tab goes. -->
        <span
          v-if="dragged && dropBefore === index"
          class="absolute inset-y-1 -start-px w-0.5 bg-primary"
          aria-hidden="true"
        />
        <span
          v-if="dragged && dropBefore === index + 1 && index === tabs.tabs.value.length - 1"
          class="absolute inset-y-1 -end-px w-0.5 bg-primary"
          aria-hidden="true"
        />
        <NodeIcon v-if="nodeOf(tab)" :icon="nodeOf(tab)!.icon" :kind="tree.kindOf(nodeOf(tab)!)" />
        <UIcon v-else :name="PAGES[tab.key]?.icon ?? 'i-lucide-file'" class="size-4 shrink-0" />
        <span class="min-w-0 truncate" :class="tab.preview && 'italic'">{{ titleOf(tab) }}</span>
        <button
          type="button"
          class="grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-accented hover:text-highlighted"
          :class="tab.key === tabs.activeKey.value ? '' : 'opacity-0 group-hover:opacity-100'"
          aria-label="Close tab"
          @click.stop="tabs.closeTab(tab.key)"
          @dblclick.stop
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>
    </UContextMenu>
  </div>
</template>

<style>
/* A thin scrollbar, only while scrolling sideways, as VS Code's. */
.tab-bar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.tab-bar:hover {
  scrollbar-color: var(--ui-border-accented) transparent;
}
</style>
