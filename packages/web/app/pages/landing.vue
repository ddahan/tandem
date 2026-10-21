<script setup lang="ts">
// The landing page: what Tandem is, shown with live demos, and how to install it. It is the
// website (tandem.w3lt.org, built with TANDEM_SITE: see nuxt.config.ts), not part of the app:
// its links lead to the install command and GitHub. Follows the accent color, light/dark mode
// and reduced motion.
import { authorColor } from '~/utils/authorship'
import { logoSvg, accentShade } from '~/utils/logo'
import { vReveal } from '~/utils/reveal'

definePageMeta({ layout: false })
useHead({ title: 'Tandem — notes you write with your agents', titleTemplate: null })

const headerLogo = logoSvg(accentShade, 'landing-logo')
const ctaLogo = logoSvg(accentShade, 'landing-logo-cta')
const GITHUB = 'https://github.com/ddahan/tandem'

// The header gets its border once the page scrolls.
const scrolled = ref(false)
const onScroll = () => (scrolled.value = window.scrollY > 8)
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

// The hero window leans toward the pointer.
const tilt = ref({ x: 0, y: 0 })
function onHeroMove(event: PointerEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  tilt.value = {
    x: ((event.clientY - bounds.top) / bounds.height - 0.5) * -6,
    y: ((event.clientX - bounds.left) / bounds.width - 0.5) * 8,
  }
}
const resetTilt = () => (tilt.value = { x: 0, y: 0 })

// Cards light up under the pointer.
function spotlight(event: PointerEvent) {
  const card = event.currentTarget as HTMLElement
  const bounds = card.getBoundingClientRect()
  card.style.setProperty('--spot-x', `${event.clientX - bounds.left}px`)
  card.style.setProperty('--spot-y', `${event.clientY - bounds.top}px`)
}

