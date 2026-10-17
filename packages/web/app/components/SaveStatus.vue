<script setup lang="ts">
import { formatRelative } from '@myfluence/shared'
import { useIntervalFn } from '@vueuse/core'
import type { SaveStatus } from '~/composables/useNoteDocument'

const props = defineProps<{ status: SaveStatus; savedAt: number | null }>()
// Refreshes "Saved 2 min ago".
const now = ref(Date.now())
useIntervalFn(() => (now.value = Date.now()), 30_000)

const display = computed(() => {
  switch (props.status) {
    case 'pending':
    case 'saving':
      return { icon: 'i-lucide-loader-circle', text: 'Saving…', class: 'text-muted', spin: true }
    case 'saved':
      return {
        icon: 'i-lucide-cloud-check',
        text: props.savedAt ? `Saved ${formatRelative(props.savedAt, now.value)}` : 'Saved',
        class: 'text-dimmed',
        spin: false,
      }
    case 'error':
      return {
        icon: 'i-lucide-cloud-alert',
        text: 'Not saved, retrying…',
        class: 'text-error',
        spin: false,
      }
    case 'conflict':
      return { icon: 'i-lucide-git-compare', text: 'Conflict', class: 'text-warning', spin: false }
    default:
      return null
  }
})
</script>

<template>
  <span
    v-if="display"
    class="hidden items-center gap-1.5 text-xs sm:flex"
    :class="display.class"
    aria-live="polite"
    data-testid="save-status"
  >
    <UIcon :name="display.icon" class="size-3.5" :class="display.spin && 'animate-spin'" />
    {{ display.text }}
  </span>
</template>
