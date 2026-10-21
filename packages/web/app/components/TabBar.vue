<script setup lang="ts">
// The open tabs (useTabs), in the page's bar (PageNavbar), left of the page's actions: chips on
// up to two rows, a single row centered; the tabs that don't fit are in a "+N" menu, and the
// active tab is always among those shown (in the last place shown when its own is hidden: the
// tabs' order doesn't change). On a
// phone, one row that scrolls sideways. The preview tab is in italics, × closes (on the active
// tab and on hover; a middle click too), a double click keeps a preview open, tabs are dragged
// to reorder, a right-click opens their menu, and hovering one shows its page's path. A double
// click on the empty space makes a new page.
import type { ContextMenuItem, DropdownMenuItem } from '@nuxt/ui'
import { useMediaQuery, useResizeObserver } from '@vueuse/core'
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
/** A note's pages, from the top: the tooltip's path. */
function pathOf(tab: Tab) {
  const id = noteIdOf(tab.key)
  return id ? tree.ancestors(id) : []
}
const isActive = (tab: Tab) => tab.key === tabs.activeKey.value

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

// --- Two rows, and the rest in "+N" ------------------------------------------------------------

const bar = useTemplateRef<HTMLElement>('bar')
/** Two rows from `sm` up; below, one row that scrolls. */
const wide = useMediaQuery('(min-width: 640px)')
/** How many tabs are shown (the rest are in the "+N" menu). */
const shown = ref(Number.POSITIVE_INFINITY)
/** The tabs shown, in order: the active one in the last place when it would be hidden. */
const visible = computed(() => {
  const all = tabs.tabs.value
  if (shown.value >= all.length) return all
  const first = all.slice(0, shown.value)
  const active = all.find(isActive)
  return active && !first.includes(active) ? [...first.slice(0, -1), active] : first
})
const hidden = computed(() => tabs.tabs.value.filter((tab) => !visible.value.includes(tab)))
const hiddenItems = computed<DropdownMenuItem[]>(() =>
  hidden.value.map((tab) => ({
    label: titleOf(tab),
    icon: PAGES[tab.key]?.icon ?? 'i-lucide-file-text',
    onSelect: () => void tabs.activate(tab.key),
  })),
)

/** How many rows the shown tabs (and "+N") take. Rows are centered, so they move as tabs come
 * and go: counted, never compared with an earlier layout. */
function rowCount() {
  const items = bar.value?.querySelectorAll('[data-tab-chip], [data-tab-more]') ?? []
  return new Set([...items].map((item) => Math.round(item.getBoundingClientRect().top))).size
}

let fitting = false
let fitAgain = false
/** Shows as many tabs as two rows hold, keeping room for "+N" when some don't fit. */
async function fit() {
  // Asked again while measuring (tabs moved, the bar resized): once more after this one.
  if (fitting) {
    fitAgain = true
    return
  }
  fitting = true
  try {
    shown.value = Number.POSITIVE_INFINITY
    await nextTick()
    if (!wide.value || !bar.value || rowCount() <= 2) return
    // At most the tabs on the first two rows of all of them; fewer while "+N" needs room.
    const chips = [...bar.value.querySelectorAll('[data-tab-chip]')]
    const tops = [...new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top)))]
    const third = tops.toSorted((a, b) => a - b)[2]!
    let count = chips.findIndex((chip) => Math.round(chip.getBoundingClientRect().top) >= third)
    for (; count > 1; count--) {
      shown.value = count
      await nextTick()
      if (rowCount() <= 2) break
    }
    shown.value = Math.max(count, 1)
  } finally {
    fitting = false
    if (fitAgain) {
      fitAgain = false
      void fit()
    }
  }
}

// What changes the room the tabs take: their titles and order, the preview's italics, the
// bar's width (the window, the side panel, the sidebar), two rows or one.
const layoutKey = computed(
  () =>
    `${tabs.activeKey.value}:` +
    tabs.tabs.value.map((tab) => `${tab.key}${titleOf(tab)}${tab.preview ? '/' : ''}`).join('|'),
)
watch([layoutKey, wide], () => void fit(), { flush: 'post' })
onMounted(() => void fit())
let frame = 0
useResizeObserver(bar, () => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    void fit()
    revealActive()
  })
})

