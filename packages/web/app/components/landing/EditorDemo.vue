<script setup lang="ts">
// The landing page's hero: a note written live by the owner and an agent, line by line, with
// the authorship gutter, cursors, autosave and a task being checked. Loops (useDemoLoop).
import { OWNER } from '@myfluence/shared'
import { authorColor } from '~/utils/authorship'

type Author = 'you' | 'claude'
interface Part {
  text: string
  link?: boolean
}
interface Line {
  author: Author
  kind: 'p' | 'h3' | 'task'
  parts: Part[]
}

const LINES: Line[] = [
  {
    author: 'you',
    kind: 'p',
    parts: [{ text: 'Ship the beta to ten friendly teams by the end of the month.' }],
  },
  { author: 'you', kind: 'h3', parts: [{ text: 'Next steps' }] },
  { author: 'you', kind: 'task', parts: [{ text: 'Finish the onboarding flow' }] },
  { author: 'claude', kind: 'task', parts: [{ text: 'Draft the announcement post' }] },
  {
    author: 'claude',
    kind: 'task',
    parts: [{ text: 'Summarize the feedback from ' }, { text: 'User interviews', link: true }],
  },
  {
    author: 'you',
    kind: 'p',
    parts: [{ text: 'Budget and hiring in ' }, { text: 'Q4 plan', link: true }, { text: '.' }],
  },
]

const COLORS: Record<Author, string> = {
  you: authorColor(OWNER),
  claude: authorColor('claude'),
}
const NAMES: Record<Author, string> = { you: 'You', claude: 'Claude' }

const lengths = LINES.map((line) => line.parts.reduce((sum, part) => sum + part.text.length, 0))
const typed = ref<number[]>(LINES.map(() => 0))
const active = ref(-1)
const checked = ref(false)
const status = ref<'saved' | 'saving'>('saved')
const fading = ref(false)

/** The visible parts of a line: its text up to what has been typed. */
function visibleParts(index: number): Part[] {
  let left = typed.value[index] ?? 0
  const parts: Part[] = []
  for (const part of LINES[index]!.parts) {
    if (left <= 0) break
    parts.push({ ...part, text: part.text.slice(0, left) })
    left -= part.text.length
  }
  return parts
}

const { reduced } = useDemoLoop(async (wait) => {
  typed.value = LINES.map(() => 0)
  checked.value = false
  fading.value = false
  await wait(700)
  for (const [index, line] of LINES.entries()) {
    active.value = index
    status.value = 'saving'
    // Agents write fast and evenly; people less so.
    for (let char = 1; char <= lengths[index]!; char++) {
      typed.value[index] = char
      await wait(line.author === 'claude' ? 14 : 26 + Math.random() * 45)
    }
    await wait(line.author === 'claude' ? 250 : 450)
    if (index === 2 || index === LINES.length - 1) status.value = 'saved'
  }
  await wait(700)
  status.value = 'saved'
  active.value = -1
  checked.value = true
  await wait(4200)
  fading.value = true
  await wait(700)
})

watch(
  reduced,
  (value) => {
    if (!value) return
    typed.value = [...lengths]
    checked.value = true
  },
  { immediate: true },
)

const tree = [
  { label: 'Projects', icon: 'i-lucide-folder', depth: 0 },
  { label: 'Launch plan', emoji: '🚀', depth: 1, active: true },
  { label: 'Q4 plan', emoji: '📊', depth: 1 },
  { label: 'User interviews', icon: 'i-lucide-file-text', depth: 1 },
  { label: 'Ideas', icon: 'i-lucide-folder', depth: 0 },
  { label: 'Reading list', emoji: '📚', depth: 0 },
  { label: 'Meeting notes', icon: 'i-lucide-file-text', depth: 0 },
]
</script>

