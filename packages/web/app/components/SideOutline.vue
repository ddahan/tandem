<script setup lang="ts">
import type { Heading } from '~/components/NoteEditor.vue'

const props = defineProps<{ headings: Heading[] }>()
defineEmits<{ go: [pos: number] }>()

const minLevel = computed(() => Math.min(...props.headings.map((h) => h.level), 6))
</script>

<template>
  <nav v-if="headings.length" aria-label="Outline">
    <button
      v-for="heading in headings"
      :key="heading.pos"
      type="button"
      class="block w-full truncate rounded-md py-1 pe-2 text-start text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted"
      :style="{ paddingInlineStart: `${0.5 + (heading.level - minLevel) * 0.85}rem` }"
      :class="heading.level === minLevel && 'font-medium text-default'"
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