// One row, on a phone: the active tab scrolled into view, when it changes and once the bar is
// laid out (the resize observer above).
function revealActive() {
  if (wide.value) return
  bar.value
    ?.querySelector('[aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
watch(
  [layoutKey, wide],
  async () => {
    await nextTick()
    revealActive()
  },
  { flush: 'post' },
)

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
// Positions are among the tabs shown; the move is in the order of all of them.
function onDrop() {
  const key = dragged.value
  const before = dropBefore.value
  if (key && before !== null) {
    const target = visible.value[before]
    if (target) tabs.moveBefore(key, target.key)
    else {
      // After the last tab shown: before the tab that follows it, if any.
      const all = tabs.tabs.value.filter((tab) => tab.key !== key)
      const last = visible.value.findLast((tab) => tab.key !== key)
      tabs.moveBefore(key, last ? (all[all.indexOf(last) + 1]?.key ?? null) : null)
    }
  }
  onDragEnd()
}
function onDragEnd() {
  dragged.value = null
  dropBefore.value = null
}
</script>

<template>
  <div
    ref="bar"
    class="tab-bar flex h-full min-w-0 items-center gap-1"
    :class="
      wide
        ? 'flex-wrap content-center overflow-hidden py-0.5'
        : 'flex-nowrap overflow-x-auto overflow-y-hidden'
    "
    role="tablist"
    aria-label="Open pages"
    data-testid="tab-bar"
    @dblclick.self="tree.createPage()"
    @dragover.prevent
    @drop="onDrop"
  >
    <template v-for="(tab, index) in visible" :key="tab.key">
      <UContextMenu :items="menu(tab)">
        <UTooltip
          :disabled="!!dragged"
          :content="{ side: 'bottom', align: 'start' }"
          :ui="{ content: 'h-auto max-w-md py-1' }"
        >
          <div
            role="tab"
            :aria-label="titleOf(tab)"
            :aria-selected="isActive(tab)"
            draggable="true"
            data-tab-chip
            class="group relative flex h-7 max-w-48 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border ps-2 pe-1 text-sm transition-colors select-none"
            :class="[
              isActive(tab)
                ? 'border-primary/40 bg-primary/10 text-highlighted'
                : 'border-transparent text-muted hover:bg-elevated hover:text-default',
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
              class="absolute inset-y-0.5 -start-[3px] w-0.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            <span
              v-if="dragged && dropBefore === index + 1 && index === visible.length - 1"
              class="absolute inset-y-0.5 -end-[3px] w-0.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            <NodeIcon
              v-if="nodeOf(tab)"
              :icon="nodeOf(tab)!.icon"
              :kind="tree.kindOf(nodeOf(tab)!)"
            />
            <UIcon v-else :name="PAGES[tab.key]?.icon ?? 'i-lucide-file'" class="size-4 shrink-0" />
            <span class="min-w-0 truncate" :class="tab.preview && 'italic'">{{
              titleOf(tab)
            }}</span>
            <button
              type="button"
              class="grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-accented hover:text-highlighted"
              :class="isActive(tab) ? '' : 'opacity-0 group-hover:opacity-100'"
              aria-label="Close tab"
              @click.stop="tabs.closeTab(tab.key)"
              @dblclick.stop
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </div>

          <!-- The page's path, from the top. -->
          <template #content>
            <span
              v-if="pathOf(tab).length"
              class="flex flex-wrap items-center gap-1 text-xs"
              data-testid="tab-path"
            >
              <template v-for="(page, depth) in pathOf(tab)" :key="page.id">
                <UIcon v-if="depth" name="i-lucide-chevron-right" class="size-3 text-dimmed" />
                <span class="flex items-center gap-1">
                  <NodeIcon :icon="page.icon" :kind="tree.kindOf(page)" />
                  <span :class="depth === pathOf(tab).length - 1 && 'font-medium text-highlighted'">
                    {{ page.title }}
                  </span>
                </span>
              </template>
            </span>
            <span v-else class="text-xs">{{ titleOf(tab) }}</span>
          </template>
        </UTooltip>
      </UContextMenu>
    </template>

    <UDropdownMenu v-if="hidden.length" :items="hiddenItems" :content="{ align: 'end' }">
      <UButton
        data-tab-more
        :label="`+${hidden.length}`"
        color="neutral"
        variant="ghost"
        size="xs"
        class="h-7 shrink-0"
        :aria-label="`${hidden.length} more tabs`"
      />
    </UDropdownMenu>
  </div>
</template>

<style>
/* One row on a phone: a thin scrollbar, only on hover. */
.tab-bar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.tab-bar:hover {
  scrollbar-color: var(--ui-border-accented) transparent;
}
</style>
