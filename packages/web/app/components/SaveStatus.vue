<script setup lang="ts">
// Whether the open note is saved ("Saving…", "Saved just now"), at the bottom of the sidebar,
// next to the version: the note page shares its document's status (useOpenNoteSave), read here
// so that a change of it redraws this alone, not the sidebar. Nothing when no note is open.
// Compact (the sidebar collapsed): the icon alone, the text in its tooltip.
import { formatRelative } from '@tandem/shared'
import { useIntervalFn } from '@vueuse/core'

defineProps<{ compact?: boolean }>()
const open = useOpenNoteSave()
// Refreshes "Saved 2 min ago".
const now = ref(Date.now())
useIntervalFn(() => (now.value = Date.now()), 30_000)

const display = computed(() => {
  switch (open.value?.status) {
    case 'pending':
    case 'saving':
      return { icon: 'i-lucide-loader-circle', text: 'Saving…', class: 'text-muted', spin: true }
    case 'saved':
      return {
        icon: 'i-lucide-cloud-check',
        text: open.value?.savedAt
          ? `Saved ${formatRelative(open.value.savedAt, now.value)}`
          : 'Saved',
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
  <UTooltip v-if="display" :text="display.text" :disabled="!compact">
    <span
      class="flex min-w-0 items-center gap-1.5 text-xs"
      :class="display.class"
      aria-live="polite"
      :aria-label="compact ? display.text : undefined"
      data-testid="save-status"
    >
      <UIcon
        :name="display.icon"
        class="size-3.5 shrink-0"
        :class="display.spin && 'animate-spin'"
      />
      <span v-if="!compact" class="truncate">{{ display.text }}</span>
    </span>
  </UTooltip>
</template>
