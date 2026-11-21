<script setup lang="ts">
// The open tabs (useTabs), in the page's bar (PageNavbar), left of the page's actions: chips on
// up to two rows, a single row centered; the tabs that don't fit are in a "+N" menu, and the
// active tab is always among those shown (in the last place shown when its own is hidden: the
// tabs' order doesn't change). On a
// phone, one row that scrolls sideways. The preview tab is in italics, × closes (on the active
// tab and on hover; a middle click too), a double click keeps a preview open, tabs are dragged
// to reorder, a right-click opens their menu, and hovering one shows its page's path. A double
// click on the empty space makes a new page.
//
// One bar for the whole app: the layout makes it once and shows it in the bar of the page open
// (useTabBarHost), so that going from page to page builds no tab again. Its chips are TabChip;
// they share one menu (the tab right-clicked), as the tree's rows do.
import type { ContextMenuItem, DropdownMenuItem } from '@nuxt/ui'
import { useResizeObserver } from '@vueuse/core'
import type { Tab } from '~/composables/useTabs'

const tabs = useTabs()
// The place the page open gives it (PageNavbar), read here: a new place moves the bar without
// redrawing the layout.
const host = useTabBarHost()
const tree = useTree()
const toast = useToast()
// ⌘W closes a tab only in the installed app (in a browser tab, it closes the browser's).
const appWindow = useAppWindow()
const { nodeOf, titleOf, iconOf } = useTabInfo()
const isActive = (tab: Tab) => tab.key === tabs.activeKey.value

function menu(tab: Tab): ContextMenuItem[][] {
  const index = tabs.tabs.value.indexOf(tab)
  const node = nodeOf(tab)
  return [
    [
      {
        label: 'Close',
        icon: 'i-lucide-x',
        kbds: appWindow.value ? ['meta', 'w'] : undefined,
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
              label: 'Open in new window',
              icon: 'i-lucide-app-window',
              onSelect: () => openNoteWindow(node.id),
            },
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

// A right-click opens the menu of the tab under the pointer; elsewhere in the bar, the
// browser's own. One menu for the bar, not one per tab.
const contextTab = ref<Tab | null>(null)
const contextItems = computed(() => (contextTab.value ? menu(contextTab.value) : []))
function onContextMenu(event: MouseEvent) {
  const key = (event.target as HTMLElement).closest<HTMLElement>('[data-tab-chip]')?.dataset.tabKey
  contextTab.value = tabs.tabs.value.find((tab) => tab.key === key) ?? null
  // Before the menu's own handler (inside).
  if (!contextTab.value) event.stopPropagation()
}

async function copyPath(path: string) {
  await navigator.clipboard.writeText(path)
  toast.add({ title: 'Path copied', description: path, icon: 'i-lucide-check' })
}

// --- Two rows, and the rest in "+N" ------------------------------------------------------------

const bar = useTemplateRef<HTMLElement>('bar')
/** Two rows from `sm` up; below, one row that scrolls. */
const wide = useWindowQuery('(min-width: 640px)')
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
    icon: iconOf(tab),
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
// Measured at the next frame, never right away: reading the tabs' places makes the browser lay
// the whole page out on the spot, and when a page was just swapped in (the usual reason the tabs
// change), it would do so again once the page has finished mounting.
let frame = 0
function fitSoon() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    void fit()
    revealActive()
  })
}
watch([layoutKey, wide], fitSoon, { flush: 'post' })
onMounted(fitSoon)
onBeforeUnmount(() => cancelAnimationFrame(frame))
useResizeObserver(bar, fitSoon)

// One row, on a phone: the active tab scrolled into view, when it changes and once the bar is
// laid out (the resize observer above).
function revealActive() {
  if (wide.value) return
  bar.value
    ?.querySelector('[aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
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
/** The drop mark a chip shows: before it, or after it for the last one shown. */
function dropMarkOf(index: number) {
  if (!dragged.value) return null
  if (dropBefore.value === index) return 'before'
  return dropBefore.value === index + 1 && index === visible.value.length - 1 ? 'after' : null
}
</script>

<template>
  <Teleport v-if="tabs.tabs.value.length && host" :to="host">
    <div
      ref="bar"
      class="tab-bar flex h-full min-w-0 flex-1 items-center gap-y-1"
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
      @contextmenu.capture="onContextMenu"
    >
      <UContextMenu :items="contextItems">
        <!-- No box of its own: the chips are laid out by the bar. -->
        <div class="tab-chips contents">
          <TabChip
            v-for="(tab, index) in visible"
            :key="tab.key"
            :tab="tab"
            :active="isActive(tab)"
            :dragging="dragged === tab.key"
            :drag-active="!!dragged"
            :drop-mark="dropMarkOf(index)"
            @dragstart="onDragStart($event, tab)"
            @dragover="onDragOver($event, index)"
            @dragend="onDragEnd"
          />
        </div>
      </UContextMenu>

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
  </Teleport>
</template>

<style>
/* Tabs side by side, split by a thin line, as a browser's: the line goes next to the tab under
   the pointer and next to the active one (tinted with the accent). --tab-bg is the tab's own
   background, so that the × fades the title out over it. */
.tab-chip {
  --tab-bg: transparent;
  background: var(--tab-bg);
  transition:
    background-color 0.15s,
    color 0.15s;
}
.tab-chip:hover {
  --tab-bg: var(--ui-bg-elevated);
}
.tab-chip[aria-selected='true'] {
  --tab-bg: color-mix(in oklab, var(--ui-primary) 12%, var(--ui-bg));
}
.tab-chip::after {
  content: '';
  position: absolute;
  inset-block: 0.4rem;
  inset-inline-end: 0;
  width: 1px;
  background: var(--ui-border-accented);
  transition: opacity 0.15s;
}
/* None after the last tab, with nothing to its right ("+N" keeps it). */
.tab-chips:last-child > .tab-chip:last-child::after,
.tab-chip:hover::after,
.tab-chip[aria-selected='true']::after,
.tab-chip:has(+ .tab-chip:hover)::after,
.tab-chip:has(+ .tab-chip[aria-selected='true'])::after {
  opacity: 0;
}
.tab-close {
  background: linear-gradient(to right, transparent, var(--tab-bg) 45%);
}

/* One row on a phone: a thin scrollbar, only on hover. */
.tab-bar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.tab-bar:hover {
  scrollbar-color: var(--ui-border-accented) transparent;
}
</style>