// Numbers count up when they show (measured: `bench`, 5,000 notes).
const STATS = [
  { value: 40, prefix: '~', suffix: ' ms', label: 'to search 5,000 notes as you type' },
  { value: 0, prefix: '', suffix: '', label: 'lock-in: every page is a .md file' },
  { value: 17, prefix: '', suffix: '', label: 'MCP tools for your agents' },
  { value: 100, prefix: '', suffix: '%', label: 'on your machine, in your folder' },
]
const counts = ref(STATS.map(() => 0))
const statsElement = useTemplateRef<HTMLElement>('stats')
let statsObserver: IntersectionObserver | null = null
onMounted(() => {
  const element = statsElement.value
  if (!element) return
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer.disconnect()
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      counts.value = STATS.map((stat) => stat.value)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 1400)
      const eased = 1 - (1 - progress) ** 3
      counts.value = STATS.map((stat) => Math.round(stat.value * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  observer.observe(element)
  statsObserver = observer
})
onBeforeUnmount(() => statsObserver?.disconnect())

const CAPABILITIES = [
  { icon: 'i-lucide-link', label: 'Wiki links' },
  { icon: 'i-lucide-table', label: 'Tables' },
  { icon: 'i-lucide-workflow', label: 'Mermaid diagrams' },
  { icon: 'i-lucide-message-square-quote', label: 'Callouts' },
  { icon: 'i-lucide-list-checks', label: 'Tasks' },
  { icon: 'i-lucide-chevrons-down-up', label: 'Collapsible sections' },
  { icon: 'i-lucide-code-xml', label: 'Code blocks' },
  { icon: 'i-lucide-image', label: 'Resizable images' },
  { icon: 'i-lucide-paperclip', label: 'Attachments' },
  { icon: 'i-lucide-tags', label: 'Tags' },
  { icon: 'i-lucide-smile', label: 'Page icons' },
  { icon: 'i-lucide-history', label: 'History' },
  { icon: 'i-lucide-pen-line', label: 'Line authorship' },
  { icon: 'i-lucide-search', label: 'Full-text search' },
  { icon: 'i-lucide-replace', label: 'Find and replace' },
  { icon: 'i-lucide-trash-2', label: 'Trash with undo' },
  { icon: 'i-lucide-keyboard', label: 'VS Code shortcuts' },
  { icon: 'i-lucide-moon', label: 'Dark mode' },
  { icon: 'i-lucide-bot', label: 'MCP server' },
  { icon: 'i-lucide-terminal', label: 'CLI' },
  { icon: 'i-lucide-folder-sync', label: 'Any notes folder' },
  { icon: 'i-lucide-download', label: 'Installable app' },
]

const AUTHORSHIP = [
  { author: 'you', width: '92%' },
  { author: 'you', width: '78%' },
  { author: 'claude', width: '85%' },
  { author: 'claude', width: '64%' },
  { author: 'you', width: '70%' },
  { author: 'external', width: '48%' },
] as const
// The app's own author colors (utils/authorship.ts).
const AUTHOR_COLORS = {
  you: authorColor('owner'),
  claude: authorColor('claude'),
  external: authorColor('external'),
}

const VERSIONS = [
  { who: 'You', when: '2 min ago', color: AUTHOR_COLORS.you },
  { who: 'Claude', when: '1 h ago', color: AUTHOR_COLORS.claude },
  { who: 'Edited in Obsidian', when: 'Yesterday', color: AUTHOR_COLORS.external },
  { who: 'You', when: 'Monday', color: AUTHOR_COLORS.you },
]

const SHORTCUTS = [
  { keys: ['meta', 'shift', 'F'], label: 'Search all notes' },
  { keys: ['meta', 'F'], label: 'Find and replace' },
  { keys: ['alt', 'arrowup'], label: 'Move a block' },
  { keys: ['meta', 'D'], label: 'Next occurrence' },
  { keys: ['meta', 'backspace'], label: 'Move to the trash' },
  { keys: ['meta', '/'], label: 'Every shortcut' },
]

const ATTACHMENTS = [
  { name: 'budget.xlsx', icon: 'i-lucide-file-spreadsheet', color: 'text-emerald-500' },
  { name: 'brief.pdf', icon: 'i-lucide-file-text', color: 'text-rose-500' },
  { name: 'mockup.png', icon: 'i-lucide-file-image', color: 'text-sky-500' },
]

const FOLDER: { name: string; icon: string; depth: number; active?: boolean }[] = [
  { name: 'Projects.md', icon: 'i-lucide-file-text', depth: 0 },
  { name: 'Projects', icon: 'i-lucide-folder', depth: 0 },
  { name: 'Launch plan.md', icon: 'i-lucide-file-text', depth: 1, active: true },
  { name: 'Launch plan.assets', icon: 'i-lucide-folder', depth: 1 },
  { name: 'budget.xlsx', icon: 'i-lucide-file-spreadsheet', depth: 2 },
  { name: 'Reading list.md', icon: 'i-lucide-file-text', depth: 0 },
]

const AGENT_POINTS = [
  { icon: 'i-lucide-plug', text: 'An MCP server: search, read, write, move, tag and attach' },
  { icon: 'i-lucide-terminal', text: 'A CLI for scripts and terminals, with JSON output' },
  { icon: 'i-lucide-pen-line', text: 'Small edits keep your lines yours, line by line' },
  { icon: 'i-lucide-shield-check', text: 'No public API: it all stays on your machine' },
]
</script>

<template>
  <div class="landing-root min-h-screen overflow-x-clip bg-default text-default">
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
        <NuxtLink to="/" class="flex items-center gap-2.5" aria-label="Tandem">
          <!-- eslint-disable-next-line vue/no-v-html -- our own static drawing -->
          <span
            class="size-8 overflow-hidden rounded-lg shadow-sm [&_svg]:size-full"
            v-html="headerLogo"
          />
          <span class="text-base font-semibold tracking-tight text-highlighted">tandem</span>
        </NuxtLink>
        <div class="hidden items-center gap-6 text-sm text-muted md:flex">
          <a href="#features" class="transition-colors hover:text-highlighted">Features</a>
          <a href="#agents" class="transition-colors hover:text-highlighted">Agents</a>
          <a href="#files" class="transition-colors hover:text-highlighted">Your files</a>
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
          <UButton to="#install" label="Install" trailing-icon="i-lucide-arrow-down" />
        </div>
      </nav>
    </header>

    <!-- Hero -->
    <section
      class="relative isolate px-4 pt-32 pb-20 sm:px-6 sm:pt-40"
      @pointermove="onHeroMove"
      @pointerleave="resetTilt"
    >
      <div class="landing-aurora" aria-hidden="true">
        <span class="landing-blob landing-blob-1" />
        <span class="landing-blob landing-blob-2" />
        <span class="landing-blob landing-blob-3" />
        <div class="landing-grid" />
      </div>

      <div class="mx-auto max-w-4xl text-center">
        <div class="landing-rise" style="--delay: 0ms">
          <span
            class="inline-flex items-center gap-2 rounded-full border border-default bg-default/70 px-3 py-1 text-xs font-medium text-muted shadow-sm backdrop-blur"
          >
            <span class="relative flex size-2">
              <span
                class="absolute inline-flex size-full animate-ping rounded-full bg-primary/60"
              />
              <span class="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Local-first · Markdown · Agent-ready
          </span>
        </div>
        <h1
          class="landing-rise mt-6 text-5xl font-bold tracking-tight text-balance text-highlighted sm:text-7xl"
          style="--delay: 90ms"
        >
          Notes you write <br class="hidden sm:block" />
          <span class="landing-gradient-text">with your agents.</span>
        </h1>
        <p
          class="landing-rise mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted sm:text-xl"
          style="--delay: 180ms"
        >
          A beautiful editor for Markdown files you own, with instant search and full history. And a
          CLI and an MCP server, so Claude can write alongside you — every line remembers who wrote
          it.
        </p>
        <!-- The website's call to action: installing (#install, from the header too). -->
        <LandingInstallCommand
          id="install"
          class="landing-rise mt-9 scroll-mt-28"
          style="--delay: 270ms"
        />
        <div
          class="landing-rise mt-8 flex flex-wrap items-center justify-center gap-3"
          style="--delay: 360ms"
        >
          <UButton
            to="#features"
            size="xl"
            label="See what's inside"
            trailing-icon="i-lucide-arrow-down"
            class="landing-cta-button"
          />
          <UButton
            :to="GITHUB"
            target="_blank"
            size="xl"
            color="neutral"
            variant="outline"
            icon="i-lucide-github"
            label="View on GitHub"
            class="bg-default/60 backdrop-blur"
          />
        </div>
        <ul
          class="landing-rise mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted"
          style="--delay: 450ms"
        >
          <li
            v-for="point in ['Plain .md files', 'Syncs with any folder', 'One app, no Docker']"
            :key="point"
            class="flex items-center gap-1.5"
          >
            <UIcon name="i-lucide-check" class="size-4 text-primary" /> {{ point }}
          </li>
        </ul>
      </div>

      <!-- The live note -->
      <div class="landing-window-in relative mx-auto mt-16 max-w-5xl" style="--delay: 510ms">
        <div class="landing-window-glow" aria-hidden="true" />
        <div
          class="landing-tilt relative"
          :style="{ transform: `perspective(1600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }"
        >
          <LandingEditorDemo />
        </div>

        <!-- Floating cards -->
        <div
          class="landing-float absolute top-20 -left-36 hidden w-52 rounded-xl border border-default bg-default/90 p-3 shadow-xl backdrop-blur lg:block"
          style="--float-delay: 0s"
          aria-hidden="true"
        >
          <p class="flex items-center gap-1.5 text-xs font-semibold text-highlighted">
            <UIcon name="i-lucide-history" class="size-3.5 text-primary" /> History
          </p>
          <div class="mt-2 space-y-1.5">
            <div
              v-for="version in VERSIONS.slice(0, 3)"
              :key="version.who + version.when"
              class="flex items-center gap-2 text-[11px]"
            >
              <span class="size-2 rounded-full" :style="{ background: version.color }" />
              <span class="truncate text-default">{{ version.who }}</span>
              <span class="ms-auto shrink-0 text-dimmed">{{ version.when }}</span>
            </div>
          </div>
        </div>
        <div
          class="landing-float absolute -right-20 bottom-16 hidden rounded-xl border border-default bg-default/90 px-3 py-2.5 shadow-xl backdrop-blur lg:block"
          style="--float-delay: -3s"
          aria-hidden="true"
        >
          <p class="flex items-center gap-2 text-xs font-medium text-highlighted">
            <span class="relative flex size-2">
              <span
                class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70"
              />
              <span class="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Claude is editing via MCP
          </p>
        </div>
      </div>
    </section>

    <!-- Capabilities -->
    <section class="border-y border-default bg-muted/40 py-6" aria-label="Capabilities">
      <UMarquee pause-on-hover>
        <span
          v-for="item in CAPABILITIES"
          :key="item.label"
          class="flex items-center gap-2 rounded-full border border-default bg-default px-4 py-2 text-sm whitespace-nowrap text-default shadow-xs"
        >
          <UIcon :name="item.icon" class="size-4 text-primary" /> {{ item.label }}
        </span>
      </UMarquee>
    </section>

    <!-- Numbers -->
    <section
      ref="stats"
      class="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-20 sm:px-6 lg:grid-cols-4"
    >
      <div
        v-for="(stat, index) in STATS"
        :key="stat.label"
        v-reveal="index * 90"
        class="text-center"
      >
        <p class="text-4xl font-bold tracking-tight text-highlighted tabular-nums sm:text-5xl">
          {{ stat.prefix }}{{ counts[index] }}{{ stat.suffix }}
        </p>
        <p class="mx-auto mt-2 max-w-48 text-sm text-muted">{{ stat.label }}</p>
      </div>
    </section>

    <!-- Features -->
    <section id="features" class="mx-auto max-w-6xl scroll-mt-20 px-4 pb-28 sm:px-6">
      <div v-reveal class="mx-auto max-w-2xl text-center">
        <p class="text-sm font-semibold text-primary">Features</p>
        <h2
          class="mt-2 text-3xl font-bold tracking-tight text-balance text-highlighted sm:text-5xl"
        >
          Everything a notes app should do. Nothing it shouldn't.
        </h2>
        <p class="mt-4 text-lg text-muted">
          Fast, quiet and keyboard-friendly. Designed to feel at home on your Mac.
        </p>
      </div>

      <div class="mt-14 grid gap-4 lg:grid-cols-6">
        <!-- Authorship -->
        <article v-reveal class="landing-card lg:col-span-4" @pointermove="spotlight">
          <div class="grid gap-6 sm:grid-cols-2">
            <div>
              <UIcon name="i-lucide-pen-line" class="landing-card-icon" />
              <h3 class="landing-card-title">Every line knows who wrote it</h3>
              <p class="landing-card-text">
                Line-level authorship tells your words from your agents' and from edits made in
                other apps. Turn it on in any note to see who wrote what.
              </p>
              <div class="mt-5 flex flex-wrap gap-2 text-xs">
                <span
                  v-for="[label, color] in [
                    ['You', AUTHOR_COLORS.you],
                    ['Claude', AUTHOR_COLORS.claude],
                    ['Another app', AUTHOR_COLORS.external],
                  ]"
                  :key="label"
                  class="flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-default"
                >
                  <span class="size-2 rounded-full" :style="{ background: color }" /> {{ label }}
                </span>
              </div>
            </div>
            <div
              class="landing-authorship space-y-3 self-center rounded-xl border border-default bg-default p-5"
              aria-hidden="true"
            >
              <div v-for="(line, index) in AUTHORSHIP" :key="index" class="flex items-center gap-3">
                <span
                  class="h-5 w-1 rounded-full"
                  :style="{ background: AUTHOR_COLORS[line.author] }"
                />
                <span
                  class="landing-bar h-2.5 rounded-full bg-accented"
                  :style="{ '--bar-width': line.width, '--bar-delay': `${index * 120}ms` }"
                />
              </div>
            </div>
          </div>
        </article>

        <!-- History -->
        <article v-reveal="90" class="landing-card lg:col-span-2" @pointermove="spotlight">
          <UIcon name="i-lucide-history" class="landing-card-icon" />
          <h3 class="landing-card-title">History you can trust</h3>
          <p class="landing-card-text">
            A version per editing session and per author. Compare, restore, relax.
          </p>
          <ol class="landing-timeline mt-5 space-y-3" aria-hidden="true">
            <li
              v-for="(version, index) in VERSIONS"
              :key="index"
              class="flex items-center gap-3 text-sm"
              :style="{ '--item-delay': `${index * 110}ms` }"
            >
              <span
                class="size-2.5 rounded-full ring-4 ring-(--ui-bg)"
                :style="{ background: version.color }"
              />
              <span class="text-default">{{ version.who }}</span>
              <span class="ms-auto text-xs text-dimmed">{{ version.when }}</span>
            </li>
          </ol>
        </article>

        <!-- Search -->
        <article v-reveal class="landing-card lg:col-span-3" @pointermove="spotlight">
          <UIcon name="i-lucide-search" class="landing-card-icon" />
          <h3 class="landing-card-title">Search that forgives</h3>
          <p class="landing-card-text">
            Results as you type, accents ignored, typos corrected — in titles, text and attachment
            names. Filter with <code class="landing-code">tag:</code> and
            <code class="landing-code">in:</code>.
          </p>
          <div class="mt-6"><LandingSearchDemo /></div>
        </article>

        <!-- Markdown -->
        <article v-reveal="90" class="landing-card lg:col-span-3" @pointermove="spotlight">
          <UIcon name="i-lucide-file-code-2" class="landing-card-icon" />
          <h3 class="landing-card-title">Rich editing, plain Markdown</h3>
          <p class="landing-card-text">
            Tables, callouts, tasks, diagrams and collapsible sections in a polished editor. On
            disk, it's Markdown any app can read.
          </p>
          <div class="landing-flip relative mt-6 h-52" aria-hidden="true">
            <div
              class="landing-flip-face landing-flip-front rounded-xl border border-default bg-default p-4 text-sm"
            >
              <div class="flex gap-2 rounded-lg border-s-4 border-primary bg-primary/10 px-3 py-2">
                <UIcon name="i-lucide-lightbulb" class="mt-0.5 size-4 shrink-0 text-primary" />
                <span class="text-default">Keep the beta small: ten teams.</span>
              </div>
              <div class="mt-3 space-y-1.5">
                <p class="flex items-center gap-2">
                  <span class="grid size-4 place-items-center rounded bg-primary text-inverted"
                    ><UIcon name="i-lucide-check" class="size-3" /></span
                  ><span class="text-muted line-through">Onboarding flow</span>
                </p>
                <p class="flex items-center gap-2">
                  <span class="size-4 rounded border border-accented" />Announcement post
                </p>
              </div>
              <table class="mt-3 w-full text-xs">
                <tbody>
                  <tr class="border-b border-default">
                    <td class="py-1 font-medium text-highlighted">Team</td>
                    <td class="text-highlighted">Seats</td>
                  </tr>
                  <tr>
                    <td class="py-1 text-muted">Design</td>
                    <td class="text-muted">4</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <pre
              class="landing-flip-face landing-flip-back overflow-hidden rounded-xl border border-white/10 bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-300"
            ><span class="text-sky-300">> [!TIP]</span>