<template>
  <div
    class="landing-window overflow-hidden rounded-2xl border border-default bg-default text-left"
  >
    <!-- Title bar -->
    <div class="flex items-center gap-3 border-b border-default bg-muted/60 px-4 py-2.5">
      <div class="flex gap-1.5" aria-hidden="true">
        <span class="size-3 rounded-full bg-[#ff5f57]" />
        <span class="size-3 rounded-full bg-[#febc2e]" />
        <span class="size-3 rounded-full bg-[#28c840]" />
      </div>
      <div class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <span class="truncate">Projects</span>
        <UIcon name="i-lucide-chevron-right" class="size-3 shrink-0" />
        <span class="truncate font-medium text-highlighted">Launch plan</span>
      </div>
      <div class="ms-auto flex items-center gap-2">
        <div class="hidden -space-x-1.5 sm:flex" aria-hidden="true">
          <span
            v-for="author in ['you', 'claude'] as const"
            :key="author"
            class="grid size-6 place-items-center rounded-full text-[10px] font-semibold text-white ring-2 ring-(--ui-bg)"
            :style="{ background: COLORS[author] }"
            >{{ NAMES[author][0] }}</span
          >
        </div>
        <span
          class="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
          :class="status === 'saving' ? 'bg-elevated text-muted' : 'bg-primary/10 text-primary'"
        >
          <UIcon
            :name="status === 'saving' ? 'i-lucide-loader-circle' : 'i-lucide-cloud-check'"
            class="size-3.5"
            :class="status === 'saving' && 'animate-spin'"
          />
          {{ status === 'saving' ? 'Saving…' : 'Saved' }}
        </span>
      </div>
    </div>

    <div class="flex h-[23rem] sm:h-[25rem]">
      <!-- Sidebar -->
      <div
        class="hidden w-48 shrink-0 flex-col gap-0.5 border-e border-default bg-muted/30 p-3 text-xs md:flex"
        aria-hidden="true"
      >
        <div
          class="mb-2 flex items-center gap-2 rounded-md border border-default px-2 py-1.5 text-dimmed"
        >
          <UIcon name="i-lucide-search" class="size-3.5" />
          Search…
          <span class="ms-auto font-mono text-[10px]">⌘⇧F</span>
        </div>
        <div
          v-for="item in tree"
          :key="item.label"
          class="flex items-center gap-1.5 rounded-md px-2 py-1"
          :class="item.active ? 'bg-elevated font-medium text-highlighted' : 'text-muted'"
          :style="{ paddingInlineStart: `${0.5 + item.depth * 0.9}rem` }"
        >
          <span v-if="item.emoji" class="text-[11px] leading-none">{{ item.emoji }}</span>
          <UIcon v-else :name="item.icon!" class="size-3.5 text-dimmed" />
          <span class="truncate">{{ item.label }}</span>
        </div>
      </div>

      <!-- The note -->
      <div
        class="min-w-0 flex-1 px-6 py-6 transition-opacity duration-700 sm:px-10"
        :class="fading && 'opacity-0'"
      >
        <div class="flex items-center gap-3 text-2xl font-bold tracking-tight text-highlighted">
          <span aria-hidden="true">🚀</span> Launch plan
        </div>
        <div class="mt-2 mb-5 flex items-center gap-2 text-[11px] text-muted">
          <UIcon name="i-lucide-calendar" class="size-3" /> 17/10/2026
          <span class="rounded-full bg-elevated px-2 py-0.5">work</span>
          <span class="rounded-full bg-elevated px-2 py-0.5">launch</span>
        </div>

        <div class="space-y-1.5 text-[13px] leading-relaxed sm:text-sm">
          <div
            v-for="(line, index) in LINES"
            v-show="(typed[index] ?? 0) > 0"
            :key="index"
            class="landing-line relative ps-3"
          >
            <!-- Authorship gutter -->
            <span
              class="absolute inset-y-0.5 start-0 w-0.5 rounded-full"
              :style="{ background: COLORS[line.author] }"
            />
            <div
              :class="{
                'pt-2 text-[15px] font-semibold text-highlighted': line.kind === 'h3',
                'flex items-start gap-2': line.kind === 'task',
                'text-default': line.kind === 'p',
              }"
            >
              <span
                v-if="line.kind === 'task'"
                class="mt-[3px] grid size-4 shrink-0 place-items-center rounded border transition-colors duration-300"
                :class="
                  index === 2 && checked
                    ? 'border-primary bg-primary text-inverted'
                    : 'border-accented bg-default'
                "
              >
                <UIcon
                  v-if="index === 2 && checked"
                  name="i-lucide-check"
                  class="landing-pop size-3"
                />
              </span>
              <span
                :class="
                  line.kind === 'task' &&
                  index === 2 &&
                  checked &&
                  'text-muted line-through decoration-(--ui-text-dimmed)'
                "
              >
                <template v-for="(part, partIndex) in visibleParts(index)" :key="partIndex">
                  <span
                    v-if="part.link"
                    class="rounded-sm bg-primary/10 px-0.5 font-medium text-primary"
                    >{{ part.text }}</span
                  >
                  <template v-else>{{ part.text }}</template>
                </template>
                <!-- The writer's cursor, with their name -->
                <span
                  v-if="active === index"
                  class="relative ms-px inline-block h-[1.1em] w-0.5 translate-y-[0.2em]"
                >
                  <span
                    class="absolute inset-0 animate-pulse"
                    :style="{ background: COLORS[line.author] }"
                  />
                  <span
                    class="absolute -top-5 left-0 rounded-sm px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-white"
                    :style="{ background: COLORS[line.author] }"
                    >{{ NAMES[line.author] }}</span
                  >
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
