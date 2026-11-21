<script setup lang="ts">
// The future landing page's centerpiece (pages/landing-tree.vue, a proposal): one tree that
// holds notes, events, tasks, files and bookmarks side by side, and lenses that narrow it to one
// kind and lay that kind out its own way (an agenda, a checklist, a grid). Items found through a
// lens keep their place: the tree shows the branches they live in, dimmed. Plays through the
// lenses by itself until someone clicks.
import { formatSize } from '@tandem/shared'

type Kind = 'note' | 'event' | 'task' | 'file' | 'bookmark'
type Lens = 'all' | Kind

interface Item {
  id: string
  title: string
  kind: Kind
  parent?: string
  emoji?: string
  /** Event: `Tue 24/11`, `10:00`. */
  day?: string
  time?: string
  /** Task. */
  due?: string
  done?: boolean
  /** File, in bytes. */
  size?: number
  /** Bookmark. */
  url?: string
}

const KINDS: Record<Kind, { label: string; icon: string; color: string; tint: string }> = {
  note: {
    label: 'Notes',
    icon: 'i-lucide-file-text',
    color: 'text-sky-500',
    tint: 'bg-sky-500/10',
  },
  event: {
    label: 'Events',
    icon: 'i-lucide-calendar',
    color: 'text-rose-500',
    tint: 'bg-rose-500/10',
  },
  task: {
    label: 'Tasks',
    icon: 'i-lucide-circle-check',
    color: 'text-emerald-500',
    tint: 'bg-emerald-500/10',
  },
  file: {
    label: 'Files',
    icon: 'i-lucide-paperclip',
    color: 'text-violet-500',
    tint: 'bg-violet-500/10',
  },
  bookmark: {
    label: 'Bookmarks',
    icon: 'i-lucide-bookmark',
    color: 'text-orange-500',
    tint: 'bg-orange-500/10',
  },
}

// In tree order.
const ITEMS: Item[] = [
  { id: 'launch', title: 'Launch', kind: 'note', emoji: '🚀' },
  {
    id: 'kickoff',
    title: 'Kickoff meeting',
    kind: 'event',
    parent: 'launch',
    day: 'Tue 24/11',
    time: '10:00',
  },
  { id: 'beta', title: 'Ship the beta', kind: 'task', parent: 'launch', due: '30/11' },
  { id: 'announce', title: 'Draft the announcement', kind: 'task', parent: 'launch', done: true },
  { id: 'budget', title: 'budget.xlsx', kind: 'file', parent: 'launch', size: 48_300 },
  {
    id: 'checklist',
    title: 'Launch checklist',
    kind: 'bookmark',
    parent: 'launch',
    url: 'producthunt.com',
  },
  { id: 'home', title: 'Home', kind: 'note', emoji: '🏡' },
  {
    id: 'plumber',
    title: 'Plumber visit',
    kind: 'event',
    parent: 'home',
    day: 'Thu 26/11',
    time: '08:30',
  },
  { id: 'passport', title: 'Renew the passport', kind: 'task', parent: 'home', due: '15/12' },
  { id: 'lease', title: 'lease.pdf', kind: 'file', parent: 'home', size: 1_240_000 },
  { id: 'recipes', title: 'Recipes', kind: 'note', parent: 'home' },
  {
    id: 'sourdough',
    title: 'Sourdough, step by step',
    kind: 'bookmark',
    parent: 'recipes',
    url: 'theperfectloaf.com',
  },
  { id: 'reading', title: 'Reading', kind: 'note', emoji: '📚' },
  { id: 'systems', title: 'Thinking in Systems', kind: 'note', parent: 'reading' },
  {
    id: 'club',
    title: 'Book club',
    kind: 'event',
    parent: 'reading',
    day: 'Fri 27/11',
    time: '19:00',
  },
  {
    id: 'localfirst',
    title: 'Local-first software',
    kind: 'bookmark',
    parent: 'reading',
    url: 'inkandswitch.com',
  },
  { id: 'cover', title: 'cover.png', kind: 'file', parent: 'systems', size: 312_000 },
]
const BY_ID = new Map(ITEMS.map((item) => [item.id, item]))