<span class="text-sky-300">></span> Keep the beta small: ten teams.

<span class="text-amber-300">- [x]</span> <span class="text-zinc-500">Onboarding flow</span>
<span class="text-amber-300">- [ ]</span> Announcement post

<span class="text-emerald-300">| Team   | Seats |</span>
<span class="text-emerald-300">|--------|-------|</span>
<span class="text-emerald-300">| Design | 4     |</span></pre>
          </div>
        </article>

        <!-- Autosave -->
        <article v-reveal class="landing-card lg:col-span-2" @pointermove="spotlight">
          <div
            class="landing-rings relative mb-4 grid size-14 place-items-center"
            aria-hidden="true"
          >
            <span class="absolute inset-0 rounded-full bg-primary/15" />
            <span class="absolute inset-0 rounded-full bg-primary/15" />
            <UIcon name="i-lucide-cloud-check" class="relative size-7 text-primary" />
          </div>
          <h3 class="landing-card-title">Autosave, always</h3>
          <p class="landing-card-text">
            No save button. Edits land on disk as you type, and conflicts with other apps are
            caught, never lost.
          </p>
        </article>

        <!-- Attachments -->
        <article v-reveal="90" class="landing-card lg:col-span-2" @pointermove="spotlight">
          <UIcon name="i-lucide-paperclip" class="landing-card-icon" />
          <h3 class="landing-card-title">Files, right where they belong</h3>
          <p class="landing-card-text">
            Drop a file anywhere: it's copied next to the note and shown in place.
          </p>
          <div class="mt-5 flex flex-wrap gap-2" aria-hidden="true">
            <span
              v-for="(file, index) in ATTACHMENTS"
              :key="file.name"
              class="landing-chip flex items-center gap-1.5 rounded-md border border-default bg-elevated/60 px-2 py-1 text-xs text-default"
              :style="{ '--chip-delay': `${index * 0.6}s` }"
            >
              <UIcon :name="file.icon" class="size-4" :class="file.color" /> {{ file.name }}
            </span>
          </div>
        </article>

        <!-- Themes -->
        <article v-reveal="180" class="landing-card lg:col-span-2" @pointermove="spotlight">
          <UIcon name="i-lucide-palette" class="landing-card-icon" />
          <h3 class="landing-card-title">Make it yours</h3>
          <p class="landing-card-text">
            Accent color, paper tones, fonts, width and text size. Light, dark or system.
          </p>
          <div class="mt-5 flex items-center gap-2" aria-hidden="true">
            <span
              v-for="(color, index) in ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#0ea5e9']"
              :key="color"
              class="landing-swatch size-7 rounded-full ring-2 ring-(--ui-bg)"
              :style="{ background: color, '--swatch-delay': `${index * 0.5}s` }"
            />
            <span class="ms-auto flex gap-1 rounded-full bg-elevated p-1">
              <UIcon name="i-lucide-sun" class="size-4 text-muted" />
              <UIcon name="i-lucide-moon" class="size-4 text-muted" />
            </span>
          </div>
        </article>
      </div>
    </section>

    <!-- Agents -->
    <section
      id="agents"
      class="landing-dark relative isolate scroll-mt-16 overflow-hidden bg-zinc-950 py-28 text-zinc-300"
    >
      <div class="landing-dark-glow" aria-hidden="true" />
      <div class="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div v-reveal>
          <p class="text-sm font-semibold text-(--ui-color-primary-400)">For agents</p>
          <h2 class="mt-2 text-3xl font-bold tracking-tight text-balance text-white sm:text-5xl">
            Give your agents a pen, not just a peek.
          </h2>
          <p class="mt-5 text-lg text-zinc-400">
            Claude and other agents read, search and write your notes through tools made for them —
            and every change is theirs in the history, line by line.
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
        <div v-reveal="150"><LandingTerminalDemo /></div>
      </div>
    </section>

    <!-- Files -->
    <section id="files" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-28 sm:px-6">
      <div class="grid items-center gap-14 lg:grid-cols-2">
        <div v-reveal class="relative order-2 lg:order-1" aria-hidden="true">
          <div class="grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
            <div class="rounded-2xl border border-default bg-muted/50 p-4 text-sm shadow-sm">
              <p class="mb-3 flex items-center gap-2 text-xs font-medium text-muted">
                <UIcon name="i-lucide-cloud" class="size-4" /> OneDrive / Notes
              </p>
              <div
                v-for="(file, index) in FOLDER"
                :key="file.name + index"
                v-reveal="index * 70"
                class="flex items-center gap-2 rounded-md px-2 py-1"
                :class="file.active ? 'bg-primary/10 font-medium text-primary' : 'text-default'"
                :style="{ paddingInlineStart: `${0.5 + file.depth}rem` }"
              >
                <UIcon
                  :name="file.icon"
                  class="size-4 shrink-0"
                  :class="file.active ? 'text-primary' : 'text-dimmed'"
                />
                <span class="truncate">{{ file.name }}</span>
              </div>
            </div>
            <pre
              class="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-300 shadow-xl"
            ><span class="text-zinc-500">Launch plan.md</span>

