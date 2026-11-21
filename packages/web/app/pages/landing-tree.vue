<script setup lang="ts">
// A proposal for a future Tandem, as a landing page: one tree for everything (notes, events,
// tasks, files, bookmarks…) instead of one tool per kind, with lenses to see a single kind. It is
// on the website (TANDEM_SITE, see nuxt.config.ts) at /one-tree, linked from nowhere and not
// indexed; the current landing page stays at `/`. Follows the accent color, light/dark mode and
// reduced motion, as the current one does.
import { logoSvg, accentShade } from '~/utils/logo'
import { vReveal } from '~/utils/reveal'

definePageMeta({ layout: false })
useHead({
  title: 'Tandem — one tree for everything',
  titleTemplate: null,
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const headerLogo = logoSvg(accentShade, 'tree-logo')
const ctaLogo = logoSvg(accentShade, 'tree-logo-cta')
const GITHUB = 'https://github.com/ddahan/tandem'

const scrolled = ref(false)
const onScroll = () => (scrolled.value = window.scrollY > 8)
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

function spotlight(event: PointerEvent) {
  const card = event.currentTarget as HTMLElement
  const bounds = card.getBoundingClientRect()
  card.style.setProperty('--spot-x', `${event.clientX - bounds.left}px`)
  card.style.setProperty('--spot-y', `${event.clientY - bounds.top}px`)
}

// The kinds, as the demo colors them.
const KIND = {
  note: { icon: 'i-lucide-file-text', color: 'text-sky-500', tint: 'bg-sky-500/10' },
  event: { icon: 'i-lucide-calendar', color: 'text-rose-500', tint: 'bg-rose-500/10' },
  task: { icon: 'i-lucide-circle-check', color: 'text-emerald-500', tint: 'bg-emerald-500/10' },
  file: { icon: 'i-lucide-paperclip', color: 'text-violet-500', tint: 'bg-violet-500/10' },
  bookmark: { icon: 'i-lucide-bookmark', color: 'text-orange-500', tint: 'bg-orange-500/10' },
  more: { icon: 'i-lucide-plus', color: 'text-primary', tint: 'bg-primary/10' },
} as const

// One project, today: a piece in each app.
const SCATTERED = [
  { app: 'Notes', icon: 'i-lucide-notebook-pen', kind: 'note', piece: 'Launch plan', tilt: -4 },
  { app: 'Calendar', icon: 'i-lucide-calendar-days', kind: 'event', piece: 'Kickoff', tilt: 3 },
  { app: 'To-do', icon: 'i-lucide-list-checks', kind: 'task', piece: 'Ship the beta', tilt: -2 },
  { app: 'Drive', icon: 'i-lucide-hard-drive', kind: 'file', piece: 'budget.xlsx', tilt: 4 },
  { app: 'Browser', icon: 'i-lucide-globe', kind: 'bookmark', piece: 'Checklist', tilt: -3 },
] as const

// …and in one tree.
const BRANCH = [
  { kind: 'event', title: 'Kickoff meeting', meta: 'Tue 24/11 · 10:00' },
  { kind: 'task', title: 'Ship the beta', meta: 'Due 30/11' },
  { kind: 'file', title: 'budget.xlsx', meta: '47 Ko' },
  { kind: 'bookmark', title: 'Launch checklist', meta: 'producthunt.com' },
  { kind: 'note', title: 'Meeting notes', meta: 'Page' },
] as const

const KINDS = [
  {
    kind: 'note',
    title: 'Notes',
    text: 'Pages, as today: rich Markdown, history, authorship. Any page can hold anything below it.',
    disk: 'Launch.md',
  },
  {
    kind: 'event',
    title: 'Events',
    text: 'A page with a date and a time. Its agenda and its minutes are the page itself.',
    disk: 'when: 2026-11-24 10:00',
  },
  {
    kind: 'task',
    title: 'Tasks',
    text: 'A checkbox in any page, or a page with a due date when it needs more room.',
    disk: '- [ ] Ship the beta 📅 30/11',
  },
  {
    kind: 'file',
    title: 'Files',
    text: 'Any file, next to the page it belongs to. Previewed in place, found by search.',
    disk: 'Launch/budget.xlsx',
  },
  {
    kind: 'bookmark',
    title: 'Bookmarks',
    text: 'A link with its page saved, from the browser extension, filed where it matters.',
    disk: 'url: https://…',
  },
  {
    kind: 'more',
    title: '…and so on',
    text: 'People, places, feeds, databases. A new kind is a new kind of node, not a new app.',
    disk: 'kind: person',
  },
] as const

// 1 November 2026 is a Sunday (the 7th column).
const CALENDAR = { first: 7, days: 30, today: 21, marks: { 24: 'rose', 26: 'rose', 27: 'rose' } }
const LENS_TASKS = [
  { title: 'Ship the beta', where: 'Launch', done: false },
  { title: 'Draft the announcement', where: 'Launch', done: true },
  { title: 'Renew the passport', where: 'Home', done: false },
]
const LENS_FILES = [
  { name: 'budget.xlsx', icon: 'i-lucide-file-spreadsheet', where: 'Launch' },
  { name: 'lease.pdf', icon: 'i-lucide-file-text', where: 'Home' },
  { name: 'cover.png', icon: 'i-lucide-file-image', where: 'Reading' },
  { name: 'demo.mp4', icon: 'i-lucide-file-video', where: 'Launch' },
]

const MOVES = [
  {
    icon: 'i-lucide-archive',
    title: 'Archive a project in one move',
    text: 'Its meetings leave the calendar, its tasks leave your list, its files go with it.',
  },
  {
    icon: 'i-lucide-search',
    title: 'One search for all of it',
    text: 'Pages, events, tasks, file names and saved pages, with kind: and in: to narrow it.',
  },
  {
    icon: 'i-lucide-link',
    title: 'Links that never break',
    text: 'Link a meeting from a task, a file from a page: everything is a node with a name.',
  },
]

const AGENT_POINTS = [
  { icon: 'i-lucide-plug', text: 'One set of tools for every kind: no calendar API, no todo API' },
  {
    icon: 'i-lucide-git-branch',
    text: 'Give an agent a branch: it sees the whole project at once',
  },
  { icon: 'i-lucide-pen-line', text: 'What it adds is its own in the history, as notes are today' },
]
</script>

<template>
  <div class="tree-root min-h-screen overflow-x-clip bg-default text-default">
    <!-- Header -->
    <header
      class="fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300"
      :class="
        scrolled
          ? 'border-default bg-default/75 backdrop-blur-xl'
          : 'border-transparent bg-transparent'
      "
    >
      <nav class="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="#top" class="flex items-center gap-2.5" aria-label="Tandem">
          <!-- eslint-disable-next-line vue/no-v-html -- our own static drawing -->
          <span
            class="size-8 overflow-hidden rounded-lg shadow-sm [&_svg]:size-full"
            v-html="headerLogo"
          />
          <span class="text-base font-semibold tracking-tight text-highlighted">tandem</span>
          <UBadge label="Preview" variant="subtle" size="sm" class="rounded-full" />
        </a>
        <div class="hidden items-center gap-6 text-sm text-muted md:flex">
          <a href="#why" class="transition-colors hover:text-highlighted">Why one tree</a>
          <a href="#lenses" class="transition-colors hover:text-highlighted">Lenses</a>
          <a href="#agents" class="transition-colors hover:text-highlighted">Agents</a>
        </div>
        <div class="ms-auto flex items-center gap-1.5">
          <UButton
            :to="GITHUB"
            target="_blank"
            icon="i-lucide-github"
            color="neutral"
            variant="ghost"
            aria-label="Tandem on GitHub"
          />
          <UButton to="/" label="Today's Tandem" color="neutral" variant="outline" />
        </div>
      </nav>
    </header>

    <!-- Hero -->
    <section id="top" class="relative isolate px-4 pt-32 pb-24 sm:px-6 sm:pt-40">
      <div class="tree-aurora" aria-hidden="true">
        <span class="tree-blob tree-blob-1" />
        <span class="tree-blob tree-blob-2" />
        <div class="tree-grid" />
      </div>

      <div class="mx-auto max-w-4xl text-center">
        <div class="tree-rise" style="--delay: 0ms">
          <span
            class="inline-flex items-center gap-2 rounded-full border border-default bg-default/70 px-3 py-1 text-xs font-medium text-muted shadow-sm backdrop-blur"
          >
            <UIcon name="i-lucide-sparkles" class="size-3.5 text-primary" />
            Where Tandem is going
          </span>
        </div>
        <h1
          class="tree-rise mt-6 text-5xl font-bold tracking-tight text-balance text-highlighted sm:text-7xl"
          style="--delay: 90ms"
        >
          One tree. <br class="hidden sm:block" />
          <span class="tree-gradient-text">Everything in it.</span>
        </h1>
        <p
          class="tree-rise mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted sm:text-xl"
          style="--delay: 180ms"
        >
          Notes, events, tasks, files and bookmarks, side by side in the branches they belong to.
          Not five apps that never talk. Need to see only your files? Look through a lens.
        </p>
        <div
          class="tree-rise mt-8 flex flex-wrap items-center justify-center gap-2"
          style="--delay: 270ms"
          aria-hidden="true"
        >
          <span
            v-for="kind in ['note', 'event', 'task', 'file', 'bookmark'] as const"
            :key="kind"
            class="flex items-center gap-1.5 rounded-full border border-default bg-default/70 px-3 py-1.5 text-sm text-default capitalize shadow-xs backdrop-blur"
          >
            <UIcon :name="KIND[kind].icon" class="size-4" :class="KIND[kind].color" />
            {{ kind }}s
          </span>
          <span class="px-1 text-sm text-dimmed">→</span>
          <span
            class="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-inverted shadow-sm"
          >
            <UIcon name="i-lucide-list-tree" class="size-4" /> one tree
          </span>
        </div>
      </div>

      <div class="tree-window-in relative mx-auto mt-14 max-w-5xl" style="--delay: 380ms">
        <div class="tree-window-glow" aria-hidden="true" />
        <LandingOneTreeDemo class="relative" />
        <p class="mt-4 text-center text-sm text-dimmed">
          Try it: pick a lens, open a page, tick a task.
        </p>
      </div>
    </section>

    <!-- Why: scattered vs one branch -->
    <section id="why" class="scroll-mt-16 border-y border-default bg-muted/40 py-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div v-reveal class="mx-auto max-w-2xl text-center">
          <p class="text-sm font-semibold text-primary">Why one tree</p>
          <h2
            class="mt-2 text-3xl font-bold tracking-tight text-balance text-highlighted sm:text-5xl"
          >
            Your project isn't five things.
          </h2>
          <p class="mt-4 text-lg text-muted">
            Yet its meeting is in a calendar, its tasks in a to-do app, its budget in a drive, its
            links in a browser and its thinking in notes. Five places to look, five places to clean
            up.
          </p>
        </div>

        <div class="mt-14 grid items-center gap-10 lg:grid-cols-[1fr_auto_1fr]">
          <!-- Today -->
          <div v-reveal class="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Today">
            <div
              v-for="(app, index) in SCATTERED"
              :key="app.app"
              class="tree-scattered rounded-xl border border-default bg-default p-3 shadow-sm"
              :style="{ '--tilt': `${app.tilt}deg`, '--float-delay': `${index * -1.3}s` }"
            >
              <p class="flex items-center gap-1.5 text-xs font-medium text-muted">
                <UIcon :name="app.icon" class="size-3.5" /> {{ app.app }}
              </p>
              <p class="mt-2 flex items-center gap-1.5 text-sm text-highlighted">
                <UIcon
                  :name="KIND[app.kind].icon"
                  class="size-4 shrink-0"
                  :class="KIND[app.kind].color"
                />
                <span class="truncate">{{ app.piece }}</span>
              </p>
            </div>
          </div>

          <div v-reveal="120" class="flex justify-center text-dimmed" aria-hidden="true">
            <UIcon name="i-lucide-arrow-right" class="hidden size-8 lg:block" />
            <UIcon name="i-lucide-arrow-down" class="size-8 lg:hidden" />
          </div>

          <!-- With one tree -->
          <div
            v-reveal="240"
            class="rounded-2xl border border-default bg-default p-4 shadow-lg"
            aria-label="With one tree"
          >
            <p class="flex items-center gap-2 px-2 text-sm font-semibold text-highlighted">
              <span>🚀</span> Launch
            </p>
            <ul class="tree-branch ms-4 mt-2 border-s border-default ps-3">
              <li
                v-for="(item, index) in BRANCH"
                :key="item.title"
                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                :style="{ '--item-delay': `${index * 110}ms` }"
              >
                <span
                  class="grid size-6 shrink-0 place-items-center rounded-md"
                  :class="KIND[item.kind].tint"
                >
                  <UIcon
                    :name="KIND[item.kind].icon"
                    class="size-3.5"
                    :class="KIND[item.kind].color"
                  />
                </span>
                <span class="truncate text-default">{{ item.title }}</span>
                <span class="ms-auto shrink-0 text-xs text-dimmed">{{ item.meta }}</span>
              </li>
            </ul>
            <p class="mt-3 px-2 text-xs text-dimmed">One place to look. One place to clean up.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Kinds -->
    <section id="kinds" class="mx-auto max-w-6xl px-4 py-28 sm:px-6">
      <div v-reveal class="mx-auto max-w-2xl text-center">
        <p class="text-sm font-semibold text-primary">Every kind of thing</p>
        <h2
          class="mt-2 text-3xl font-bold tracking-tight text-balance text-highlighted sm:text-5xl"
        >
          Everything is a node.
        </h2>
        <p class="mt-4 text-lg text-muted">
          Each kind brings what it needs (a date, a checkbox, a preview, a saved page) and the tree
          gives them all the same things: a place, a name, a history, links and search.
        </p>
      </div>
      <div class="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="(kind, index) in KINDS"
          :key="kind.kind"
          v-reveal="(index % 3) * 90"
          class="tree-card"
          @pointermove="spotlight"
        >
          <span
            class="mb-4 grid size-10 place-items-center rounded-xl"
            :class="KIND[kind.kind].tint"
          >
            <UIcon :name="KIND[kind.kind].icon" class="size-5" :class="KIND[kind.kind].color" />
          </span>
          <h3 class="text-lg font-semibold text-highlighted">{{ kind.title }}</h3>
          <p class="mt-2 text-muted">{{ kind.text }}</p>
          <code
            class="mt-5 block truncate rounded-lg border border-default bg-default px-3 py-2 font-mono text-xs text-muted"
            >{{ kind.disk }}</code
          >
        </article>
      </div>
    </section>

    <!-- Lenses -->
    <section id="lenses" class="scroll-mt-16 border-y border-default bg-muted/40 py-28">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div v-reveal class="mx-auto max-w-2xl text-center">
          <p class="text-sm font-semibold text-primary">Lenses</p>
          <h2
            class="mt-2 text-3xl font-bold tracking-tight text-balance text-highlighted sm:text-5xl"
          >
            Need only files? Still possible.
          </h2>
          <p class="mt-4 text-lg text-muted">
            A lens narrows the tree to one kind and lays it out the way that kind wants. It's a
            view, not a separate app: every item still knows its branch, one click away.
          </p>
        </div>

        <div class="mt-14 grid gap-4 lg:grid-cols-3">
          <!-- Calendar -->
          <article v-reveal class="tree-card tree-card-raised" @pointermove="spotlight">
            <h3 class="flex items-center gap-2 font-semibold text-highlighted">
              <UIcon :name="KIND.event.icon" class="size-5" :class="KIND.event.color" /> Calendar
            </h3>
            <p class="mt-1 text-sm text-muted">Every event in the tree, by day.</p>
            <div class="mt-5 rounded-xl border border-default bg-default p-3" aria-hidden="true">
              <p class="mb-2 text-xs font-medium text-muted">November 2026</p>
              <div class="grid grid-cols-7 gap-1 text-center text-[11px]">
                <span
                  v-for="(day, index) in ['M', 'T', 'W', 'T', 'F', 'S', 'S']"
                  :key="index"
                  class="text-dimmed"
                  >{{ day }}</span
                >
                <span v-for="blank in CALENDAR.first - 1" :key="`b${blank}`" />
                <span
                  v-for="day in CALENDAR.days"
                  :key="day"
                  class="relative grid aspect-square place-items-center rounded-md tabular-nums"
                  :class="
                    day === CALENDAR.today
                      ? 'bg-primary font-semibold text-inverted'
                      : day in CALENDAR.marks
                        ? 'bg-rose-500/10 font-medium text-highlighted'
                        : 'text-muted'
                  "
                >
                  {{ day }}
                  <span
                    v-if="day in CALENDAR.marks"
                    class="absolute bottom-0.5 size-1 rounded-full bg-rose-500"
                  />
                </span>
              </div>
            </div>
          </article>

          <!-- Tasks -->
          <article v-reveal="90" class="tree-card tree-card-raised" @pointermove="spotlight">
            <h3 class="flex items-center gap-2 font-semibold text-highlighted">
              <UIcon :name="KIND.task.icon" class="size-5" :class="KIND.task.color" /> To do
            </h3>
            <p class="mt-1 text-sm text-muted">Every task, from every branch.</p>
            <ul
              class="mt-5 divide-y divide-default rounded-xl border border-default bg-default"
              aria-hidden="true"
            >
              <li
                v-for="task in LENS_TASKS"
                :key="task.title"
                class="flex items-center gap-2.5 px-3 py-2.5"
              >
                <UIcon
                  :name="task.done ? 'i-lucide-square-check' : 'i-lucide-square'"
                  class="size-4 shrink-0 text-emerald-500"
                />
                <span
                  class="truncate text-sm"
                  :class="task.done ? 'text-muted line-through' : 'text-highlighted'"
                  >{{ task.title }}</span
                >
                <span
                  class="ms-auto shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[11px] text-muted"
                  >{{ task.where }}</span
                >
              </li>
            </ul>
          </article>

          <!-- Files -->
          <article v-reveal="180" class="tree-card tree-card-raised" @pointermove="spotlight">
            <h3 class="flex items-center gap-2 font-semibold text-highlighted">
              <UIcon :name="KIND.file.icon" class="size-5" :class="KIND.file.color" /> Files
            </h3>
            <p class="mt-1 text-sm text-muted">Every file, as a grid, wherever it lives.</p>
            <div class="mt-5 grid grid-cols-2 gap-2" aria-hidden="true">
              <div
                v-for="file in LENS_FILES"
                :key="file.name"
                class="rounded-xl border border-default bg-default p-2.5"
              >
                <span class="grid h-12 place-items-center rounded-lg bg-violet-500/10">
                  <UIcon :name="file.icon" class="size-6 text-violet-500" />
                </span>
                <p class="mt-1.5 truncate text-xs font-medium text-highlighted">{{ file.name }}</p>
                <p class="truncate text-[11px] text-dimmed">in {{ file.where }}</p>
              </div>
            </div>
          </article>
        </div>

        <p v-reveal class="mt-10 text-center text-muted">
          Or type it:
          <code class="tree-code">kind:file</code>,
          <code class="tree-code">kind:task in:Launch</code>,
          <code class="tree-code">kind:event this week</code>.
        </p>
      </div>
    </section>

    <!-- Moving branches -->
    <section class="mx-auto max-w-6xl px-4 py-28 sm:px-6">
      <div class="grid items-center gap-14 lg:grid-cols-2">
        <div v-reveal>
          <p class="text-sm font-semibold text-primary">Branches</p>
          <h2
            class="mt-2 text-3xl font-bold tracking-tight text-balance text-highlighted sm:text-5xl"
          >
            Move a branch, everything moves.
          </h2>
          <p class="mt-5 text-lg text-muted">
            Context lives together, so it travels together. No more orphaned meetings and tasks from
            a project you closed months ago.
          </p>
          <ul class="mt-8 space-y-5">
            <li
              v-for="(move, index) in MOVES"
              :key="move.title"
              v-reveal="120 + index * 80"
              class="flex items-start gap-3"
            >
              <span
                class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
              >
                <UIcon :name="move.icon" class="size-4.5" />
              </span>
              <span>
                <span class="block font-medium text-highlighted">{{ move.title }}</span>
                <span class="block text-muted">{{ move.text }}</span>
              </span>
            </li>
          </ul>
        </div>

        <div
          v-reveal="150"
          class="relative rounded-2xl border border-default bg-muted/50 p-5 text-sm"
          aria-hidden="true"
        >
          <p class="flex items-center gap-2 rounded-md px-2 py-1 text-default">
            <span>🏡</span> Home
          </p>
          <p class="flex items-center gap-2 rounded-md px-2 py-1 text-default">
            <span>📚</span> Reading
          </p>
          <div class="tree-archive mt-1 rounded-lg border border-dashed border-accented p-2">
            <p class="flex items-center gap-2 px-2 py-1 font-medium text-muted">
              <UIcon name="i-lucide-archive" class="size-4" /> Archive
            </p>
            <div class="tree-moving ms-4 rounded-lg border border-default bg-default p-2 shadow-lg">
              <p class="flex items-center gap-2 px-2 py-1 font-medium text-highlighted">
                <span>🚀</span> Launch
              </p>
              <div class="ms-4 border-s border-default ps-2">
                <p
                  v-for="item in BRANCH.slice(0, 4)"
                  :key="item.title"
                  class="flex items-center gap-2 px-2 py-0.5 text-muted"
                >
                  <UIcon
                    :name="KIND[item.kind].icon"
                    class="size-3.5"
                    :class="KIND[item.kind].color"
                  />
                  {{ item.title }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Agents -->
    <section
      id="agents"
      class="relative isolate scroll-mt-16 overflow-hidden bg-zinc-950 py-28 text-zinc-300"
    >
      <div class="tree-dark-glow" aria-hidden="true" />
      <div class="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div v-reveal>
          <p class="text-sm font-semibold text-(--ui-color-primary-400)">For agents</p>
          <h2 class="mt-2 text-3xl font-bold tracking-tight text-balance text-white sm:text-5xl">
            One tree for your agents, too.
          </h2>
          <p class="mt-5 text-lg text-zinc-400">
            Ask Claude to prepare Tuesday's kickoff: it reads the Launch branch, sees the meeting,
            the open tasks and the budget, and writes the agenda right into the event.
          </p>
          <ul class="mt-8 space-y-4">
            <li
              v-for="(point, index) in AGENT_POINTS"
              :key="point.text"
              v-reveal="120 + index * 80"
              class="flex items-start gap-3"
            >
              <span
                class="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 ring-1 ring-white/10"
              >
                <UIcon :name="point.icon" class="size-4 text-(--ui-color-primary-400)" />
              </span>
              <span class="pt-1 text-zinc-300">{{ point.text }}</span>
            </li>
          </ul>
        </div>
        <div
          v-reveal="150"
          class="tree-terminal overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/80"
        >
          <div
            class="flex items-center gap-1.5 border-b border-white/10 px-4 py-3"
            aria-hidden="true"
          >
            <span class="size-3 rounded-full bg-white/15" />
            <span class="size-3 rounded-full bg-white/15" />
            <span class="size-3 rounded-full bg-white/15" />
            <span class="ms-3 text-xs text-zinc-500">a sketch, not a promise</span>
          </div>
          <pre
            class="overflow-x-auto p-5 font-mono text-[13px] leading-6"
          ><span class="text-zinc-500">$</span> <span class="text-white">tandem tree Launch</span>
🚀 Launch
├─ <span class="text-rose-300">◷ Kickoff meeting</span>        <span class="text-zinc-500">Tue 24/11 10:00</span>
├─ <span class="text-emerald-300">☐ Ship the beta</span>          <span class="text-zinc-500">due 30/11</span>
├─ <span class="text-emerald-300">☑ Draft the announcement</span>
├─ <span class="text-violet-300">▤ budget.xlsx</span>            <span class="text-zinc-500">47 Ko</span>
└─ <span class="text-orange-300">↗ Launch checklist</span>       <span class="text-zinc-500">producthunt.com</span>

<span class="text-zinc-500">$</span> <span class="text-white">tandem add event "Retro" --in Launch --at "01/12 16:00"</span>
<span class="text-emerald-400">✓</span> Added <span class="text-rose-300">◷ Retro</span> to 🚀 Launch

<span class="text-zinc-500">$</span> <span class="text-white">tandem list kind:task --open</span>
<span class="text-emerald-300">☐ Ship the beta</span>        <span class="text-zinc-500">Launch · 30/11</span>
<span class="text-emerald-300">☐ Renew the passport</span>   <span class="text-zinc-500">Home · 15/12</span></pre>
        </div>
      </div>
    </section>

    <!-- Still files -->
    <section class="mx-auto max-w-6xl px-4 py-28 sm:px-6">
      <div v-reveal class="mx-auto max-w-2xl text-center">
        <p class="text-sm font-semibold text-primary">Your files</p>
        <h2
          class="mt-2 text-3xl font-bold tracking-tight text-balance text-highlighted sm:text-5xl"
        >
          Still just files and folders.
        </h2>
        <p class="mt-4 text-lg text-muted">
          The tree is your folder. An event is a Markdown page with a date, a task is a checkbox, a
          file is a file. Any app can read them; leave anytime with everything.
        </p>
      </div>
      <div
        v-reveal="120"
        class="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2"
        aria-hidden="true"
      >
        <pre
          class="overflow-hidden rounded-2xl border border-default bg-muted/50 p-5 font-mono text-xs leading-6 text-default"
        ><span class="text-muted">~/Notes/</span>
├─ Launch.md
├─ Launch/
│  ├─ <span class="text-rose-500">Kickoff meeting.md</span>
│  ├─ <span class="text-violet-500">budget.xlsx</span>
│  └─ <span class="text-orange-500">Launch checklist.md</span>
├─ Home.md
└─ Home/
   └─ <span class="text-violet-500">lease.pdf</span></pre>
        <pre
          class="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-5 font-mono text-xs leading-6 text-zinc-300"
        ><span class="text-zinc-500">Launch/Kickoff meeting.md</span>

<span class="text-sky-300">---</span>
<span class="text-sky-300">when:</span> 2026-11-24 10:00
<span class="text-sky-300">---</span>

<span class="font-bold text-white"># Agenda</span>

<span class="text-amber-300">- [ ]</span> Ship the beta
<span class="text-amber-300">- [ ]</span> Review <span class="text-(--ui-color-primary-300)">[[budget.xlsx]]</span></pre>
      </div>
    </section>

    <!-- Call to action -->
    <section
      class="relative isolate overflow-hidden border-t border-default px-4 py-32 text-center sm:px-6"
    >
      <div class="tree-cta-glow" aria-hidden="true" />
      <div v-reveal class="mx-auto max-w-3xl">
        <!-- eslint-disable-next-line vue/no-v-html -- our own static drawing -->
        <span
          class="tree-cta-logo mx-auto block size-20 overflow-hidden rounded-3xl shadow-2xl [&_svg]:size-full"
          v-html="ctaLogo"
        />
        <h2
          class="mt-10 text-4xl font-bold tracking-tight text-balance text-highlighted sm:text-6xl"
        >
          Notes today. Everything next.
        </h2>
        <p class="mt-4 text-lg text-muted">
          Today's Tandem already keeps notes, files, bookmarks, a daily page and to-dos. The next
          one puts them in a single tree. Start with today's: your notes will grow into it.
        </p>
        <LandingInstallCommand class="mt-9" />
        <UButton
          to="/"
          size="lg"
          color="neutral"
          variant="link"
          trailing-icon="i-lucide-arrow-right"
          label="See today's Tandem"
          class="mt-4"
        />
      </div>
    </section>

    <footer class="border-t border-default">
      <div
        class="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-muted sm:px-6"
      >
        <span class="font-semibold text-highlighted">tandem</span>
        <span>A preview of what's next: nothing here is final.</span>
        <a
          :href="GITHUB"
          target="_blank"
          class="ms-auto flex items-center gap-1.5 hover:text-highlighted"
          ><UIcon name="i-lucide-github" class="size-4" /> GitHub</a
        >
      </div>
    </footer>
  </div>
</template>

<style>
/* This page's motion, prefixed (global once loaded). The v-reveal rules are the current landing
   page's too: either page can be the first one opened. */
html:has(.tree-root) {
  scroll-behavior: smooth;
}
.reveal {
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
.reveal-visible {
  opacity: 1;
  transform: none;
}

.tree-rise {
  animation: tree-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--delay);
}
@keyframes tree-rise {
  from {
    opacity: 0;
    transform: translateY(18px);
    filter: blur(6px);
  }
}
.tree-window-in {
  animation: tree-window-in 1.2s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--delay);
}
@keyframes tree-window-in {
  from {
    opacity: 0;
    transform: perspective(1600px) translateY(50px) rotateX(12deg) scale(0.97);
  }
}
.tree-window-glow {
  position: absolute;
  inset: 8% 6% -6%;
  border-radius: 2rem;
  background: linear-gradient(
    120deg,
    var(--ui-color-primary-400),
    #f43f5e44,
    #8b5cf655,
    var(--ui-color-primary-600)
  );
  filter: blur(60px);
  opacity: 0.4;
}

.tree-aurora {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.tree-blob {
  position: absolute;
  border-radius: 9999px;
  filter: blur(90px);
  opacity: 0.4;
}
.dark .tree-blob {
  opacity: 0.22;
}
.tree-blob-1 {
  width: 40rem;
  height: 40rem;
  top: -16rem;
  left: 4%;
  background: var(--ui-color-primary-400);
  animation: tree-drift-1 22s ease-in-out infinite alternate;
}
.tree-blob-2 {
  width: 32rem;
  height: 32rem;
  top: -2rem;
  right: 0;
  background: #a78bfa;
  opacity: 0.25;
  animation: tree-drift-2 26s ease-in-out infinite alternate;
}
@keyframes tree-drift-1 {
  to {
    transform: translate(16rem, 6rem) scale(1.15);
  }
}
@keyframes tree-drift-2 {
  to {
    transform: translate(-14rem, 10rem) scale(0.85);
  }
}
.tree-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--ui-border) 1px, transparent 1px),
    linear-gradient(to bottom, var(--ui-border) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 70% 55% at 50% 25%, black 20%, transparent 75%);
  opacity: 0.7;
}
.dark .tree-grid {
  opacity: 0.35;
}