function ancestors(item: Item): Item[] {
  const chain: Item[] = []
  let parent = item.parent ? BY_ID.get(item.parent) : undefined
  while (parent) {
    chain.unshift(parent)
    parent = parent.parent ? BY_ID.get(parent.parent) : undefined
  }
  return chain
}
const depthOf = (item: Item) => ancestors(item).length
const pathOf = (item: Item) => ancestors(item).map((parent) => parent.title)
const childrenOf = (id: string) => ITEMS.filter((item) => item.parent === id)

const LENSES: Lens[] = ['all', 'note', 'event', 'task', 'file', 'bookmark']
const COUNTS = Object.fromEntries(
  LENSES.map((lens) => [
    lens,
    lens === 'all' ? ITEMS.length : ITEMS.filter((i) => i.kind === lens).length,
  ]),
) as Record<Lens, number>

const lens = ref<Lens>('all')
const selected = ref('launch')
const done = ref(Object.fromEntries(ITEMS.map((item) => [item.id, item.done ?? false])))

// Through a lens: the items of its kind, and the branches they live in (shown dimmed).
const rows = computed(() => {
  if (lens.value === 'all') return ITEMS.map((item) => ({ item, match: true }))
  const matches = ITEMS.filter((item) => item.kind === lens.value)
  const shown = new Set<string>()
  for (const item of matches) for (const each of [item, ...ancestors(item)]) shown.add(each.id)
  return ITEMS.filter((item) => shown.has(item.id)).map((item) => ({
    item,
    match: item.kind === lens.value,
  }))
})
const ofLens = computed(() => ITEMS.filter((item) => item.kind === lens.value))
const current = computed(() => BY_ID.get(selected.value) ?? ITEMS[0]!)
// Notes (and everything) read as pages: the lens shows the selected item.
const showsItem = computed(() => lens.value === 'all' || lens.value === 'note')

// Plays through the lenses until someone takes over.
let touched = false
const AUTOPLAY: Lens[] = ['all', 'event', 'task', 'file', 'bookmark']
useDemoLoop(async (wait) => {
  await wait(3600)
  if (touched) return
  const next = (AUTOPLAY.indexOf(lens.value) + 1) % AUTOPLAY.length
  lens.value = AUTOPLAY[next] ?? 'all'
})
function pickLens(value: Lens) {
  touched = true
  lens.value = value
}
function pick(item: Item) {
  touched = true
  selected.value = item.id
}
function toggle(item: Item) {
  touched = true
  done.value[item.id] = !done.value[item.id]
}
const iconOf = (item: Item) => KINDS[item.kind].icon
</script>

