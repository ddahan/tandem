<script setup lang="ts">
// The note's headings. The one the reader is in is highlighted, with an indicator sliding along
// the line on the left (as in Nuxt UI's ContentToc, which needs Nuxt Content and anchors).
import { useResizeObserver } from '@vueuse/core'
import type { Heading } from '~/components/NoteEditor.vue'
import { scrollParent } from '~/utils/current-heading'

const props = defineProps<{
  headings: Heading[]
  /** Index of the heading the reader is in (-1: none). */
  active: number
}>()
defineEmits<{ go: [pos: number] }>()

const minLevel = computed(() => Math.min(...props.headings.map((h) => h.level), 6))

const list = useTemplateRef<HTMLElement>('list')
const indicator = ref<{ top: number; height: number } | null>(null)

function activeItem() {
  return props.active < 0 ? null : (list.value?.querySelectorAll('button')[props.active] ?? null)
}

function placeIndicator() {
  const item = activeItem()
  indicator.value = item ? { top: item.offsetTop, height: item.offsetHeight } : null
}

watch(
  () => [props.active, props.headings],
  () => nextTick(placeIndicator),
  { immediate: true },
)
useResizeObserver(list, placeIndicator)

// Keeps the highlighted heading in sight in a long outline. By hand: a smooth scrollIntoView
// would stop the note's own smooth scroll (Chromium runs one at a time).
watch(
  () => props.active,
  () =>
    nextTick(() => {
      const item = activeItem()
      const panel = item && scrollParent(item)
      if (!item || !panel) return
      const box = panel.getBoundingClientRect()
      const rect = item.getBoundingClientRect()
      if (rect.top < box.top) panel.scrollTop -= box.top - rect.top
      else if (rect.bottom > box.bottom) panel.scrollTop += rect.bottom - box.bottom
    }),
)

function itemClass(heading: Heading, index: number) {
  const top = heading.level === minLevel.value
  if (index === props.active) return ['text-primary', top && 'font-medium']
  return top
    ? 'font-medium text-default hover:text-highlighted'
    : 'text-muted hover:text-highlighted'
}
</script>

<template>
  <nav
    v-if="headings.length"
    ref="list"
    aria-label="Outline"
    class="relative ms-1 border-s border-default"
  >
    <div
      v-if="indicator"
      class="absolute -start-px top-0 w-0.5 rounded-full bg-primary transition-[translate,height] duration-200 ease-out motion-reduce:transition-none"
      :style="{ height: `${indicator.height}px`, translate: `0 ${indicator.top}px` }"
      data-testid="outline-indicator"
    />
    <button
      v-for="(heading, index) in headings"
      :key="heading.pos"
      type="button"
      class="block w-full truncate rounded-md py-1 pe-2 text-start text-sm transition-colors hover:bg-elevated"
      :style="{ paddingInlineStart: `${0.75 + (heading.level - minLevel) * 0.85}rem` }"
      :class="itemClass(heading, index)"
      :aria-current="index === active ? 'location' : undefined"
      @click="$emit('go', heading.pos)"
    >
      {{ heading.text || 'Untitled heading' }}
    </button>
  </nav>
  <UEmpty
    v-else
    icon="i-lucide-list-tree"
    title="No headings"
    description="Headings of the note appear here."
    size="sm"
    variant="naked"
  />
</template>