.tree-gradient-text {
  background: linear-gradient(
    100deg,
    var(--ui-color-primary-700),
    var(--ui-color-primary-500),
    var(--ui-color-primary-600),
    var(--ui-color-primary-800)
  );
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: tree-shimmer 9s ease-in-out infinite alternate;
}
.dark .tree-gradient-text {
  background-image: linear-gradient(
    100deg,
    var(--ui-color-primary-300),
    var(--ui-color-primary-500),
    var(--ui-color-primary-400),
    var(--ui-color-primary-200)
  );
}
@keyframes tree-shimmer {
  to {
    background-position: 100% 50%;
  }
}

/* Today: pieces scattered across apps, drifting. */
.tree-scattered {
  transform: rotate(var(--tilt));
  animation: tree-scatter 7s ease-in-out infinite;
  animation-delay: var(--float-delay);
}
@keyframes tree-scatter {
  50% {
    transform: rotate(calc(var(--tilt) * -1)) translateY(-6px);
  }
}
/* One branch: its items come in one by one. */
.tree-branch li {
  opacity: 0;
  transform: translateX(-10px);
  transition:
    opacity 0.6s,
    transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(var(--item-delay) + 300ms);
}
.reveal-visible .tree-branch li {
  opacity: 1;
  transform: none;
}