<template>
  <div
    class="onetree-window overflow-hidden rounded-2xl border border-default bg-default text-start"
    data-testid="one-tree-demo"
  >
    <!-- Window bar and the lenses -->
    <div class="flex items-center gap-3 border-b border-default bg-elevated/60 px-4 py-2.5">
      <span class="hidden gap-1.5 sm:flex" aria-hidden="true">
        <span class="size-3 rounded-full bg-[#ff5f57]" />
        <span class="size-3 rounded-full bg-[#febc2e]" />
        <span class="size-3 rounded-full bg-[#28c840]" />
      </span>
      <div
        class="flex min-w-0 flex-1 [scrollbar-width:none] gap-1 overflow-x-auto sm:justify-center"
        role="tablist"
        aria-label="Lenses"
      >
        <button
          v-for="value in LENSES"
          :key="value"
          type="button"
          role="tab"
          :aria-selected="lens === value"
          class="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
          :class="
            lens === value
              ? 'bg-default text-highlighted shadow-sm ring-1 ring-default'
              : 'text-muted hover:text-highlighted'
          "
          @click="pickLens(value)"
        >
          <UIcon
            :name="value === 'all' ? 'i-lucide-list-tree' : KINDS[value].icon"
            class="size-3.5"
            :class="value === 'all' ? 'text-primary' : KINDS[value].color"
          />
          {{ value === 'all' ? 'Everything' : KINDS[value].label }}
          <span class="text-dimmed tabular-nums">{{ COUNTS[value] }}</span>
        </button>
      </div>
    </div>

    <div class="grid sm:grid-cols-[15rem_1fr]">
      <!-- The tree -->
      <TransitionGroup
        tag="ul"
        name="onetree-row"
        class="relative max-h-72 overflow-y-auto border-b border-default bg-muted/40 p-2 text-sm sm:h-[25rem] sm:max-h-none sm:border-e sm:border-b-0"
        aria-label="Tree"
      >
        <li v-for="{ item, match } in rows" :key="item.id">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md py-1 pe-2 text-start transition-colors"
            :class="[
              selected === item.id && match
                ? 'bg-primary/10 text-highlighted'
                : 'hover:bg-elevated',
              match ? 'text-default' : 'text-dimmed',
            ]"
            :style="{ paddingInlineStart: `${0.5 + depthOf(item) * 0.9}rem` }"
            @click="pick(item)"
          >
            <span v-if="item.emoji" class="w-4 shrink-0 text-center text-[13px]">{{
              item.emoji
            }}</span>
            <UIcon
              v-else-if="item.kind === 'task'"
              :name="done[item.id] ? 'i-lucide-square-check' : 'i-lucide-square'"
              class="size-4 shrink-0"
              :class="match ? KINDS.task.color : ''"
            />
            <UIcon
              v-else
              :name="iconOf(item)"
              class="size-4 shrink-0"
              :class="match ? KINDS[item.kind].color : ''"
            />
            <span
              class="truncate"
              :class="item.kind === 'task' && done[item.id] ? 'text-muted line-through' : ''"
              >{{ item.title }}</span
            >
            <span
              v-if="item.kind === 'event' && match"
              class="ms-auto shrink-0 text-[11px] text-dimmed tabular-nums"
              >{{ item.day?.slice(4) }}</span
            >
          </button>
        </li>
      </TransitionGroup>

      <!-- What the lens shows -->
      <div class="relative min-h-80 p-5 sm:h-[25rem] sm:overflow-y-auto sm:p-7">
        <Transition name="onetree-pane" mode="out-in">
          <!-- One item, as a page -->
          <div v-if="showsItem" :key="`item-${current.id}`" data-testid="one-tree-pane">
            <p class="flex flex-wrap items-center gap-1 text-xs text-dimmed">
              <span v-for="part in pathOf(current)" :key="part" class="flex items-center gap-1">
                {{ part }} <UIcon name="i-lucide-chevron-right" class="size-3" />
              </span>
              <span
                class="flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
                :class="[KINDS[current.kind].tint, KINDS[current.kind].color]"
              >
                <UIcon :name="iconOf(current)" class="size-3" />
                {{ KINDS[current.kind].label.slice(0, -1) }}
              </span>
            </p>
            <h3 class="mt-3 text-2xl font-bold tracking-tight text-highlighted">
              <span v-if="current.emoji" class="me-1">{{ current.emoji }}</span
              >{{ current.title }}
            </h3>

            <template v-if="current.kind === 'note'">
              <div class="mt-4 space-y-2" aria-hidden="true">
                <span class="block h-2 w-11/12 rounded-full bg-accented" />
                <span class="block h-2 w-9/12 rounded-full bg-accented" />
                <span class="block h-2 w-10/12 rounded-full bg-accented" />
              </div>
              <template v-if="childrenOf(current.id).length">
                <p class="mt-6 text-xs font-semibold tracking-wide text-muted uppercase">
                  In this page
                </p>
                <ul class="mt-2 grid gap-1.5 sm:grid-cols-2">
                  <li v-for="child in childrenOf(current.id)" :key="child.id">
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 rounded-lg border border-default bg-default px-3 py-2 text-start text-sm transition-colors hover:border-accented"
                      @click="pick(child)"
                    >
                      <span
                        class="grid size-6 shrink-0 place-items-center rounded-md"
                        :class="KINDS[child.kind].tint"
                      >
                        <UIcon
                          :name="iconOf(child)"
                          class="size-3.5"
                          :class="KINDS[child.kind].color"
                        />
                      </span>
                      <span class="min-w-0">
                        <span class="block truncate text-default">{{ child.title }}</span>
                        <span class="block truncate text-[11px] text-dimmed">
                          <template v-if="child.kind === 'event'"
                            >{{ child.day }} · {{ child.time }}</template
                          >
                          <template v-else-if="child.kind === 'task'">{{
                            done[child.id] ? 'Done' : `Due ${child.due}`
                          }}</template>
                          <template v-else-if="child.kind === 'file'">{{
                            formatSize(child.size ?? 0)
                          }}</template>
                          <template v-else-if="child.kind === 'bookmark'">{{ child.url }}</template>
                          <template v-else>Page</template>
                        </span>
                      </span>
                    </button>
                  </li>
                </ul>
              </template>
            </template>

            <div
              v-else-if="current.kind === 'event'"
              class="mt-5 flex items-center gap-4 rounded-xl border border-default p-4"
            >
              <span
                class="grid size-14 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-center"
              >
                <span class="text-[10px] font-semibold text-rose-500 uppercase">{{
                  current.day?.slice(0, 3)
                }}</span>
                <span class="-mt-1 text-xl font-bold text-highlighted tabular-nums">{{
                  current.day?.slice(4, 6)
                }}</span>
              </span>
              <span class="text-sm">
                <span class="block font-medium text-highlighted"
                  >{{ current.day }} · {{ current.time }}</span
                >
                <span class="block text-muted">An event with its own page for notes.</span>
              </span>
            </div>

            <button
              v-else-if="current.kind === 'task'"
              type="button"
              class="mt-5 flex w-full items-center gap-3 rounded-xl border border-default p-4 text-start text-sm"
              @click="toggle(current)"
            >
              <UIcon
                :name="done[current.id] ? 'i-lucide-square-check' : 'i-lucide-square'"
                class="size-5 text-emerald-500"
              />
              <span :class="done[current.id] ? 'text-muted line-through' : 'text-highlighted'">{{
                current.title
              }}</span>
              <span class="ms-auto text-xs text-dimmed">{{
                done[current.id] ? 'Done' : `Due ${current.due}`
              }}</span>
            </button>

            <div
              v-else-if="current.kind === 'file'"
              class="mt-5 flex items-center gap-4 rounded-xl border border-default p-4 text-sm"
            >
              <span class="grid size-14 place-items-center rounded-xl bg-violet-500/10">
                <UIcon name="i-lucide-file" class="size-7 text-violet-500" />
              </span>
              <span>
                <span class="block font-medium text-highlighted">{{ current.title }}</span>
                <span class="block text-muted">{{ formatSize(current.size ?? 0) }}</span>
              </span>
            </div>

            <div v-else class="mt-5 rounded-xl border border-default p-4 text-sm">
              <p class="flex items-center gap-2 font-medium text-highlighted">
                <UIcon name="i-lucide-globe" class="size-4 text-orange-500" /> {{ current.url }}
              </p>
              <div class="mt-3 space-y-2" aria-hidden="true">
                <span class="block h-2 w-10/12 rounded-full bg-accented" />
                <span class="block h-2 w-7/12 rounded-full bg-accented" />
              </div>
              <p class="mt-3 text-xs text-dimmed">The page is saved with the link.</p>
            </div>
          </div>

          <!-- Events: an agenda -->
          <div v-else-if="lens === 'event'" key="event">
            <p class="onetree-lens-title">This week</p>
            <ul class="mt-4 space-y-2">
              <li
                v-for="item in ofLens"
                :key="item.id"
                class="onetree-entry flex items-center gap-3 rounded-xl border p-3"
                :class="selected === item.id ? 'border-rose-500/50' : 'border-default'"
              >
                <span
                  class="grid size-11 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-center leading-none"
                >
                  <span>
                    <span class="block text-[9px] font-semibold text-rose-500 uppercase">{{
                      item.day?.slice(0, 3)
                    }}</span>
                    <span class="block text-base font-bold text-highlighted tabular-nums">{{
                      item.day?.slice(4, 6)
                    }}</span>
                  </span>
                </span>
                <span class="min-w-0 text-sm">
                  <span class="block truncate font-medium text-highlighted">{{ item.title }}</span>
                  <span class="block truncate text-xs text-dimmed"
                    >{{ item.time }} · in {{ pathOf(item).join(' › ') }}</span
                  >
                </span>
              </li>
            </ul>
          </div>

          <!-- Tasks: a checklist -->
          <div v-else-if="lens === 'task'" key="task">
            <p class="onetree-lens-title">To do, from every branch</p>
            <ul class="mt-4 divide-y divide-default rounded-xl border border-default">
              <li v-for="item in ofLens" :key="item.id" class="onetree-entry">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-3 py-2.5 text-start text-sm"
                  :class="selected === item.id ? 'bg-emerald-500/5' : ''"
                  @click="toggle(item)"
                >
                  <UIcon
                    :name="done[item.id] ? 'i-lucide-square-check' : 'i-lucide-square'"
                    class="size-4.5 shrink-0 text-emerald-500"
                  />
                  <span class="min-w-0">
                    <span
                      class="block truncate"
                      :class="done[item.id] ? 'text-muted line-through' : 'text-highlighted'"
                      >{{ item.title }}</span
                    >
                    <span class="block truncate text-xs text-dimmed">{{
                      pathOf(item).join(' › ')
                    }}</span>
                  </span>
                  <span class="ms-auto shrink-0 text-xs text-dimmed">{{
                    done[item.id] ? 'Done' : item.due
                  }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- Files: a grid -->
          <div v-else-if="lens === 'file'" key="file">
            <p class="onetree-lens-title">Files, wherever they live</p>
            <ul class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
              <li
                v-for="item in ofLens"
                :key="item.id"
                class="onetree-entry rounded-xl border p-3"
                :class="selected === item.id ? 'border-violet-500/50' : 'border-default'"
              >
                <span class="grid h-16 place-items-center rounded-lg bg-violet-500/10">
                  <UIcon
                    :name="
                      item.title.endsWith('.png')
                        ? 'i-lucide-file-image'
                        : item.title.endsWith('.pdf')
                          ? 'i-lucide-file-text'
                          : 'i-lucide-file-spreadsheet'
                    "
                    class="size-7 text-violet-500"
                  />
                </span>
                <span class="mt-2 block truncate text-sm font-medium text-highlighted">{{
                  item.title
                }}</span>
                <span class="block truncate text-xs text-dimmed"
                  >{{ formatSize(item.size ?? 0) }} · {{ pathOf(item).at(-1) }}</span
                >
              </li>
            </ul>
          </div>

          <!-- Bookmarks: a reading list -->
          <div v-else key="bookmark">
            <p class="onetree-lens-title">Saved links</p>
            <ul class="mt-4 space-y-2">
              <li
                v-for="item in ofLens"
                :key="item.id"
                class="onetree-entry flex items-center gap-3 rounded-xl border p-3"
                :class="selected === item.id ? 'border-orange-500/50' : 'border-default'"
              >
                <span
                  class="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-sm font-bold text-orange-500 uppercase"
                  >{{ item.url?.[0] }}</span
                >
                <span class="min-w-0 text-sm">
                  <span class="block truncate font-medium text-highlighted">{{ item.title }}</span>
                  <span class="block truncate text-xs text-dimmed"
                    >{{ item.url }} · in {{ pathOf(item).join(' › ') }}</span
                  >
                </span>
              </li>
            </ul>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style>
.onetree-window {
  box-shadow:
    0 1px 0 0 color-mix(in oklab, white 40%, transparent) inset,
    0 30px 80px -20px color-mix(in oklab, var(--ui-color-primary-700) 35%, transparent),
    0 12px 30px -10px rgb(0 0 0 / 0.2);
}
.onetree-lens-title {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

/* Rows come and go as the lens changes. */
.onetree-row-move,
.onetree-row-enter-active,
.onetree-row-leave-active {
  transition:
    opacity 0.35s ease,
    transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
}
.onetree-row-enter-from,
.onetree-row-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
.onetree-row-leave-active {
  position: absolute;
  inset-inline: 0.5rem;
}

.onetree-pane-enter-active,
.onetree-pane-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.onetree-pane-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.onetree-pane-leave-to {
  opacity: 0;
}
.onetree-entry {
  animation: onetree-entry 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.onetree-entry:nth-child(2) {
  animation-delay: 60ms;
}
.onetree-entry:nth-child(3) {
  animation-delay: 120ms;
}
.onetree-entry:nth-child(4) {
  animation-delay: 180ms;
}
@keyframes onetree-entry {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .onetree-row-move,
  .onetree-row-enter-active,
  .onetree-row-leave-active,
  .onetree-pane-enter-active,
  .onetree-pane-leave-active {
    transition: none;
  }
  .onetree-entry {
    animation: none;
  }
}
</style>