<span class="font-bold text-white"># Launch plan</span>

Ship the beta to ten friendly
teams by the end of the month.

<span class="font-bold text-white">### Next steps</span>

<span class="text-amber-300">- [x]</span> Finish the onboarding flow
<span class="text-amber-300">- [ ]</span> Draft the announcement
<span class="text-amber-300">- [ ]</span> Summarize <span class="text-(--ui-color-primary-300)">[[User interviews]]</span></pre>
          </div>
        </div>
        <div v-reveal="120" class="order-1 lg:order-2">
          <p class="text-sm font-semibold text-primary">Your files</p>
          <h2
            class="mt-2 text-3xl font-bold tracking-tight text-balance text-highlighted sm:text-5xl"
          >
            Your notes are just files.
          </h2>
          <p class="mt-5 text-lg text-muted">
            Every page is a Markdown file in a folder you choose — OneDrive, iCloud, a Git
            repository. Edit them in any app: Tandem notices, and keeps the history.
          </p>
          <p class="mt-4 text-lg text-muted">
            Switch folders anytime from Settings, iCloud Drive and OneDrive included: each one keeps
            its own tags, history and authorship, backed up inside it. Leave anytime with
            everything.
          </p>
        </div>
      </div>
    </section>

    <!-- Shortcuts -->
    <section class="border-y border-default bg-muted/40 py-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div v-reveal class="mx-auto max-w-2xl text-center">
          <p class="text-sm font-semibold text-primary">Keyboard</p>
          <h2 class="mt-2 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
            As fast as your code editor.
          </h2>
          <p class="mt-4 text-lg text-muted">
            The VS Code shortcuts you already know, in your notes.
          </p>
        </div>
        <div class="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div
            v-for="(shortcut, index) in SHORTCUTS"
            :key="shortcut.label"
            v-reveal="index * 70"
            class="landing-shortcut flex flex-col items-center gap-3 rounded-xl border border-default bg-default p-5 text-center"
            :style="{ '--press-delay': `${index * 1}s` }"
          >
            <span class="landing-keys flex gap-1">
              <UKbd v-for="key in shortcut.keys" :key="key" :value="key" size="lg" />
            </span>
            <span class="text-sm text-muted">{{ shortcut.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Call to action -->
    <section class="relative isolate overflow-hidden px-4 py-32 text-center sm:px-6">
      <div class="landing-cta-glow" aria-hidden="true" />
      <div v-reveal class="mx-auto max-w-4xl">
        <div class="landing-cta-logo relative mx-auto size-24">
          <span class="landing-cta-ring" aria-hidden="true" />
          <!-- eslint-disable-next-line vue/no-v-html -- our own static drawing -->
          <span
            class="relative block size-24 overflow-hidden rounded-3xl shadow-2xl [&_svg]:size-full"
            v-html="ctaLogo"
          />
        </div>
        <h2
          class="mt-10 text-4xl font-bold tracking-tight text-balance text-highlighted sm:text-6xl"
        >
          Start writing.
        </h2>
        <p class="mt-4 text-lg text-muted">Your notes are waiting, and so are your agents.</p>
        <LandingInstallCommand class="mt-9" />
      </div>
    </section>

    <footer class="border-t border-default">
      <div
        class="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-muted sm:px-6"
      >
        <span class="font-semibold text-highlighted">tandem</span>
        <span>Notes for one person and their agents.</span>
        <div class="ms-auto flex items-center gap-5">
          <a href="#install" class="hover:text-highlighted">Install</a>
          <a :href="`${GITHUB}/releases`" target="_blank" class="hover:text-highlighted"
            >Releases</a
          >
          <a :href="GITHUB" target="_blank" class="flex items-center gap-1.5 hover:text-highlighted"
            ><UIcon name="i-lucide-github" class="size-4" /> GitHub</a
          >
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
/* The landing page's motion. Classes are prefixed (this style is global once loaded). */
html:has(.landing-root) {
  scroll-behavior: smooth;
}

/* Scroll reveals (v-reveal) */
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

/* Hero entrance */
.landing-rise {
  animation: landing-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--delay);
}
@keyframes landing-rise {
  from {
    opacity: 0;
    transform: translateY(18px);
    filter: blur(6px);
  }
}
.landing-window-in {
  animation: landing-window-in 1.3s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--delay);
}
@keyframes landing-window-in {
  from {
    opacity: 0;
    transform: perspective(1600px) translateY(60px) rotateX(16deg) scale(0.96);
  }
}
.landing-tilt {
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  transform-style: preserve-3d;
}
.landing-window {
  box-shadow:
    0 1px 0 0 color-mix(in oklab, white 40%, transparent) inset,
    0 30px 80px -20px color-mix(in oklab, var(--ui-color-primary-700) 35%, transparent),
    0 12px 30px -10px rgb(0 0 0 / 0.2);
}
.landing-window-glow {
  position: absolute;
  inset: 8% 6% -6%;
  border-radius: 2rem;
  background: linear-gradient(
    120deg,
    var(--ui-color-primary-400),
    #f59e0b55,
    var(--ui-color-primary-600)
  );
  filter: blur(60px);
  opacity: 0.45;
  animation: landing-breathe 8s ease-in-out infinite;
}
@keyframes landing-breathe {
  50% {
    opacity: 0.25;
    transform: scale(0.97);
  }
}
.landing-line {
  animation: landing-line-in 0.35s ease-out both;
}
@keyframes landing-line-in {
  from {
    opacity: 0;
    transform: translateX(-6px);
  }
}
.landing-pop {
  animation: landing-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes landing-pop {
  from {
    transform: scale(0);
  }
}
.landing-float {
  animation: landing-float 7s ease-in-out infinite;
  animation-delay: var(--float-delay);
}
@keyframes landing-float {
  50% {
    transform: translateY(-12px);
  }
}

/* Aurora behind the hero */
.landing-aurora {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.landing-blob {
  position: absolute;
  border-radius: 9999px;
  filter: blur(90px);
  opacity: 0.45;
}
.dark .landing-blob {
  opacity: 0.28;
}
.landing-blob-1 {
  width: 40rem;
  height: 40rem;
  top: -16rem;
  left: 4%;
  background: var(--ui-color-primary-400);
  animation: landing-drift-1 22s ease-in-out infinite alternate;
}
.landing-blob-2 {
  width: 30rem;
  height: 30rem;
  top: -4rem;
  right: 2%;
  background: #fcd34d;
  opacity: 0.35;
  animation: landing-drift-2 26s ease-in-out infinite alternate;
}
.landing-blob-3 {
  width: 34rem;
  height: 34rem;
  top: 16rem;
  left: 38%;
  background: var(--ui-color-primary-600);
  opacity: 0.3;
  animation: landing-drift-3 30s ease-in-out infinite alternate;
}
@keyframes landing-drift-1 {
  to {
    transform: translate(18rem, 6rem) scale(1.15);
  }
}
@keyframes landing-drift-2 {
  to {
    transform: translate(-16rem, 10rem) scale(0.85);
  }
}
@keyframes landing-drift-3 {
  to {
    transform: translate(-14rem, -8rem) scale(1.2);
  }
}
.landing-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--ui-border) 1px, transparent 1px),
    linear-gradient(to bottom, var(--ui-border) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 70% 55% at 50% 25%, black 20%, transparent 75%);
  opacity: 0.7;
}
.dark .landing-grid {
  opacity: 0.35;
}
.dark .landing-blob-2 {
  opacity: 0.12;
}