.tree-card {
  position: relative;
  overflow: hidden;
  border-radius: 1.25rem;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
  padding: 1.75rem;
  transition:
    border-color 0.3s,
    transform 0.8s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
.tree-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    420px circle at var(--spot-x, 50%) var(--spot-y, 0%),
    color-mix(in oklab, var(--ui-primary) 14%, transparent),
    transparent 60%
  );
  opacity: 0;
  transition: opacity 0.3s;
}
.tree-card:hover {
  border-color: color-mix(in oklab, var(--ui-primary) 40%, var(--ui-border));
}
.tree-card:hover::before {
  opacity: 1;
}
.tree-card > * {
  position: relative;
}
.tree-card-raised {
  background: var(--ui-bg);
}
.tree-code {
  border-radius: 0.25rem;
  background: var(--ui-bg-elevated);
  padding: 0.05rem 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: var(--ui-text-highlighted);
}

/* A branch is dragged into the archive, again and again. */
.tree-moving {
  animation: tree-move 6s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@keyframes tree-move {
  0%,
  15% {
    transform: translate(1.5rem, -7.5rem) rotate(-2deg);
    opacity: 0.95;
  }
  45%,
  90% {
    transform: none;
    opacity: 1;
  }
  100% {
    transform: translate(1.5rem, -7.5rem) rotate(-2deg);
    opacity: 0;
  }
}
.tree-archive {
  animation: tree-archive 6s ease-in-out infinite;
}
@keyframes tree-archive {
  0%,
  30% {
    background: transparent;
  }
  45%,
  60% {
    background: color-mix(in oklab, var(--ui-primary) 8%, transparent);
  }
}

.tree-dark-glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(
      50rem 30rem at 85% 40%,
      color-mix(in oklab, var(--ui-color-primary-500) 30%, transparent),
      transparent 70%
    ),
    radial-gradient(30rem 20rem at 10% 90%, #8b5cf622, transparent 70%);
}
.tree-terminal {
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.04),
    0 40px 100px -30px color-mix(in oklab, var(--ui-color-primary-500) 50%, transparent);
}

.tree-cta-glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: radial-gradient(
    40rem 24rem at 50% 30%,
    color-mix(in oklab, var(--ui-color-primary-400) 30%, transparent),
    transparent 70%
  );
}
.tree-cta-logo {
  animation: tree-float 6s ease-in-out infinite;
}
@keyframes tree-float {
  50% {
    transform: translateY(-10px);
  }
}

@media (prefers-reduced-motion: reduce) {
  html:has(.tree-root) {
    scroll-behavior: auto;
  }
  .tree-root *,
  .tree-root *::before,
  .tree-root *::after {
    animation: none !important;
  }
  .reveal,
  .tree-branch li {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