/* Gradient headline */
.landing-gradient-text {
  background: linear-gradient(
    100deg,
    var(--ui-color-primary-600),
    #f59e0b,
    var(--ui-color-primary-500),
    var(--ui-color-primary-700)
  );
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: landing-shimmer 9s ease-in-out infinite alternate;
}
.dark .landing-gradient-text {
  background-image: linear-gradient(
    100deg,
    var(--ui-color-primary-300),
    #fcd34d,
    var(--ui-color-primary-400),
    var(--ui-color-primary-200)
  );
}
@keyframes landing-shimmer {
  to {
    background-position: 100% 50%;
  }
}
.landing-cta-button {
  box-shadow: 0 10px 30px -8px color-mix(in oklab, var(--ui-primary) 60%, transparent);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}
.landing-cta-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 40px -8px color-mix(in oklab, var(--ui-primary) 70%, transparent);
}

/* Feature cards */
.landing-card {
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
.landing-card::before {
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
.landing-card:hover {
  border-color: color-mix(in oklab, var(--ui-primary) 40%, var(--ui-border));
}
.landing-card:hover::before {
  opacity: 1;
}
.landing-card > * {
  position: relative;
}
.landing-card-icon {
  width: 1.75rem;
  height: 1.75rem;
  margin-bottom: 1rem;
  color: var(--ui-primary);
}
.landing-card-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}
.landing-card-text {
  margin-top: 0.5rem;
  color: var(--ui-text-muted);
}
.landing-code {
  border-radius: 0.25rem;
  background: var(--ui-bg-elevated);
  padding: 0.05rem 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: var(--ui-text-highlighted);
}

/* Authorship bars grow in when shown */
.landing-bar {
  width: 0;
  transition: width 1.1s cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(var(--bar-delay) + 250ms);
}
.reveal-visible .landing-bar {
  width: var(--bar-width);
}

/* History timeline */
.landing-timeline li {
  opacity: 0;
  transform: translateX(-10px);
  transition:
    opacity 0.6s,
    transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(var(--item-delay) + 300ms);
}
.reveal-visible .landing-timeline li {
  opacity: 1;
  transform: none;
}

/* Rendered note / its Markdown, in turn */
.landing-flip {
  perspective: 1200px;
}
.landing-flip-face {
  position: absolute;
  inset: 0;
  margin: 0;
  backface-visibility: hidden;
  animation: landing-flip 9s ease-in-out infinite;
}
.landing-flip-back {
  animation-name: landing-flip-back;
}
@keyframes landing-flip {
  0%,
  40% {
    transform: rotateY(0);
  }
  50%,
  90% {
    transform: rotateY(180deg);
  }
  100% {
    transform: rotateY(360deg);
  }
}
@keyframes landing-flip-back {
  0%,
  40% {
    transform: rotateY(-180deg);
  }
  50%,
  90% {
    transform: rotateY(0);
  }
  100% {
    transform: rotateY(180deg);
  }
}

/* Autosave rings */
.landing-rings > span {
  animation: landing-ring 2.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.landing-rings > span:nth-child(2) {
  animation-delay: 1.4s;
}
@keyframes landing-ring {
  from {
    transform: scale(0.8);
    opacity: 1;
  }
  to {
    transform: scale(1.8);
    opacity: 0;
  }
}

/* Attachment chips bob; color swatches take turns */
.landing-chip {
  animation: landing-float 4.5s ease-in-out infinite;
  animation-delay: var(--chip-delay);
}
.landing-swatch {
  animation: landing-swatch 2.5s ease-in-out infinite;
  animation-delay: var(--swatch-delay);
}
@keyframes landing-swatch {
  0%,
  70%,
  100% {
    transform: none;
  }
  20% {
    transform: translateY(-6px) scale(1.12);
  }
}

/* Dark agents band */
.landing-dark-glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(
      50rem 30rem at 85% 40%,
      color-mix(in oklab, var(--ui-color-primary-500) 30%, transparent),
      transparent 70%
    ),
    radial-gradient(30rem 20rem at 10% 90%, #f59e0b22, transparent 70%);
}
.landing-dark-glow::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgb(255 255 255 / 0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(255 255 255 / 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 60% 70% at 70% 40%, black, transparent 80%);
}
.landing-row {
  animation: landing-line-in 0.25s ease-out both;
}
.landing-terminal {
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.04),
    0 40px 100px -30px color-mix(in oklab, var(--ui-color-primary-500) 50%, transparent);
}

/* Shortcut keys get pressed in turn */
.landing-shortcut .landing-keys {
  animation: landing-press 6s ease-in-out infinite;
  animation-delay: var(--press-delay);
}
@keyframes landing-press {
  0%,
  12%,
  100% {
    transform: none;
    filter: none;
  }
  4% {
    transform: translateY(2px) scale(0.96);
    filter: drop-shadow(0 0 10px color-mix(in oklab, var(--ui-primary) 60%, transparent));
  }
}

/* Final call to action */
.landing-cta-glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: radial-gradient(
    40rem 24rem at 50% 30%,
    color-mix(in oklab, var(--ui-color-primary-400) 30%, transparent),
    transparent 70%
  );
}
.landing-cta-logo {
  animation: landing-float 6s ease-in-out infinite;
}
.landing-cta-ring {
  position: absolute;
  inset: -14px;
  border-radius: 2.2rem;
  background: conic-gradient(
    from 0deg,
    var(--ui-color-primary-300),
    #fcd34d,
    var(--ui-color-primary-600),
    var(--ui-color-primary-300)
  );
  filter: blur(18px);
  opacity: 0.6;
  animation: landing-spin 8s linear infinite;
}
@keyframes landing-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  html:has(.landing-root) {
    scroll-behavior: auto;
  }
  .landing-root *,
  .landing-root *::before,
  .landing-root *::after {
    animation: none !important;
  }
  .reveal,
  .landing-timeline li {
    opacity: 1;
    transform: none;
    transition: none;
  }
  .landing-bar {
    width: var(--bar-width);
    transition: none;
  }
  .landing-flip-back {
    display: none;
  }
  .landing-tilt {
    transform: none !important;
  }
}
</style>
